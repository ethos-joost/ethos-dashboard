/**
 * Ingestion script: fetches Ethos profiles in the 1200-1300 and 1600+ score
 * brackets from Postgres, then fetches on-chain holdings via Etherscan + Alchemy.
 *
 * Run with: deno task ingest
 *
 * Options:
 *   --skip-existing  Skip profiles already in Deno KV with holdings > 0
 *   --concurrency=N  Alchemy request concurrency (default: 3)
 */

import { load } from "@std/dotenv";
await load({ export: true, envPath: ".env.local" });

import { fetchProfilesBatched, fetchTotalProfileCount } from "../lib/ethos.ts";
import { batchGetHoldings } from "../lib/alchemy.ts";
import { saveProfiles, setMeta, getProfile } from "../lib/db.ts";
import { StoredProfile } from "../lib/types.ts";

const SKIP_EXISTING = Deno.args.includes("--skip-existing");
const CONCURRENCY = parseInt(
  Deno.args.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? "3",
);

async function main() {
  if (!Deno.env.get("ALCHEMY_API_KEY")) {
    console.error("Missing ALCHEMY_API_KEY in .env.local");
    Deno.exit(1);
  }
  if (!Deno.env.get("POSTGRES_URL")) {
    console.error("Missing POSTGRES_URL in .env.local");
    Deno.exit(1);
  }

  const total = await fetchTotalProfileCount();
  console.log(`Found ${total} profiles in brackets 1200-1300 and 1600+.`);
  console.log(`Concurrency: ${CONCURRENCY} | Skip existing: ${SKIP_EXISTING}`);

  let ingested = 0;
  let skipped = 0;
  let withHoldingsTotal = 0;

  for await (const batch of fetchProfilesBatched(200)) {
    const toProcess: typeof batch = [];

    if (SKIP_EXISTING) {
      for (const profile of batch) {
        const existing = await getProfile(profile.profileId);
        if (existing && existing.holdingsUSD > 0) {
          skipped++;
          continue;
        }
        toProcess.push(profile);
      }
    } else {
      toProcess.push(...batch);
    }

    if (toProcess.length === 0) {
      ingested += batch.length;
      console.log(`[${ingested}/${total}] Batch skipped (all existing). Skipped: ${skipped}`);
      continue;
    }

    const addressSet = new Set<string>();
    for (const p of toProcess) {
      for (const addr of p.addresses) addressSet.add(addr);
    }

    console.log(
      `[${ingested}/${total}] Fetching holdings for ${addressSet.size} addresses (${toProcess.length} profiles)...`,
    );

    const holdings = await batchGetHoldings(Array.from(addressSet), CONCURRENCY);

    const storedProfiles: StoredProfile[] = toProcess.map((p) => {
      let holdingsUSD = 0;
      for (const addr of p.addresses) {
        holdingsUSD += holdings.get(addr) ?? 0;
      }
      return {
        profileId: p.profileId,
        score: p.score,
        displayName: p.displayName,
        addresses: p.addresses,
        holdingsUSD: Math.round(holdingsUSD * 100) / 100,
        updatedAt: new Date().toISOString(),
      };
    });

    await saveProfiles(storedProfiles);
    ingested += batch.length;

    const batchWithHoldings = storedProfiles.filter((p) => p.holdingsUSD > 0).length;
    withHoldingsTotal += batchWithHoldings;

    const batchTotal = storedProfiles.reduce((s, p) => s + p.holdingsUSD, 0);
    console.log(
      `[${ingested}/${total}] Saved ${storedProfiles.length} profiles (${batchWithHoldings} with holdings, $${batchTotal.toLocaleString()}). Skipped: ${skipped}`,
    );
  }

  await setMeta("lastIngestedAt", new Date().toISOString());
  console.log(`\nDone! Ingested ${ingested} profiles. ${withHoldingsTotal} with holdings > $0.`);
}

main();
