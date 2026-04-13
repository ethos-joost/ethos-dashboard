function getAlchemyKey(): string {
  return Deno.env.get("ALCHEMY_API_KEY") ?? "";
}

function getEtherscanKey(): string {
  return Deno.env.get("ETHERSCAN_API_KEY") ?? "";
}

const CHAINS = [
  { name: "eth-mainnet", rpc: "eth-mainnet.g.alchemy.com" },
  { name: "base-mainnet", rpc: "base-mainnet.g.alchemy.com" },
];

interface TokenBalance {
  contractAddress: string;
  tokenBalance: string;
}

// ---- Permanent caches (decimals and prices never change mid-run) ----

// Token decimals: contract address -> decimals (never changes)
const decimalsCache = new Map<string, number>();

// Token prices: "network:address" -> { price, ts }
const tokenPriceCache = new Map<string, { price: number; ts: number }>();

// ETH price cache (5 min TTL)
let ethPriceCache: { price: number; ts: number } | null = null;

// ---- ETH price ----

async function getEthPrice(): Promise<number> {
  if (ethPriceCache && Date.now() - ethPriceCache.ts < 5 * 60 * 1000) {
    return ethPriceCache.price;
  }
  const key = getAlchemyKey();
  const data = await fetchWithRetry(() =>
    fetch(`https://api.g.alchemy.com/prices/v1/${key}/tokens/by-symbol?symbols=ETH`),
  );
  const price = parseFloat(data.data?.[0]?.prices?.[0]?.value ?? "0");
  ethPriceCache = { price, ts: Date.now() };
  return price;
}

// ---- Token prices (batched, cached 5 min) ----

async function getTokenPrices(
  tokens: Array<{ address: string; network: string }>,
): Promise<Map<string, number>> {
  const key = getAlchemyKey();
  const prices = new Map<string, number>();
  const toFetch: typeof tokens = [];

  for (const t of tokens) {
    const cacheKey = `${t.network}:${t.address.toLowerCase()}`;
    const cached = tokenPriceCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
      prices.set(t.address.toLowerCase(), cached.price);
    } else {
      toFetch.push(t);
    }
  }

  if (toFetch.length === 0) return prices;

  // Alchemy prices API: up to 25 addresses per request
  for (let i = 0; i < toFetch.length; i += 25) {
    const batch = toFetch.slice(i, i + 25);
    try {
      const data = await fetchWithRetry(() =>
        fetch(`https://api.g.alchemy.com/prices/v1/${key}/tokens/by-address`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            addresses: batch.map((t) => ({ network: t.network, address: t.address })),
          }),
        }),
      );

      for (const entry of data.data ?? []) {
        const price = parseFloat(entry.prices?.[0]?.value ?? "0");
        const addr = entry.address.toLowerCase();
        prices.set(addr, price);
        tokenPriceCache.set(`${entry.network}:${addr}`, { price, ts: Date.now() });
      }
    } catch (err) {
      console.error("Token price fetch error:", err);
    }
  }

  return prices;
}

// ---- Token decimals (permanent cache, single RPC call per token ever) ----

async function getTokenDecimals(rpcUrl: string, contractAddress: string): Promise<number> {
  const key = contractAddress.toLowerCase();
  const cached = decimalsCache.get(key);
  if (cached !== undefined) return cached;

  const res = await rpc(rpcUrl, "alchemy_getTokenMetadata", [contractAddress]);
  const decimals = res.result?.decimals ?? 18;
  decimalsCache.set(key, decimals);
  return decimals;
}


// ---- Batch processing ----

/**
 * Batch fetch USD holdings for multiple addresses.
 * Uses Etherscan for mainnet ETH balances (20 per call, free).
 * Uses Alchemy for Base ETH + ERC-20 tokens on both chains.
 */
