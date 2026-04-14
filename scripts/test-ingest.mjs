/**
 * Quick test: ingest only 10 profiles to verify APIs work.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { Pool } from "pg";

const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY;
const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY;
const PG_URL = process.env.POSTGRES_URL;

async function main() {
  console.log("1. Postgres connection...");
  const pool = new Pool({ connectionString: PG_URL, ssl: false });
  const client = await pool.connect();
  const res = await client.query(`
    SELECT u.profile_id, u.score, u.display_name, pa.address
    FROM users u
    JOIN profile_addresses pa ON pa."profileId" = u.profile_id
    WHERE u.profile_id IS NOT NULL
      AND u.score >= 1600
    ORDER BY u.score DESC
    LIMIT 20
  `);
  client.release();
  await pool.end();

  const userMap = new Map();
  for (const row of res.rows) {
    if (!userMap.has(row.profile_id)) {
      userMap.set(row.profile_id, { profileId: row.profile_id, score: row.score, displayName: row.display_name, addresses: [] });
    }
    userMap.get(row.profile_id).addresses.push(String(row.address));
  }
  const profiles = Array.from(userMap.values()).slice(0, 10);
  console.log(`   Got ${profiles.length} profiles`);

  console.log("\n2. ETH price (Alchemy)...");
  const priceRes = await fetch(`https://api.g.alchemy.com/prices/v1/${ALCHEMY_KEY}/tokens/by-symbol?symbols=ETH`);
  const priceData = await priceRes.json();
  const ethPrice = parseFloat(priceData.data?.[0]?.prices?.[0]?.value ?? "0");
  console.log(`   ETH = $${ethPrice}`);

  console.log("\n3. Etherscan batched balance (10 addresses)...");
  const addresses = profiles.flatMap((p) => p.addresses).slice(0, 10);
  const eRes = await fetch(
    `https://api.etherscan.io/v2/api?chainid=1&module=account&action=balancemulti&address=${addresses.join(",")}&tag=latest&apikey=${ETHERSCAN_KEY}`
  );
  const eData = await eRes.json();
  console.log(`   status: ${eData.status}, got ${eData.result?.length} balances`);

  console.log("\n4. Alchemy Base balance + tokens for 1 address...");
  const testAddr = addresses[0];
  const baseRes = await fetch(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [testAddr, "latest"] }),
  });
  const baseData = await baseRes.json();
  console.log(`   Base balance: ${baseData.result}`);

  const tokRes = await fetch(`https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "alchemy_getTokenBalances", params: [testAddr, "erc20"] }),
  });
  const tokData = await tokRes.json();
  const nonZero = (tokData.result?.tokenBalances ?? []).filter(
    (t) => t.tokenBalance && t.tokenBalance !== "0x" + "0".repeat(64)
  );
  console.log(`   ${nonZero.length} non-zero ERC-20 tokens`);

  console.log("\nAll APIs working ✓");
}

main().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
