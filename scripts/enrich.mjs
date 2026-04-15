/**
 * Enriches profiles-export.json with Ethos engagement/trust metrics from Postgres.
 * No Alchemy/Etherscan calls — just DB reads.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { Pool } from "pg";
import { readFileSync, writeFileSync } from "fs";

const EXPORT_PATH = "src/data/profiles-export.json";
const PG_URL = process.env.POSTGRES_URL;

if (!PG_URL) {
  console.error("Missing POSTGRES_URL");
  process.exit(1);
}

async function main() {
  const data = JSON.parse(readFileSync(EXPORT_PATH, "utf-8"));
  const profileIds = data.profiles.map((p) => p.profileId);
  console.log(`Enriching ${profileIds.length} profiles...`);

  const pool = new Pool({ connectionString: PG_URL, ssl: false });
  const client = await pool.connect();

  // Fetch in chunks to avoid giant IN() clause
  const enrichMap = new Map();
  const chunkSize = 5000;

  for (let i = 0; i < profileIds.length; i += chunkSize) {
    const chunk = profileIds.slice(i, i + chunkSize);
    const res = await client.query(
      `
        SELECT
          profile_id,
          vouch_given_amount_wei_total,
          vouch_given_count,
          vouch_received_amount_wei_total,
          vouch_received_count,
          review_received_positive_count,
          review_received_neutral_count,
          review_received_negative_count,
          human_verification_status,
          xp_total,
          influence_factor,
          influence_factor_percentile
        FROM users
        WHERE profile_id = ANY($1)
      `,
      [chunk],
    );

    for (const row of res.rows) {
      // Convert wei to ETH (divide by 1e18)
      const vouchGivenEth = Number(BigInt(row.vouch_given_amount_wei_total ?? "0")) / 1e18;
      const vouchReceivedEth = Number(BigInt(row.vouch_received_amount_wei_total ?? "0")) / 1e18;

      enrichMap.set(row.profile_id, {
        vouchGivenEth: Math.round(vouchGivenEth * 10000) / 10000,
        vouchGivenCount: row.vouch_given_count ?? 0,
        vouchReceivedEth: Math.round(vouchReceivedEth * 10000) / 10000,
        vouchReceivedCount: row.vouch_received_count ?? 0,
        reviewsPositive: row.review_received_positive_count ?? 0,
        reviewsNeutral: row.review_received_neutral_count ?? 0,
        reviewsNegative: row.review_received_negative_count ?? 0,
        humanVerified: row.human_verification_status === "VERIFIED",
        xpTotal: row.xp_total ?? 0,
        influenceFactor: row.influence_factor ?? 0,
        influenceFactorPercentile: row.influence_factor_percentile ?? 0,
      });
    }

    console.log(`  ${Math.min(i + chunkSize, profileIds.length)}/${profileIds.length}`);
  }

  client.release();
  await pool.end();

  // Merge into profiles
  let enrichedCount = 0;
  for (const profile of data.profiles) {
    const extra = enrichMap.get(profile.profileId);
    if (extra) {
      Object.assign(profile, extra);
      enrichedCount++;
    }
  }

  console.log(`Enriched ${enrichedCount}/${data.profiles.length} profiles.`);

  data.exportedAt = new Date().toISOString();
  writeFileSync(EXPORT_PATH, JSON.stringify(data, null, 2));
  console.log("Saved.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