export async function batchGetHoldings(
  addresses: string[],
  concurrency = 3,
): Promise<Map<string, number>> {
  const results = new Map<string, number>();

  // Step 1: Batch fetch mainnet ETH via Etherscan (free, 20 per call)
  const ethBalances = await batchEthBalancesEtherscan(addresses);

  // Step 2: Per-wallet Alchemy calls for Base ETH + ERC-20 tokens
  const queue = [...addresses];

  async function worker() {
    while (queue.length > 0) {
      const address = queue.shift()!;
      let totalUSD = 0;
      const ethPrice = await getEthPrice();

      // Mainnet ETH from Etherscan (already fetched)
      const ethWei = ethBalances.get(address.toLowerCase()) ?? 0n;
      totalUSD += Number(ethWei) / 1e18 * ethPrice;

      // Base ETH via Alchemy (1 RPC call)
      try {
        const baseRpc = `https://base-mainnet.g.alchemy.com/v2/${getAlchemyKey()}`;
        const baseRes = await rpc(baseRpc, "eth_getBalance", [address, "latest"]);
        const baseWei = BigInt(baseRes.result ?? "0x0");
        totalUSD += Number(baseWei) / 1e18 * ethPrice;
      } catch { /* skip */ }

      // ERC-20 tokens on both chains (2 RPC calls)
      for (const chain of CHAINS) {
        try {
          const rpcUrl = `https://${chain.rpc}/v2/${getAlchemyKey()}`;
          const tokenRes = await rpc(rpcUrl, "alchemy_getTokenBalances", [address, "erc20"]);

          const balances: TokenBalance[] = tokenRes.result?.tokenBalances ?? [];
          const nonZero = balances.filter(
            (t) => t.tokenBalance && t.tokenBalance !== "0x" + "0".repeat(64),
          );

          if (nonZero.length === 0) continue;

          // Prices first (free API)
          const tokenAddrs = nonZero.map((t) => ({ address: t.contractAddress, network: chain.name }));
          const prices = await getTokenPrices(tokenAddrs);

          // Top 5 priced tokens only
          const TOP_N = 5;
          const pricedTokens = nonZero
            .map((t) => ({ ...t, price: prices.get(t.contractAddress.toLowerCase()) ?? 0 }))
            .filter((t) => t.price > 0)
            .map((t) => ({ ...t, est: (Number(BigInt(t.tokenBalance)) / 1e18) * t.price }))
            .sort((a, b) => b.est - a.est)
            .slice(0, TOP_N);

          for (const token of pricedTokens) {
            const decimals = await getTokenDecimals(
              `https://${chain.rpc}/v2/${getAlchemyKey()}`,
              token.contractAddress,
            );
            const balance = Number(BigInt(token.tokenBalance)) / Math.pow(10, decimals);
            totalUSD += balance * token.price;
          }
        } catch { /* skip chain errors */ }
      }

      results.set(address, isFinite(totalUSD) ? totalUSD : 0);
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  return results;
}

// ---- Etherscan batched native balance (free, 20 per call) ----

async function batchEthBalancesEtherscan(
  addresses: string[],
): Promise<Map<string, bigint>> {
  const results = new Map<string, bigint>();
  const key = getEtherscanKey();

  for (let i = 0; i < addresses.length; i += 20) {
    const batch = addresses.slice(i, i + 20);
    try {
      const data = await fetchWithRetry(() =>
        fetch(
          `https://api.etherscan.io/v2/api?chainid=1&module=account&action=balancemulti&address=${batch.join(",")}&tag=latest&apikey=${key}`,
        ),
      );
      if (data.status === "1" && Array.isArray(data.result)) {
        for (const entry of data.result) {
          results.set(entry.account.toLowerCase(), BigInt(entry.balance));
        }
      }
    } catch (err) {
      console.error("Etherscan batch error:", err);
    }
    // Etherscan rate limit: 5 calls/sec
    await delay(220);
  }

  return results;
}

// ---- Helpers ----

// deno-lint-ignore no-explicit-any
async function rpc(url: string, method: string, params: any[]): Promise<any> {
  return fetchWithRetry(() =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    })
  );
}

async function fetchWithRetry(
  fn: () => Promise<Response>,
  retries = 3,
  delayMs = 1000,
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fn();
      if (!res.ok && res.status >= 500 && attempt < retries) {
        await delay(delayMs * (attempt + 1));
        continue;
      }
      if (!res.ok && res.status === 429 && attempt < retries) {
        await delay(delayMs * (attempt + 1) * 2);
        continue;
      }
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        if (attempt < retries) {
          await delay(delayMs * (attempt + 1));
          continue;
        }
        console.error(`Non-JSON response: ${text.slice(0, 100)}`);
        return { result: null, data: null };
      }
    } catch (err) {
      if (attempt < retries) {
        await delay(delayMs * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  return { result: null, data: null };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
