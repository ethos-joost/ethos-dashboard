/**
 * Prebuild script: fetches all profile data from Supabase and writes
 * to src/data/profiles-export.json for the Next.js static build.
 *
 * Runs automatically via `npm run build` (prebuild hook).
 * The JSON file is gitignored — Supabase is the source of truth.
 */

import pg from "pg";
import { writeFileSync, mkdirSync } from "fs";

const { Pool } = pg;
const EXPORT_PATH = "src/data/profiles-export.json";
const SUPABASE_URL = process.env.SUPABASE_URL;

if (!SUPABASE_URL) {
  console.warn("⚠️  No SUPABASE_URL — using existing local JSON if available.");
  process.exit(0);
}

async function main() {
  const pool = new Pool({
    connectionString: SUPABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });

  console.log("Fetching profiles from Supabase...");
  const { rows } = await pool.query(`
    SELECT * FROM profiles ORDER BY score DESC
  `);

  const profiles = rows.map((r) => ({
    profileId: r.profile_id,
    score: r.score,
    displayName: r.display_name,
    addresses: r.addresses,
    holdingsUSD: parseFloat(r.holdings_usd),
    holdingsEvm: parseFloat(r.holdings_evm),
    holdingsDefi: parseFloat(r.holdings_defi ?? "0"),
    holdingsNfts: parseFloat(r.holdings_nfts),
    holdingsHyperliquid: parseFloat(r.holdings_hyperliquid),
    holdingsHyperEvm: parseFloat(r.holdings_hyperevm ?? "0"),
    scanSource: r.scan_source,
    vouchGivenEth: parseFloat(r.vouch_given_eth ?? "0"),
    vouchGivenCount: r.vouch_given_count,
    vouchReceivedEth: parseFloat(r.vouch_received_eth ?? "0"),
    vouchReceivedCount: r.vouch_received_count,
    reviewsPositive: r.reviews_positive,
    reviewsNeutral: r.reviews_neutral,
    reviewsNegative: r.reviews_negative,
    humanVerified: r.human_verified,
    xpTotal: r.xp_total,
    influenceFactor: r.influence_factor,
    influenceFactorPercentile: parseFloat(r.influence_factor_percentile ?? "0"),
    updatedAt: r.updated_at?.toISOString(),
  }));

  mkdirSync("src/data", { recursive: true });

  const data = {
    exportedAt: new Date().toISOString(),
    lastIngestedAt: new Date().toISOString(),
    profileCount: profiles.length,
    profiles,
  };

  writeFileSync(EXPORT_PATH, JSON.stringify(data, null, 2));
  console.log(`Wrote ${profiles.length} profiles to ${EXPORT_PATH}`);

  await pool.end();
}

main().catch((err) => {
  console.error("Prebuild fetch failed:", err.message);
  console.warn("Falling back to existing local JSON.");
  process.exit(0); // Don't fail the build
});
