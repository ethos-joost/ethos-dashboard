/**
 * Ingestion script: fetches Ethos profiles from Postgres and their on-chain
 * holdings via Etherscan (free) + Alchemy, then writes to the JSON export.
 *
 * Usage:
 *   node scripts/ingest.mjs                  # ingest missing profiles only
 *   node scripts/ingest.mjs --all            # re-ingest everything
 *   node scripts/ingest.mjs --concurrency=5  # set Alchemy concurrency
 *
 * Fetches score ranges: 1200-1300, 1301-1599, 1600+
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { Pool } from "pg";
import { readFileSync, writeFileSync, existsSync } from "fs";

const EXPORT_PATH = "src/data/profiles-export.json";
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY;
const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY;
const PG_URL = process.env.POSTGRES_URL;

const CONCURRENCY = parseInt(
  process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? "3"
);
const RE_INGEST_ALL = process.argv.includes("--all");

if (!ALCHEMY_KEY || !PG_URL) {
  console.error("Missing ALCHEMY_API_KEY or POSTGRES_URL in .env.local");
  process.exit(1);
}

// ---- Caches ----
const decimalsCache = new Map();
const tokenPriceCache = new Map();
let ethPriceCache = null;

// ---- Load existing data ----
function loadExisting() {
  if (!existsSync(EXPORT_PATH)) return new Map();
  const data = JSON.parse(readFileSync(EXPORT_PATH, "utf-8"));
  const map = new Map();
  for (const p of data.profiles) {
    map.set(p.profileId, p);
  }
  return map;
}

// ---- Postgres ----
async function fetchProfiles(pool) {
  const client = await pool.connect();
  try {
    // Score ranges: 1200-1300, 1301-1599, 1600+
    const res = await client.query(`
      SELECT u.id as user_id, u.profile_id, u.score, u.display_name, pa.address
      FROM users u
      JOIN profile_addresses pa ON pa."profileId" = u.profile_id
      WHERE u.profile_id IS NOT NULL
        AND u.score >= 1200
      ORDER BY u.score DESC
    `);

    const userMap = new Map();
    for (const row of res.rows) {
      if (!userMap.has(row.profile_id)) {
        userMap.set(row.profile_id, {
          profileId: row.profile_id,
          score: row.score,
          displayName: row.display_name ?? "",
          addresses: [],
        });
      }
      const addr = String(row.address);
      if (addr.startsWith("0x")) {
        userMap.get(row.profile_id).addresses.push(addr);
      }
    }

    return Array.from(userMap.values()).filter((p) => p.addresses.length > 0);
  } finally {
    client.release();
  }
}

// ---- Etherscan batched ETH balance (free, 20 per call) ----
async function batchEthBalances(addresses) {
  const results = new Map();
  for (let i = 0; i < addresses.length; i += 20) {
    const batch = addresses.slice(i, i + 20);
    try {
      const res = await fetchRetry(
        `https://api.etherscan.io/v2/api?chainid=1&module=account&action=balancemulti&address=${batch.join(",")}&tag=latest&apikey=${ETHERSCAN_KEY}`
      );
      const data = await safeJson(res);
      if (data.status === "1" && Array.isArray(data.result)) {
        for (const entry of data.result) {
          results.set(entry.account.toLowerCase(), BigInt(entry.balance));
        }
      }
    } catch (err) {
      console.error("Etherscan error:", err.message);
    }
    await delay(220); // 5 calls/sec
  }
  return results;
}

// ---- Alchemy ----
async function getEthPrice() {
  if (ethPriceCache && Date.now() - ethPriceCache.ts < 5 * 60 * 1000) {
    return ethPriceCache.price;
  }
  const res = await fetchRetry(
    `https://api.g.alchemy.com/prices/v1/${ALCHEMY_KEY}/tokens/by-symbol?symbols=ETH`
  );
  const data = await safeJson(res);
  const price = parseFloat(data.data?.[0]?.prices?.[0]?.value ?? "0");
  ethPriceCache = { price, ts: Date.now() };
  return price;
}

async function getTokenPrices(tokens) {
  const prices = new Map();
  const toFetch = [];

  for (const t of tokens) {
    const key = `${t.network}:${t.address.toLowerCase()}`;
    const cached = tokenPriceCache.get(key);
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
      prices.set(t.address.toLowerCase(), cached.price);
    } else {
      toFetch.push(t);
    }
  }

  for (let i = 0; i < toFetch.length; i += 25) {
    const batch = toFetch.slice(i, i + 25);
    try {
      const res = await fetchRetry(
        `https://api.g.alchemy.com/prices/v1/${ALCHEMY_KEY}/tokens/by-address`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            addresses: batch.map((t) => ({ network: t.network, address: t.address })),
          }),
        }
      );
      const data = await safeJson(res);
      for (const entry of data.data ?? []) {
        const price = parseFloat(entry.prices?.[0]?.value ?? "0");
        const addr = entry.address.toLowerCase();
        prices.set(addr, price);
        tokenPriceCache.set(`${entry.network}:${addr}`, { price, ts: Date.now() });
      }
    } catch (err) {
      console.error("Price error:", err.message);
    }
  }
  return prices;
}

async function getTokenDecimals(rpcUrl, contractAddress) {
  const key = contractAddress.toLowerCase();
  if (decimalsCache.has(key)) return decimalsCache.get(key);
  const data = await rpc(rpcUrl, "alchemy_getTokenMetadata", [contractAddress]);
  const decimals = data.result?.decimals ?? 18;
  decimalsCache.set(key, decimals);
  return decimals;
}

async function getWalletHoldings(address, ethBalances) {
  let totalUSD = 0;
  const ethPrice = await getEthPrice();

  // Mainnet ETH from Etherscan (pre-fetched)
  const ethWei = ethBalances.get(address.toLowerCase()) ?? 0n;
  totalUSD += Number(ethWei) / 1e18 * ethPrice;

  // Base ETH via Alchemy
  try {
    const baseRpc = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;
    const baseRes = await rpc(baseRpc, "eth_getBalance", [address, "latest"]);
    const baseWei = BigInt(baseRes.result ?? "0x0");
    totalUSD += Number(baseWei) / 1e18 * ethPrice;
  } catch { /* skip */ }

  // ERC-20 on both chains
  for (const chain of ["eth-mainnet", "base-mainnet"]) {
    try {
      const rpcUrl = `https://${chain}.g.alchemy.com/v2/${ALCHEMY_KEY}`;
      const tokenRes = await rpc(rpcUrl, "alchemy_getTokenBalances", [address, "erc20"]);
      const balances = tokenRes.result?.tokenBalances ?? [];
      const nonZero = balances.filter(
        (t) => t.tokenBalance && t.tokenBalance !== "0x" + "0".repeat(64)
      );
      if (nonZero.length === 0) continue;

      const tokenAddrs = nonZero.map((t) => ({ address: t.contractAddress, network: chain }));
      const prices = await getTokenPrices(tokenAddrs);

      // Top 5 by estimated value
      const ranked = nonZero
        .map((t) => ({ ...t, price: prices.get(t.contractAddress.toLowerCase()) ?? 0 }))
        .filter((t) => t.price > 0)
        .map((t) => ({ ...t, est: (Number(BigInt(t.tokenBalance)) / 1e18) * t.price }))
        .sort((a, b) => b.est - a.est)
        .slice(0, 5);

      for (const token of ranked) {
        const decimals = await getTokenDecimals(
          `https://${chain}.g.alchemy.com/v2/${ALCHEMY_KEY}`,
          token.contractAddress
        );
        const balance = Number(BigInt(token.tokenBalance)) / Math.pow(10, decimals);
        totalUSD += balance * token.price;
      }
    } catch { /* skip */ }
  }

  return isFinite(totalUSD) ? totalUSD : 0;
}

