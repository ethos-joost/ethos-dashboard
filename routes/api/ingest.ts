import { Handlers } from "$fresh/server.ts";
import { fetchProfilesBatched, fetchTotalProfileCount } from "../../lib/ethos.ts";
import { batchGetHoldings } from "../../lib/alchemy.ts";
import { saveProfiles, setMeta, getProfile } from "../../lib/db.ts";
import { StoredProfile } from "../../lib/types.ts";

let ingesting = false;
let progress = { ingested: 0, total: 0, status: "idle" as string };

export const handler: Handlers = {
  GET(_req, _ctx) {
    return new Response(JSON.stringify(progress), {
      headers: { "Content-Type": "application/json" },
    });
  },

  async POST(req, _ctx) {
    if (ingesting) {
      return new Response(JSON.stringify({ error: "Already running", progress }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const skipExisting = url.searchParams.get("skip") === "true";

    ingesting = true;
    progress = { ingested: 0, total: 0, status: "starting" };

    (async () => {
      try {
        const total = await fetchTotalProfileCount();
        progress.total = total;
        progress.status = "running";

        let ingested = 0;

        for await (const batch of fetchProfilesBatched(200)) {
          const toProcess = [];

          if (skipExisting) {
            for (const profile of batch) {
              const existing = await getProfile(profile.profileId);
              if (existing && existing.holdingsUSD > 0) continue;
              toProcess.push(profile);
            }
          } else {
            toProcess.push(...batch);
          }

          if (toProcess.length > 0) {
            const addressSet = new Set<string>();
            for (const p of toProcess) {
              for (const addr of p.addresses) addressSet.add(addr);
            }

            const holdings = await batchGetHoldings(Array.from(addressSet), 3);

            const stored: StoredProfile[] = toProcess.map((p) => {
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

            await saveProfiles(stored);
          }

          ingested += batch.length;
          progress.ingested = ingested;
        }

        await setMeta("lastIngestedAt", new Date().toISOString());
        progress.status = "done";
      } catch (err) {
        progress.status = `error: ${err instanceof Error ? err.message : String(err)}`;
      } finally {
        ingesting = false;
      }
    })();

    return new Response(JSON.stringify({ message: "Ingestion started", progress }), {
      headers: { "Content-Type": "application/json" },
    });
  },
};
