import pg from "pg";

export interface StoredProfile {
  profileId: number;
  score: number;
  displayName: string;
  addresses: string[];
  holdingsUSD: number;
  holdingsEvm?: number;
  holdingsDefi?: number;
  holdingsNfts?: number;
  holdingsHyperliquid?: number;
  scanSource?: string;
  updatedAt: string;
  // Enrichment from Ethos Postgres (optional for backwards compat)
  vouchGivenEth?: number;
  vouchGivenCount?: number;
  vouchReceivedEth?: number;
  vouchReceivedCount?: number;
  reviewsPositive?: number;
  reviewsNeutral?: number;
  reviewsNegative?: number;
  humanVerified?: boolean;
  xpTotal?: number;
  influenceFactor?: number;
  influenceFactorPercentile?: number;
}

export interface BracketData {
  label: string;
  userCount: number;
  avgHoldings: number;
  medianHoldings: number;
  totalHoldings: number;
  percentiles: { p10: number; p25: number; p50: number; p75: number; p90: number };
  tiers: { label: string; count: number; pct: number }[];
  topHolders: { displayName: string; holdingsUSD: number }[];
  // Engagement metrics from Ethos DB
  humanVerifiedCount: number;
  humanVerifiedPct: number;
  vouchGivenEthTotal: number;
  vouchReceivedEthTotal: number;
  avgReviewsReceived: number;
  avgXp: number;
  // DeFi participation
  defiActiveCount: number;
  defiActivePct: number;
  medianDefiHoldings: number;
  medianNftHoldings: number;
  medianHlHoldings: number;
  totalDefi: number;
  totalNfts: number;
  totalHl: number;
}

export interface DashboardData {
  brackets: BracketData[];
  totalUsers: number;
  profilesWithHoldings: number;
  lastScannedAt: string | null;
  multiplier: number | null;
  medianMultiplier: number | null;
}

export const LOW_BRACKET_LABEL = "1200\u20131399";
export const HIGH_BRACKET_LABEL = "1600+";

const BRACKETS = [
  { label: LOW_BRACKET_LABEL, min: 1200, max: 1400 },
  { label: HIGH_BRACKET_LABEL, min: 1600, max: Infinity },
];

const TIERS = [
  { label: "$0–100", min: 0, max: 100 },
  { label: "$100–1K", min: 100, max: 1_000 },
  { label: "$1K–10K", min: 1_000, max: 10_000 },
  { label: "$10K–100K", min: 10_000, max: 100_000 },
  { label: "$100K–1M", min: 100_000, max: 1_000_000 },
  { label: "$1M+", min: 1_000_000, max: Infinity },
];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

