/**
 * Enriches Supabase profiles with Hyperliquid L1 holdings (perps + spot).
 * Does NOT touch holdings_evm/defi/nfts — only updates:
 *   - holdings_hyperliquid (perps accountValue + spot balances)
 *   - holdings_usd (adds HL delta to existing total)
 *
 * HyperEVM is already covered by Zerion, so we skip it here.
 *
 * Run: npm run enrich:hyperliquid
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import pg from "pg";
const { Pool } = pg;

const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) { console.error("Missing SUPABASE_URL"); process.exit(1); }

const CONCURRENCY = 10;
let hypePrice = 0;
let hlSpotMeta = null;
let hlAllMids = null;

async function loadHlData() {
  const [meta, mids] = await Promise.all([
    fetch("https://api.hyperliquid.xyz/info", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "spotMeta" }),
    }).then((r) => r.json()),
    fetch("https://api.hyperliquid.xyz/info", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "allMids" }),
    }).then((r) => r.json()),
  ]);
  hlSpotMeta = meta;
  hlAllMids = mids ?? {};
  hypePrice = parseFloat(hlAllMids["HYPE"] ?? "0");
  console.log(`HYPE price: $${hypePrice.toFixed(2)}`);
}

async function getHyperliquidUSD(address) {
  try {
    const [perps, spot] = await Promise.all([
      fetch("https://api.hyperliquid.xyz/info", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "clearinghouseState", user: address }),
      }).then((r) => r.json()),
      fetch("https://api.hyperliquid.xyz/info", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "spotClearinghouseState", user: address }),
      }).then((r) => r.json()),
    ]);

    let total = 0;
    const perpsVal = parseFloat(perps?.marginSummary?.accountValue ?? "0");
    if (isFinite(perpsVal) && perpsVal > 0) total += perpsVal;

    for (const b of spot?.balances ?? []) {
      const amount = parseFloat(b.total ?? "0");
      if (!amount) continue;
      const coin = b.coin;
      if (coin === "USDC") { total += amount; continue; }
      const tokens = hlSpotMeta?.tokens ?? [];
      const universe = hlSpotMeta?.universe ?? [];
      const idx = tokens.findIndex((t) => t?.name === coin);
      if (idx >= 0) {
        const pair = universe.find((p) => p.tokens?.[0] === idx && p.tokens?.[1] === 0);
        if (pair?.index !== undefined) {
          const mid = parseFloat(hlAllMids[`@${pair.index}`] ?? "0");
          if (mid > 0) { total += amount * mid; continue; }
        }
      }
      const direct = parseFloat(hlAllMids[coin] ?? "0");
      if (direct > 0) total += amount * direct;
    }
    return total;
  } catch { return 0; }
}

async function main() {
  await loadHlData();

  const pool = new Pool({ connectionString: SUPABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 });

  // Fetch all profiles from Supabase
  const { rows } = await pool.query("SELECT profile_id, addresses, holdings_usd, holdings_hyperliquid FROM profiles ORDER BY score DESC");
  console.log(`Enriching ${rows.length} profiles from Supabase...`);

  const queue = [...rows];
  let done = 0;
  let totalHlFound = 0;
  const startTime = Date.now();

  async function worker() {
    while (queue.length > 0) {
      const row = queue.shift();
      try {
        let hlTotal = 0;
        for (const addr of row.addresses) {
          hlTotal += await getHyperliquidUSD(addr);
        }
        hlTotal = Math.round(hlTotal * 100) / 100;

        // Only update if HL value changed
        const prevHl = parseFloat(row.holdings_hyperliquid ?? "0") || 0;
        if (Math.abs(hlTotal - prevHl) > 0.01) {
          const prevTotal = parseFloat(row.holdings_usd ?? "0") || 0;
          const newTotal = Math.max(0, Math.round((prevTotal - prevHl + hlTotal) * 100) / 100);

          const client = await pool.connect();
          try {
            await client.query(
              "UPDATE profiles SET holdings_hyperliquid = $1, holdings_usd = $2, updated_at = NOW() WHERE profile_id = $3",
              [hlTotal, newTotal, row.profile_id]
            );
          } finally { client.release(); }
        }

        if (hlTotal > 0) totalHlFound++;
        done++;

        if (done % 100 === 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = done / elapsed;
          const remaining = (rows.length - done) / rate;
          process.stdout.write(
            `\r  ${done}/${rows.length} (${rate.toFixed(1)}/s, ~${(remaining / 60).toFixed(0)}min remaining, HL:${totalHlFound})  `
          );
        }
      } catch (err) {
        console.error(`\nError on ${row.profile_id}:`, err.message);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  await pool.end();

  console.log(`\nDone! ${done} profiles. ${totalHlFound} with Hyperliquid. Took ${((Date.now() - startTime) / 60000).toFixed(1)}min.`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
