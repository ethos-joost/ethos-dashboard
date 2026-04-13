import { Pool } from "postgres";
import { SCORE_BRACKETS } from "./types.ts";

export interface EthosProfile {
  profileId: number;
  score: number;
  displayName: string;
  addresses: string[];
}

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const url = Deno.env.get("POSTGRES_URL");
    if (!url) throw new Error("Missing POSTGRES_URL environment variable");
    pool = new Pool(url, 3, true);
  }
  return pool;
}

/**
 * Fetches only profiles in the target score brackets (1200-1300 and 1600+)
 * from the Ethos Postgres database, ordered by score DESC.
 */
export async function* fetchProfilesBatched(
  batchSize = 500,
): AsyncGenerator<EthosProfile[]> {
  const db = getPool();
  const conn = await db.connect();

  // Build WHERE clause for only our brackets
  const conditions = SCORE_BRACKETS.map((b) => {
    if (b.max === Infinity) return `u.score >= ${b.min}`;
    return `(u.score >= ${b.min} AND u.score < ${b.max})`;
  }).join(" OR ");

  try {
    // First get all user IDs in our brackets, ordered by score DESC
    // This is a lightweight query (no JOIN)
    const idsRes = await conn.queryObject<{ id: number }>(`
      SELECT u.id
      FROM users u
      WHERE u.profile_id IS NOT NULL AND (${conditions})
      ORDER BY u.score DESC
    `);

    const allIds = idsRes.rows.map((r) => r.id);

    // Process in batches
    for (let offset = 0; offset < allIds.length; offset += batchSize) {
      const batchIds = allIds.slice(offset, offset + batchSize);

      const res = await conn.queryObject<{
        profile_id: number;
        score: number;
        display_name: string;
        address: string;
      }>(`
        SELECT u.profile_id, u.score, u.display_name, pa.address
        FROM users u
        JOIN profile_addresses pa ON pa."profileId" = u.profile_id
        WHERE u.id = ANY($1)
        ORDER BY u.score DESC
      `, [batchIds]);

      if (res.rows.length === 0) continue;

      // Group addresses by user
      const userMap = new Map<number, EthosProfile>();
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
          userMap.get(row.profile_id)!.addresses.push(addr);
        }
      }

      const batch = Array.from(userMap.values()).filter(
        (p) => p.addresses.length > 0,
      );

      if (batch.length > 0) yield batch;
    }
  } finally {
    conn.release();
  }
}

export async function fetchTotalProfileCount(): Promise<number> {
  const db = getPool();
  const conn = await db.connect();

  const conditions = SCORE_BRACKETS.map((b) => {
    if (b.max === Infinity) return `u.score >= ${b.min}`;
    return `(u.score >= ${b.min} AND u.score < ${b.max})`;
  }).join(" OR ");

  try {
    const res = await conn.queryObject<{ total: string }>(`
      SELECT COUNT(DISTINCT u.id)::text as total
      FROM users u
      JOIN profile_addresses pa ON pa."profileId" = u.profile_id
      WHERE u.profile_id IS NOT NULL AND (${conditions})
    `);
    return parseInt(res.rows[0].total);
  } finally {
    conn.release();
  }
}