async function fetchProfiles(): Promise<StoredProfile[]> {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) throw new Error("SUPABASE_URL not set");

  const pool = new pg.Pool({
    connectionString: supabaseUrl,
    ssl: { rejectUnauthorized: false },
    max: 2,
  });

  let rows: pg.QueryResultRow[];
  try {
    ({ rows } = await pool.query("SELECT * FROM profiles ORDER BY score DESC"));
  } catch (err) {
    console.error("[data] Supabase query failed:", err);
    throw err;
  } finally {
    await pool.end();
  }

  return rows.map((r) => ({
    profileId: r.profile_id,
    score: r.score,
    displayName: r.display_name,
    addresses: r.addresses,
    holdingsUSD: parseFloat(r.holdings_usd),
    holdingsEvm: parseFloat(r.holdings_evm),
    holdingsDefi: parseFloat(r.holdings_defi ?? "0"),
    holdingsNfts: parseFloat(r.holdings_nfts),
    holdingsHyperliquid: parseFloat(r.holdings_hyperliquid),
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
}

export async function getDashboardData(): Promise<DashboardData> {
  const allProfiles = await fetchProfiles();

  const bracketProfiles = new Map<string, StoredProfile[]>();
  const bracketValues = new Map<string, number[]>();
  for (const b of BRACKETS) {
    bracketProfiles.set(b.label, []);
    bracketValues.set(b.label, []);
  }

  for (const profile of allProfiles) {
    const bracket = BRACKETS.find(
      (b) => profile.score >= b.min && profile.score < b.max
    );
    if (!bracket) continue;
    const val = profile.holdingsUSD;
    if (isNaN(val) || !isFinite(val) || val <= 0) continue;
    bracketProfiles.get(bracket.label)!.push(profile);
    bracketValues.get(bracket.label)!.push(val);
  }

  const brackets: BracketData[] = BRACKETS.map((bracket) => {
    const values = bracketValues.get(bracket.label)!;
    const profiles = bracketProfiles.get(bracket.label)!;
    const sorted = [...values].sort((a, b) => a - b);
    const total = values.reduce((sum, v) => sum + v, 0);
    const avg = values.length > 0 ? total / values.length : 0;
    const median = values.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;

    // Total for "Market Power" — only trim top 1% if the bracket has
    // obvious spam wallets (over $10M). Keeps legit whales intact.
    const SPAM_THRESHOLD = 10_000_000;
    const hasSpam = sorted.length > 0 && sorted[sorted.length - 1] > SPAM_THRESHOLD;
    let cappedTotal = total;
    if (hasSpam && sorted.length >= 100) {
      const trimTop = Math.ceil(sorted.length * 0.01);
      cappedTotal = sorted.slice(0, sorted.length - trimTop).reduce((s, v) => s + v, 0);
    }

    // Percentiles
    const percentiles = {
      p10: Math.round(percentile(sorted, 0.1) * 100) / 100,
      p25: Math.round(percentile(sorted, 0.25) * 100) / 100,
      p50: Math.round(percentile(sorted, 0.5) * 100) / 100,
      p75: Math.round(percentile(sorted, 0.75) * 100) / 100,
      p90: Math.round(percentile(sorted, 0.9) * 100) / 100,
    };

    // Holdings tiers
    const tiers = TIERS.map((tier) => {
      const count = values.filter((v) =>
        tier.max === Infinity ? v >= tier.min : v >= tier.min && v < tier.max
      ).length;
      return {
        label: tier.label,
        count,
        pct: values.length > 0 ? Math.round((count / values.length) * 1000) / 10 : 0,
      };
    });

    // Top holders
    const topHolders = [...profiles]
      .filter((p) => isFinite(p.holdingsUSD) && !isNaN(p.holdingsUSD))
      .sort((a, b) => b.holdingsUSD - a.holdingsUSD)
      .slice(0, 10)
      .map((p) => ({
        displayName: p.displayName || `Profile #${p.profileId}`,
        holdingsUSD: Math.round(p.holdingsUSD * 100) / 100,
      }));

    // Engagement metrics
    const humanVerifiedCount = profiles.filter((p) => p.humanVerified).length;
    const humanVerifiedPct = profiles.length > 0
      ? Math.round((humanVerifiedCount / profiles.length) * 1000) / 10
      : 0;
    const vouchGivenEthTotal = profiles.reduce((s, p) => s + (p.vouchGivenEth ?? 0), 0);
    const vouchReceivedEthTotal = profiles.reduce((s, p) => s + (p.vouchReceivedEth ?? 0), 0);
    const totalReviews = profiles.reduce(
      (s, p) => s + (p.reviewsPositive ?? 0) + (p.reviewsNeutral ?? 0) + (p.reviewsNegative ?? 0),
      0,
    );
    const avgReviewsReceived = profiles.length > 0 ? totalReviews / profiles.length : 0;
    const avgXp = profiles.length > 0
      ? profiles.reduce((s, p) => s + (p.xpTotal ?? 0), 0) / profiles.length
      : 0;

    return {
      label: bracket.label,
      userCount: values.length,
      avgHoldings: Math.round(avg * 100) / 100,
      medianHoldings: Math.round(median * 100) / 100,
      totalHoldings: Math.round(cappedTotal * 100) / 100,
      percentiles,
      tiers,
      topHolders,
      humanVerifiedCount,
      humanVerifiedPct,
      vouchGivenEthTotal: Math.round(vouchGivenEthTotal * 100) / 100,
      vouchReceivedEthTotal: Math.round(vouchReceivedEthTotal * 100) / 100,
      avgReviewsReceived: Math.round(avgReviewsReceived * 10) / 10,
      avgXp: Math.round(avgXp),
      // DeFi participation
      defiActiveCount: profiles.filter((p) => (p.holdingsDefi ?? 0) > 0).length,
      defiActivePct: profiles.length > 0
        ? Math.round((profiles.filter((p) => (p.holdingsDefi ?? 0) > 0).length / profiles.length) * 1000) / 10
        : 0,
      medianDefiHoldings: (() => {
        const v = profiles.map((p) => p.holdingsDefi ?? 0).filter((x) => x > 0).sort((a, b) => a - b);
        return v.length > 0 ? Math.round(v[Math.floor(v.length / 2)] * 100) / 100 : 0;
      })(),
      medianNftHoldings: (() => {
        const v = profiles.map((p) => p.holdingsNfts ?? 0).filter((x) => x > 0).sort((a, b) => a - b);
        return v.length > 0 ? Math.round(v[Math.floor(v.length / 2)] * 100) / 100 : 0;
      })(),
      medianHlHoldings: (() => {
        const v = profiles.map((p) => p.holdingsHyperliquid ?? 0).filter((x) => x > 0).sort((a, b) => a - b);
        return v.length > 0 ? Math.round(v[Math.floor(v.length / 2)] * 100) / 100 : 0;
      })(),
      totalDefi: Math.round(profiles.reduce((s, p) => s + (p.holdingsDefi ?? 0), 0) * 100) / 100,
      totalNfts: Math.round(profiles.reduce((s, p) => s + (p.holdingsNfts ?? 0), 0) * 100) / 100,
      totalHl: Math.round(profiles.reduce((s, p) => s + (p.holdingsHyperliquid ?? 0), 0) * 100) / 100,
    };
  });

  const high = brackets.find((b) => b.label === HIGH_BRACKET_LABEL);
  const low = brackets.find((b) => b.label === LOW_BRACKET_LABEL);
  let multiplier: number | null = null;
  if (high && low && low.avgHoldings > 0 && high.avgHoldings > 0) {
    multiplier = Math.round((high.avgHoldings / low.avgHoldings) * 10) / 10;
  }

  let medianMultiplier: number | null = null;
  if (high && low && low.medianHoldings > 0 && high.medianHoldings > 0) {
    medianMultiplier = Math.round((high.medianHoldings / low.medianHoldings) * 10) / 10;
  }

  const inBrackets = allProfiles.filter((p) =>
    BRACKETS.some((b) => p.score >= b.min && p.score < b.max)
  );
  const profilesWithHoldings = inBrackets.filter((p) => p.holdingsUSD > 0 && isFinite(p.holdingsUSD)).length;

  const lastScannedAt = inBrackets.reduce<string | null>((latest, p) => {
    if (!p.updatedAt) return latest;
    return latest === null || p.updatedAt > latest ? p.updatedAt : latest;
  }, null);

  return {
    brackets,
    totalUsers: inBrackets.length,
    profilesWithHoldings,
    lastScannedAt,
    multiplier,
    medianMultiplier,
  };
}