// ---- Batch processing ----
async function batchGetHoldings(addresses, ethBalances) {
  const results = new Map();
  const queue = [...addresses];

  async function worker() {
    while (queue.length > 0) {
      const address = queue.shift();
      const usd = await getWalletHoldings(address, ethBalances);
      results.set(address, usd);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return results;
}

// ---- Helpers ----
async function rpc(url, method, params) {
  const res = await fetchRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return safeJson(res);
}

async function fetchRetry(url, opts, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok || i === retries) return res;
      if (res.status === 429 || res.status >= 500) {
        await delay(1000 * (i + 1) * (res.status === 429 ? 2 : 1));
        continue;
      }
      return res;
    } catch (err) {
      if (i === retries) throw err;
      await delay(1000 * (i + 1));
    }
  }
}

// Safe JSON parse for API responses that might return errors
async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { result: null, data: null };
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- Main ----
async function main() {
  const pool = new Pool({ connectionString: PG_URL, ssl: false });

  console.log("Fetching profiles from Postgres (score >= 1200)...");
  const allProfiles = await fetchProfiles(pool);
  await pool.end();

  console.log(`Found ${allProfiles.length} profiles.`);
  const byRange = {
    "1200-1300": allProfiles.filter((p) => p.score >= 1200 && p.score < 1300).length,
    "1301-1599": allProfiles.filter((p) => p.score >= 1301 && p.score < 1600).length,
    "1600+": allProfiles.filter((p) => p.score >= 1600).length,
  };
  console.log("  1200-1300:", byRange["1200-1300"]);
  console.log("  1301-1599:", byRange["1301-1599"]);
  console.log("  1600+:", byRange["1600+"]);

  // Load existing and determine what to ingest
  const existing = loadExisting();
  console.log(`Existing profiles in export: ${existing.size}`);

  const toIngest = RE_INGEST_ALL
    ? allProfiles
    : allProfiles.filter((p) => !existing.has(p.profileId) || (existing.get(p.profileId).holdingsUSD ?? 0) === 0);

  console.log(`Profiles to ingest: ${toIngest.length}`);
  if (toIngest.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  // Process in batches of 200
  const BATCH_SIZE = 200;
  let ingested = 0;

  for (let i = 0; i < toIngest.length; i += BATCH_SIZE) {
    const batch = toIngest.slice(i, i + BATCH_SIZE);

    const addressSet = new Set();
    for (const p of batch) {
      for (const addr of p.addresses) addressSet.add(addr);
    }
    const addresses = Array.from(addressSet);

    console.log(
      `[${ingested}/${toIngest.length}] Fetching holdings for ${addresses.length} addresses (${batch.length} profiles)...`
    );

    // Etherscan batch for mainnet ETH
    const ethBalances = await batchEthBalances(addresses);

    // Alchemy for tokens + Base
    const holdings = await batchGetHoldings(addresses, ethBalances);

    // Update profiles
    for (const p of batch) {
      let holdingsUSD = 0;
      for (const addr of p.addresses) {
        holdingsUSD += holdings.get(addr) ?? 0;
      }
      existing.set(p.profileId, {
        profileId: p.profileId,
        score: p.score,
        displayName: p.displayName,
        addresses: p.addresses,
        holdingsUSD: Math.round(holdingsUSD * 100) / 100,
        updatedAt: new Date().toISOString(),
      });
    }

    ingested += batch.length;
    const batchTotal = batch.reduce((s, p) => s + (existing.get(p.profileId)?.holdingsUSD ?? 0), 0);
    console.log(
      `[${ingested}/${toIngest.length}] Done ($${batchTotal.toLocaleString()} in batch).`
    );

    // Save after each batch so we don't lose progress
    saveExport(existing);
  }

  console.log(`\nDone! Total profiles: ${existing.size}`);
}

function saveExport(profileMap) {
  const profiles = Array.from(profileMap.values()).sort((a, b) => b.score - a.score);
  const data = {
    exportedAt: new Date().toISOString(),
    lastIngestedAt: new Date().toISOString(),
    profileCount: profiles.length,
    profiles,
  };
  writeFileSync(EXPORT_PATH, JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
