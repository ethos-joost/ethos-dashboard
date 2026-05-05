// Zerion sometimes reports inflated DeFi positions (from malicious tokens
// that auto-claim balance to wallets) or inflated NFT floors (from
// manipulated collections). This module is the single source of truth for
// known-junk profiles so future rescans can't reintroduce stale values.
//
// To add a new entry: verify the wallet on DeBank and add the profileId to
// the appropriate set/map below.

// Hard cap: any profile reporting more than this is auto-treated as junk.
// No legitimate Ethos user holds nine figures.
export const SPAM_TOTAL_CAP_USD = 100_000_000;

// Profiles confirmed as junk via DeBank / manual verification. Their
// holdings are treated as zero in all dashboard aggregates.
export const JUNK_PROFILE_IDS: ReadonlySet<number> = new Set([
  53253, // WebVR.eth — Zerion reports $69M, real ≈ $25K
  35603, // 0x69D7...B1b3 — Zerion reports $9M, real ≈ $6
  18080, // Nofuturistic.eth — Zerion reports $4.8M, real ≈ $331
  2050,  // Thrax — Zerion reports $2.4M, real ≈ $1.2K
  52560, // cryptoro — Zerion reports $2.4M, real ≈ $6.7K
  35650, // Moon — Zerion reports $2.4M, DeBank shows ~$4K
  17603, // Minebuu.eth — Zerion reports $1.8M, real ≈ $37K
  37593, // Orochimaru.bnb — Zerion reports $1.3M, DeBank ≈ $800
  46432, // 散户联盟 — Zerion reports $1.3M, ≈ nothing real
  6524,  // Wyp — Zerion reports $696K, ≈ nothing real
]);

// Real wallets where Zerion's NFT floor estimate is inflated by a
// manipulated collection. Cap NFT value at the manually verified amount;
// the wallet's other (real) holdings stay intact.
export const NFT_VALUE_CAPS: ReadonlyMap<number, number> = new Map([
  [41974, 50_000],  // gekko.eth — DeBank ≈ $50K NFTs (Zerion: $16.6M)
  [2487,  200_000], // Tschuuuly — OpenSea ≈ $200K (Zerion: $664K)
]);
