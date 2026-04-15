/**
 * Filters Privy-managed wallets (embedded + smart) from each profile's
 * addresses list. These are signer/session wallets, not real user wallets.
 *
 * Reads privy_logins.embeddedWallet + privy_logins.smartWallet from Ethos DB,
 * then rewrites profiles-export.json to exclude those addresses.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import pg from "pg";
import { readFileSync, writeFileSync } from "fs";

const { Pool } = pg;
const EXPORT_PATH = "src/data/profiles-export.json";
const PG_URL = process.env.POSTGRES_URL;

if (!PG_URL) {
  console.error("Missing POSTGRES_URL");
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString: PG_URL, ssl: false });
  const client = await pool.connect();

  console.log("Fetching Privy embedded + smart wallets from Ethos DB...");
  const res = await client.query(`
    SELECT LOWER("embeddedWallet") AS addr FROM privy_logins WHERE "embeddedWallet" IS NOT NULL
    UNION
    SELECT LOWER("smartWallet") AS addr FROM privy_logins WHERE "smartWallet" IS NOT NULL
  `);
  const privySet = new Set(res.rows.map((r) => r.addr));
  console.log(`Found ${privySet.size} Privy-managed addresses.`);

  client.release();
  await pool.end();

  const data = JSON.parse(readFileSync(EXPORT_PATH, "utf-8"));
  let filteredCount = 0;
  let profilesAffected = 0;
  let profilesEmptied = 0;

  for (const profile of data.profiles) {
    const before = profile.addresses.length;
    const kept = profile.addresses.filter(
      (addr) => !privySet.has(addr.toLowerCase())
    );
    const removed = before - kept.length;
    if (removed > 0) {
      profilesAffected++;
      filteredCount += removed;
      if (kept.length === 0) profilesEmptied++;
    }
    profile.addresses = kept;
  }

  console.log(`Filtered ${filteredCount} Privy addresses from ${profilesAffected} profiles.`);
  console.log(`${profilesEmptied} profiles now have no addresses (only had Privy wallets).`);

  data.exportedAt = new Date().toISOString();
  writeFileSync(EXPORT_PATH, JSON.stringify(data, null, 2));
  console.log("Saved.");
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
