/**
 * Enriches the existing profiles-export.json with Hyperliquid + HyperEVM holdings.
 * Uses only free public APIs (no Alchemy CU, no DeBank credits).
 *
 * For each wallet:
 *   - Hyperliquid perps (clearinghouseState.marginSummary.accountValue)
 *   - Hyperliquid spot (balances × allMids prices)
 *   - HyperEVM native HYPE (eth_getBalance on hl rpc × HYPE price)
 */

import { readFileSync, writeFileSync } from "fs";

const EXPORT_PATH = "src/data/profiles-export.json";
const CONCURRENCY = 10;

let hypePrice = 0;
let hlSpotMeta = null;
let hlAllMids = null;

async function loadHlData() {
  const [meta, mids] = await Promise.all([
    fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "spotMeta" }),
    }).then((r) => r.json()),
    fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "clearinghouseState", user: address }),
      }).then((r) => r.json()),
      fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      if (coin === "USDC") {
        total += amount;
        continue;
      }
      const tokens = hlSpotMeta?.tokens ?? [];
      const universe = hlSpotMeta?.universe ?? [];
      const idx = tokens.findIndex((t) => t?.name === coin);
      if (idx >= 0) {
        const pair = universe.find((p) => p.tokens?.[0] === idx && p.tokens?.[1] === 0);
        if (pair?.index !== undefined) {
          const mid = parseFloat(hlAllMids[`@${pair.index}`] ?? "0");
          if (mid > 0) {
            total += amount * mid;
            continue;
          }
        }
      }
      const direct = parseFloat(hlAllMids[coin] ?? "0");
      if (direct > 0) total += amount * direct;
    }
    return total;
  } catch {
    return 0;
  }
}

async function getHyperEvmUSD(address) {
  try {
    const res = await fetch("https://rpc.hyperliquid.xyz/evm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [address, "latest"],
      }),
    });
    const d = await res.json();
    const wei = BigInt(d?.result ?? "0x0");
    return (Number(wei) / 1e18) * hypePrice;
  } catch {
    return 0;
  }
}

async function getWalletExtras(address) {
  const [hl, hevm] = await Promise.all([
    getHyperliquidUSD(address),
    getHyperEvmUSD(address),
  ]);
  return { hl, hevm };
}

async function main() {
  await loadHlData();

  const data = JSON.parse(readFileSync(EXPORT_PATH, "utf-8"));
  console.log(`Enriching ${data.profiles.length} profiles...`);

  const queue = [...data.profiles];
  let done = 0;
  let totalHlFound = 0;
  let totalHevmFound = 0;
  const startTime = Date.now();

  async function worker() {
    while (queue.length > 0) {
      const profile = queue.shift();
      try {
        let hlTotal = 0;
        let hevmTotal = 0;
        for (const addr of profile.addresses) {
          const { hl, hevm } = await getWalletExtras(addr);
          hlTotal += hl;
          hevmTotal += hevm;
        }

        // Subtract previous HL + HEVM values first (idempotent rerun)
        const prevHl = profile.holdingsHyperliquid ?? 0;
        const prevHevm = profile.holdingsHyperEvm ?? 0;
        profile.holdingsUSD = Math.round((profile.holdingsUSD - prevHl - prevHevm + hlTotal + hevmTotal) * 100) / 100;
        profile.holdingsHyperliquid = Math.round(hlTotal * 100) / 100;
        profile.holdingsHyperEvm = Math.round(hevmTotal * 100) / 100;

        if (hlTotal > 0) totalHlFound++;
        if (hevmTotal > 0) totalHevmFound++;
        done++;

        if (done % 100 === 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = done / elapsed;
          const remaining = (data.profiles.length - done) / rate;
          process.stdout.write(
            `\r  ${done}/${data.profiles.length} (${rate.toFixed(1)}/s, ~${(remaining / 60).toFixed(0)}min remaining, HL:${totalHlFound} HEVM:${totalHevmFound})  `
          );
        }

        // Save every 500 to prevent progress loss
        if (done % 500 === 0) {
          data.exportedAt = new Date().toISOString();
          writeFileSync(EXPORT_PATH, JSON.stringify(data, null, 2));
        }
      } catch (err) {
        console.error(`\nError on profile ${profile.profileId}:`, err.message);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  data.exportedAt = new Date().toISOString();
  writeFileSync(EXPORT_PATH, JSON.stringify(data, null, 2));
  console.log(
    `\nDone! ${done} profiles. ${totalHlFound} with Hyperliquid, ${totalHevmFound} with HyperEVM. Took ${((Date.now() - startTime) / 60000).toFixed(1)}min.`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
