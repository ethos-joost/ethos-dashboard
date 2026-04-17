/**
 * Zerion-based scan: EVM tokens + DeFi positions + NFT floors + spam filter.
 * Hyperliquid L1 is NOT covered — use enrich-hyperliquid.mjs separately.
 *
 * Free tier: 2K requests/day, 10 RPS.
 * Each wallet = 1 portfolio call + 1 positions call (for spam filtering).
 *
 * Usage:
 *   node scripts/scan-zerion.mjs                           # 1600+ bracket
 *   node scripts/scan-zerion.mjs --bracket=low             # 1200-1300
 *   node scripts/scan-zerion.mjs --bracket=low --top=100   # top 100 of 1200-1300
 *   node scripts/scan-zerion.mjs --max=500                 # limit
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { readFileSync, writeFileSync } from "fs";
import pg from "pg";
const { Pool } = pg;

const EXPORT_PATH = "src/data/profiles-export.json";
const ZERION_KEY = process.env.ZERION_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;

if (!ZERION_KEY) {
  console.error("Missing ZERION_API_KEY in .env.local");
  process.exit(1);
}

const supabasePool = SUPABASE_URL
  ? new Pool({ connectionString: SUPABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 })
  : null;

if (supabasePool) console.log("Supabase backup enabled.");
else console.warn("No SUPABASE_URL — writing to JSON only.");

const AUTH = "Basic " + Buffer.from(ZERION_KEY + ":").toString("base64");
// Builder tier: 250K/month, 50 RPS
// 20 workers × 100ms delay = ~40 actual req/s
const CONCURRENCY = 20;
const DELAY_MS = 100;

const bracketArg = process.argv.find((a) => a.startsWith("--bracket="))?.split("=")[1] ?? "1600";
const maxArg = parseInt(process.argv.find((a) => a.startsWith("--max="))?.split("=")[1] ?? "0") || Infinity;
const topArg = parseInt(process.argv.find((a) => a.startsWith("--top="))?.split("=")[1] ?? "0");

let dailyRemaining = Infinity;

async function fetchJson(url) {
  // Stop before hitting daily limit (keep 50 buffer)
  if (dailyRemaining <= 50) {
    console.error(`\n⚠️  Stopping: only ${dailyRemaining} daily requests left. Run again tomorrow.`);
    process.exit(0);
  }

  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const res = await fetch(url, {
        headers: { accept: "application/json", authorization: AUTH },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      // Track remaining daily quota
      const remaining = res.headers.get("ratelimit-org-day-remaining");
      if (remaining !== null) dailyRemaining = parseInt(remaining);

      if (res.status === 429) {
        // Back off based on reset header
        const reset = parseInt(res.headers.get("ratelimit-org-second-reset") ?? "2");
        console.warn(`\n  Rate limited, waiting ${reset}s...`);
        await delay(reset * 1000);
        continue;
      }
      if (!res.ok) {
        if (res.status >= 500 && attempt < MAX_ATTEMPTS - 1) {
          await delay(backoffDelay(attempt));
          continue;
        }
        return null;
      }
      return await res.json();
    } catch {
      if (attempt === MAX_ATTEMPTS - 1) return null;
      await delay(backoffDelay(attempt));
    }
  }
  return null;
}

// Exponential backoff with jitter: 1s, 2s, 4s, 8s (capped at 16s) ±25%
function backoffDelay(attempt) {
  const base = Math.min(1000 * 2 ** attempt, 16000);
  const jitter = base * 0.25 * (Math.random() * 2 - 1);
  return Math.round(base + jitter);
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWalletTotal(address) {
  // Portfolio endpoint — gives us total across all chains + DeFi
  const portfolio = await fetchJson(
    `https://api.zerion.io/v1/wallets/${address}/portfolio?currency=usd&filter%5Bpositions%5D=no_filter`
  );
  await delay(DELAY_MS);

  const attr = portfolio?.data?.attributes ?? {};
  const types = attr.positions_distribution_by_type ?? {};
  const chains = attr.positions_distribution_by_chain ?? {};

  // Net value: wallet + deposited + staked + locked - borrowed
  const wallet = types.wallet ?? 0;
  const deposited = types.deposited ?? 0;
  const staked = types.staked ?? 0;
  const locked = types.locked ?? 0;
  const borrowed = types.borrowed ?? 0;
  const reward = types.reward ?? 0;
  const investment = types.investment ?? 0;

  // Use Zerion's own total which handles netting
  const total = attr.total?.positions ?? 0;

  // Net DeFi equity: what the user actually has at work in DeFi,
  // after subtracting anything they've borrowed against their collateral.
  const defiNet = Math.max(0, deposited + staked + locked + reward + investment - Math.abs(borrowed));

  return {
    total,
    wallet,
    defi: defiNet,
    borrowed: Math.abs(borrowed),
    chains,
  };
}

async function getNftTotal(address) {
  const data = await fetchJson(
    `https://api.zerion.io/v1/wallets/${address}/nft-positions?currency=usd`
  );
  await delay(DELAY_MS);

  let total = 0;
  for (const p of data?.data ?? []) {
    const val = parseFloat(p.attributes?.value ?? "0");
    if (val > 0 && isFinite(val)) total += val;
  }
  return total;
}

async function main() {
  const data = JSON.parse(readFileSync(EXPORT_PATH, "utf-8"));

  let targets;
  if (bracketArg === "all") {
    targets = data.profiles.filter((p) => p.score >= 1200);
  } else if (bracketArg === "low") {
    targets = data.profiles.filter((p) => p.score >= 1200 && p.score < 1300);
  } else if (bracketArg === "mid") {
    targets = data.profiles.filter((p) => p.score >= 1300 && p.score < 1600);
  } else {
    targets = data.profiles.filter((p) => p.score >= 1600);
  }

  if (topArg > 0) {
    targets = [...targets].sort((a, b) => (b.holdingsUSD ?? 0) - (a.holdingsUSD ?? 0)).slice(0, topArg);
  }
  if (maxArg < targets.length) targets = targets.slice(0, maxArg);

  // Skip already Zerion-scanned profiles (resume support)
  const skipDone = !process.argv.includes("--all");
  if (skipDone) {
    const before = targets.length;
    targets = targets.filter((p) => p.scanSource !== "zerion");
    if (before - targets.length > 0) console.log(`Skipping ${before - targets.length} already scanned.`);
  }

  const totalWallets = targets.reduce((s, p) => s + p.addresses.length, 0);
  const totalCalls = totalWallets * 2;
  console.log(`Scanning ${targets.length} profiles (${totalWallets} wallets, ~${totalCalls} API calls).`);

  if (totalCalls > 250000) {
    console.warn(`⚠️  Exceeds monthly limit of 250K. May need to split across months.`);
  }

  let done = 0;
  let apiCalls = 0;
  const startTime = Date.now();
  const queue = [...targets];
  const supabaseQueue = [];
  let supabaseFlushing = Promise.resolve();

  function flushSupabase() {
    const batch = supabaseQueue.splice(0);
    if (batch.length === 0) return;
    supabaseFlushing = supabaseFlushing.then(async () => {
      try {
        for (const p of batch) await upsertToSupabase(p);
      } catch (err) {
        console.error(`\n  Supabase batch error:`, err.message);
      }
    });
  }

  async function worker() {
    while (queue.length > 0) {
      const profile = queue.shift();
      try {
        let evmTotal = 0;
        let defiTotal = 0;
        let nftTotal = 0;

        for (const addr of profile.addresses) {
          const result = await getWalletTotal(addr);
          apiCalls++;
          evmTotal += result.total;
          defiTotal += result.defi;

          const nfts = await getNftTotal(addr);
          apiCalls++;
          nftTotal += nfts;
        }

        // Preserve existing Hyperliquid data (HyperEVM is covered by Zerion's evmTotal)
        const hl = profile.holdingsHyperliquid ?? 0;

        profile.holdingsEvm = Math.round(evmTotal * 100) / 100;
        profile.holdingsDefi = Math.round(defiTotal * 100) / 100;
        profile.holdingsNfts = Math.round(nftTotal * 100) / 100;
        profile.holdingsUSD = Math.round((evmTotal + nftTotal + hl) * 100) / 100;
        profile.scanSource = "zerion";

        // Queue Supabase backup (non-blocking)
        if (supabasePool) {
          supabaseQueue.push({ ...profile });
          if (supabaseQueue.length >= 20) flushSupabase();
        }

        done++;
        if (done % 5 === 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = done / elapsed;
          const remaining = (targets.length - done) / rate;
          process.stdout.write(
            `\r  ${done}/${targets.length} (${rate.toFixed(1)}/s, ${apiCalls} calls, ~${(remaining / 60).toFixed(0)}min remaining)  `
          );
        }

        // Save JSON every 10 profiles (frequent saves to prevent data loss)
        if (done % 10 === 0) {
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

  // Flush remaining Supabase queue
  if (supabasePool) {
    flushSupabase();
    await supabaseFlushing;
    await supabasePool.end();
  }

  console.log(
    `\nDone! ${done} profiles, ${apiCalls} API calls in ${((Date.now() - startTime) / 60000).toFixed(1)}min.`
  );
}

async function upsertToSupabase(p) {
  const client = await supabasePool.connect();
  try {
    await client.query(
      `INSERT INTO profiles (
         profile_id, score, display_name, addresses,
         holdings_usd, holdings_evm, holdings_defi, holdings_nfts,
         holdings_hyperliquid, scan_source,
         vouch_given_eth, vouch_given_count, vouch_received_eth, vouch_received_count,
         reviews_positive, reviews_neutral, reviews_negative,
         human_verified, xp_total, influence_factor, influence_factor_percentile,
         updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW())
       ON CONFLICT (profile_id) DO UPDATE SET
         score = EXCLUDED.score, display_name = EXCLUDED.display_name, addresses = EXCLUDED.addresses,
         holdings_usd = EXCLUDED.holdings_usd, holdings_evm = EXCLUDED.holdings_evm,
         holdings_defi = EXCLUDED.holdings_defi, holdings_nfts = EXCLUDED.holdings_nfts,
         holdings_hyperliquid = EXCLUDED.holdings_hyperliquid,
         scan_source = EXCLUDED.scan_source,
         vouch_given_eth = EXCLUDED.vouch_given_eth, vouch_given_count = EXCLUDED.vouch_given_count,
         vouch_received_eth = EXCLUDED.vouch_received_eth, vouch_received_count = EXCLUDED.vouch_received_count,
         reviews_positive = EXCLUDED.reviews_positive, reviews_neutral = EXCLUDED.reviews_neutral,
         reviews_negative = EXCLUDED.reviews_negative, human_verified = EXCLUDED.human_verified,
         xp_total = EXCLUDED.xp_total, influence_factor = EXCLUDED.influence_factor,
         influence_factor_percentile = EXCLUDED.influence_factor_percentile, updated_at = NOW()`,
      [
        p.profileId, p.score, p.displayName, p.addresses,
        p.holdingsUSD, p.holdingsEvm ?? 0, p.holdingsDefi ?? 0, p.holdingsNfts ?? 0,
        p.holdingsHyperliquid ?? 0, p.scanSource ?? "zerion",
        p.vouchGivenEth ?? 0, p.vouchGivenCount ?? 0, p.vouchReceivedEth ?? 0, p.vouchReceivedCount ?? 0,
        p.reviewsPositive ?? 0, p.reviewsNeutral ?? 0, p.reviewsNegative ?? 0,
        p.humanVerified ?? false, p.xpTotal ?? 0, p.influenceFactor ?? 0, p.influenceFactorPercentile ?? 0,
      ]
    );
  } finally {
    client.release();
  }
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
