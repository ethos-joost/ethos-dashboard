/**
 * One-shot rescan for leveraged profiles whose stored holdings_defi
 * was computed with the pre-fix gross formula (deposited + staked + locked
 * without subtracting borrowed).
 *
 * Targets only profiles where gross DeFi already exceeds net EVM total —
 * the cases where the current value definitely overstates real DeFi equity.
 *
 * Run: node scripts/rescan-leveraged.mjs
 */

import pg from "pg";

const SUPABASE_URL = process.env.SUPABASE_URL;
const ZERION_API_KEY = process.env.ZERION_API_KEY;
if (!SUPABASE_URL || !ZERION_API_KEY) {
  console.error("SUPABASE_URL and ZERION_API_KEY must be set");
  process.exit(1);
}

const AUTH = "Basic " + Buffer.from(ZERION_API_KEY + ":").toString("base64");
const DELAY_MS = 100;
const CONCURRENCY = 10;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/json", authorization: AUTH },
      });
      if (res.status === 429) {
        const reset = parseInt(res.headers.get("ratelimit-org-second-reset") ?? "2");
        await delay(reset * 1000);
        continue;
      }
      if (!res.ok) {
        if (res.status >= 500 && attempt < 4) {
          await delay(1000 * 2 ** attempt);
          continue;
        }
        return null;
      }
      return await res.json();
    } catch {
      if (attempt === 4) return null;
      await delay(1000 * 2 ** attempt);
    }
  }
  return null;
}

async function getWalletTotal(address) {
  const portfolio = await fetchJson(
    `https://api.zerion.io/v1/wallets/${address}/portfolio?currency=usd&filter%5Bpositions%5D=no_filter`,
  );
  await delay(DELAY_MS);

  const attr = portfolio?.data?.attributes ?? {};
  const types = attr.positions_distribution_by_type ?? {};

  const deposited = types.deposited ?? 0;
  const staked = types.staked ?? 0;
  const locked = types.locked ?? 0;
  const borrowed = Math.abs(types.borrowed ?? 0);
  const reward = types.reward ?? 0;
  const investment = types.investment ?? 0;

  const total = attr.total?.positions ?? 0;
  const defiNet = Math.max(0, deposited + staked + locked + reward + investment - borrowed);

  return { total, defi: defiNet };
}

async function main() {
  const pool = new pg.Pool({
    connectionString: SUPABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 4,
  });

  const { rows: targets } = await pool.query(
    `SELECT profile_id, display_name, addresses, holdings_usd, holdings_defi, holdings_nfts, holdings_hyperliquid
       FROM profiles
      WHERE holdings_defi > holdings_evm AND holdings_defi > 1000
      ORDER BY holdings_defi DESC`,
  );

  console.log(`Rescanning ${targets.length} leveraged profiles…\n`);

  const start = Date.now();
  let done = 0;
  let apiCalls = 0;
  const queue = [...targets];

  async function worker() {
    while (queue.length > 0) {
      const p = queue.shift();
      if (!p) return;

      try {
        let evmTotal = 0;
        let defiTotal = 0;
        for (const addr of p.addresses) {
          const r = await getWalletTotal(addr);
          apiCalls++;
          evmTotal += r.total;
          defiTotal += r.defi;
        }

        const hl = parseFloat(p.holdings_hyperliquid ?? "0");
        const nfts = parseFloat(p.holdings_nfts ?? "0");
        const newTotal = Math.round((evmTotal + nfts + hl) * 100) / 100;
        const newDefi = Math.round(defiTotal * 100) / 100;
        const newEvm = Math.round(evmTotal * 100) / 100;

        const oldTotal = parseFloat(p.holdings_usd);
        const oldDefi = parseFloat(p.holdings_defi);

        await pool.query(
          `UPDATE profiles
              SET holdings_usd = $1, holdings_evm = $2, holdings_defi = $3, updated_at = NOW()
            WHERE profile_id = $4`,
          [newTotal, newEvm, newDefi, p.profile_id],
        );

        done++;
        if (done % 10 === 0 || done === targets.length) {
          const elapsed = (Date.now() - start) / 1000;
          const rate = done / elapsed;
          const remaining = (targets.length - done) / rate;
          process.stdout.write(
            `\r  ${done}/${targets.length} (${rate.toFixed(1)}/s, ${apiCalls} calls, ~${remaining.toFixed(0)}s remaining)  `,
          );
        }

        if (oldDefi - newDefi > 10_000 || oldTotal - newTotal > 10_000) {
          console.log(
            `\n    ${p.display_name ?? "#" + p.profile_id}: ` +
              `defi $${oldDefi.toLocaleString()} -> $${newDefi.toLocaleString()}, ` +
              `total $${oldTotal.toLocaleString()} -> $${newTotal.toLocaleString()}`,
          );
        }
      } catch (err) {
        console.error(`\nError on ${p.profile_id}:`, err.message);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log(
    `\n\nDone. ${done}/${targets.length} rescanned, ${apiCalls} API calls in ${((Date.now() - start) / 1000).toFixed(0)}s.`,
  );

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
