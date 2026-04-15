/**
 * Deep scan for the 1600+ bracket only.
 *
 * For each profile in the 1600+ bracket:
 *   - Fetches ALL tokens across 11 EVM chains via Alchemy Portfolio API
 *   - Paginates through all pages (catches spam-hit whales too)
 *   - Filters: price > 0, has logo, single-token value ≤ $500K
 *   - Already-added Hyperliquid + HyperEVM data is preserved
 *
 * Writes updated totals directly to profiles-export.json.
 * Only touches 1600+ profiles — leaves 1200-1300 data as-is.
 *
 * Run: node scripts/scan-1600plus.mjs
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { readFileSync, writeFileSync } from "fs";

const EXPORT_PATH = "src/data/profiles-export.json";
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY;
const CONCURRENCY = 5;

const EVM_NETWORKS = [
  "eth-mainnet",
  "base-mainnet",
  "arb-mainnet",
  "opt-mainnet",
  "matic-mainnet",
  "linea-mainnet",
  "blast-mainnet",
  "zksync-mainnet",
  "berachain-mainnet",
  "avax-mainnet",
  "bnb-mainnet",
];

const MAX_TOKEN_VALUE = 500_000; // sanity cap per single token

if (!ALCHEMY_KEY) {
  console.error("Missing ALCHEMY_API_KEY");
  process.exit(1);
}

async function fetchJson(url, opts = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(url, { ...opts, signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) {
          await delay(1000 * (attempt + 1) * (res.status === 429 ? 2 : 1));
          continue;
        }
        return null;
      }
      return await res.json();
    } catch {
      if (attempt === 2) return null;
      await delay(1000 * (attempt + 1));
    }
  }
  return null;
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function scanWallet(addresses) {
  const body = {
    addresses: addresses.map((a) => ({ address: a, networks: EVM_NETWORKS })),
    withMetadata: true,
    withPrices: true,
    includeNativeTokens: true,
  };

  let total = 0;
  let pages = 0;
  let tokensKept = 0;

  for (let page = 0; page < 30; page++) {
    const data = await fetchJson(
      `https://api.g.alchemy.com/data/v1/${ALCHEMY_KEY}/assets/tokens/by-address`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (!data) break;
    pages++;
    const tokens = data?.data?.tokens ?? [];

    for (const t of tokens) {
      const balHex = t.tokenBalance || "0x0";
      if (balHex === "0x" || balHex === "0x0") continue;
      const raw = BigInt(balHex);
      if (raw === 0n) continue;

      const price = parseFloat(t.tokenPrices?.[0]?.value ?? "0");
      if (price === 0) continue;

      const meta = t.tokenMetadata ?? {};
      const decimals = meta.decimals ?? 18;
      const balance = Number(raw) / Math.pow(10, decimals);
      const isNative = !t.tokenAddress;

      // Filter: native always counts, ERC-20 needs logo (Alchemy's trust signal)
      if (!isNative && !meta.logo) continue;

      const value = balance * price;
      if (value > MAX_TOKEN_VALUE) continue; // sanity cap

      total += value;
      tokensKept++;
    }

    const pageKey = data?.data?.pageKey;
    if (!pageKey) break;
    body.pageKey = pageKey;
  }

  return { total, pages, tokensKept };
}

async function main() {
  const data = JSON.parse(readFileSync(EXPORT_PATH, "utf-8"));
  const maxArg = parseInt(process.argv.find((a) => a.startsWith("--max="))?.split("=")[1] ?? "0");
  let targets = data.profiles.filter((p) => p.score >= 1600);
  if (maxArg > 0) targets = targets.slice(0, maxArg);
  console.log(`Scanning ${targets.length} profiles in 1600+ bracket...`);

  const queue = [...targets];
  let done = 0;
  let totalPages = 0;
  const startTime = Date.now();

  async function worker() {
    while (queue.length > 0) {
      const profile = queue.shift();
      try {
        const { total, pages } = await scanWallet(profile.addresses);
        totalPages += pages;

        // Keep HL + HEVM separately, recompute final total
        const hl = profile.holdingsHyperliquid ?? 0;
        const hevm = profile.holdingsHyperEvm ?? 0;
        const evmTotal = Math.round(total * 100) / 100;
        profile.holdingsEvm = evmTotal;
        profile.holdingsUSD = Math.round((evmTotal + hl + hevm) * 100) / 100;

        done++;
        if (done % 10 === 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = done / elapsed;
          const remaining = (targets.length - done) / rate;
          process.stdout.write(
            `\r  ${done}/${targets.length} (${rate.toFixed(1)}/s, avg ${(totalPages / done).toFixed(1)} pages/wallet, ~${remaining.toFixed(0)}s remaining)  `
          );
        }

        // Save every 50 profiles
        if (done % 50 === 0) {
          data.exportedAt = new Date().toISOString();
          writeFileSync(EXPORT_PATH, JSON.stringify(data, null, 2));
        }
      } catch (err) {
        console.error(`\nError on ${profile.profileId}:`, err.message);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  data.exportedAt = new Date().toISOString();
  writeFileSync(EXPORT_PATH, JSON.stringify(data, null, 2));
  console.log(
    `\nDone! ${done} profiles, ${totalPages} total pages (${(totalPages / done).toFixed(1)} avg), took ${((Date.now() - startTime) / 60000).toFixed(1)}min.`
  );
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
