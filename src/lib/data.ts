import profilesData from "@/data/profiles-export.json";

export interface StoredProfile {
  profileId: number;
  score: number;
  displayName: string;
  addresses: string[];
  holdingsUSD: number;
  updatedAt: string;
}

export interface BracketData {
  label: string;
  userCount: number;
  avgHoldings: number;
  trimmedAvgHoldings: number;
  medianHoldings: number;
  totalHoldings: number;
  percentiles: { p10: number; p25: number; p50: number; p75: number; p90: number };
  tiers: { label: string; count: number; pct: number }[];
  topHolders: { displayName: string; holdingsUSD: number }[];
  distribution: { bin: string; count: number }[];
}

export interface DashboardData {
  brackets: BracketData[];
  totalUsers: number;
  fetchedAt: string;
  profilesWithHoldings: number;
  lastIngestedAt: string | null;
  multiplier: number | null;
  medianMultiplier: number | null;
}

const BRACKETS = [
  { label: "1200–1300", min: 1200, max: 1300 },
  { label: "1600+", min: 1600, max: Infinity },
];

const TIERS = [
  { label: "$0–10", min: 0, max: 10 },
  { label: "$10–100", min: 10, max: 100 },
  { label: "$100–1K", min: 100, max: 1_000 },
  { label: "$1K–10K", min: 1_000, max: 10_000 },
  { label: "$10K+", min: 10_000, max: Infinity },
];

const DIST_BINS = [
  { label: "$0–10", min: 0, max: 10 },
  { label: "$10–50", min: 10, max: 50 },
  { label: "$50–100", min: 50, max: 100 },
  { label: "$100–500", min: 100, max: 500 },
  { label: "$500–1K", min: 500, max: 1_000 },
  { label: "$1K–5K", min: 1_000, max: 5_000 },
  { label: "$5K–10K", min: 5_000, max: 10_000 },
  { label: "$10K–50K", min: 10_000, max: 50_000 },
  { label: "$50K+", min: 50_000, max: Infinity },
];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

export function getDashboardData(): DashboardData {
  const allProfiles = profilesData.profiles as StoredProfile[];

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
    bracketProfiles.get(bracket.label)!.push(profile);
    const val = profile.holdingsUSD;
    if (!isNaN(val) && isFinite(val)) {
      bracketValues.get(bracket.label)!.push(val);
    }
  }

  const brackets: BracketData[] = BRACKETS.map((bracket) => {
    const values = bracketValues.get(bracket.label)!;
    const profiles = bracketProfiles.get(bracket.label)!;
    const sorted = [...values].sort((a, b) => a - b);
    const total = values.reduce((sum, v) => sum + v, 0);
    const avg = values.length > 0 ? total / values.length : 0;
    const median = values.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;

    // Trimmed mean
    let trimmedAvg = avg;
    let trimmedTotal = total;
    if (sorted.length >= 20) {
      const trimCount = Math.floor(sorted.length * 0.05);
      const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
      trimmedTotal = trimmed.reduce((sum, v) => sum + v, 0);
      trimmedAvg = trimmedTotal / trimmed.length;
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

    // Distribution bins
    const distribution = DIST_BINS.map((bin) => {
      const count = values.filter((v) =>
        bin.max === Infinity ? v >= bin.min : v >= bin.min && v < bin.max
      ).length;
      return { bin: bin.label, count };
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

    return {
      label: bracket.label,
      userCount: values.length,
      avgHoldings: Math.round(avg * 100) / 100,
      trimmedAvgHoldings: Math.round(trimmedAvg * 100) / 100,
      medianHoldings: Math.round(median * 100) / 100,
      totalHoldings: Math.round(trimmedTotal * 100) / 100,
      percentiles,
      tiers,
      topHolders,
      distribution,
    };
  });

  const high = brackets.find((b) => b.label === "1600+");
  const low = brackets.find((b) => b.label === "1200–1300");
  let multiplier: number | null = null;
  if (high && low && low.trimmedAvgHoldings > 0 && high.trimmedAvgHoldings > 0) {
    multiplier = Math.round((high.trimmedAvgHoldings / low.trimmedAvgHoldings) * 10) / 10;
  }

  let medianMultiplier: number | null = null;
  if (high && low && low.medianHoldings > 0 && high.medianHoldings > 0) {
    medianMultiplier = Math.round((high.medianHoldings / low.medianHoldings) * 10) / 10;
  }

  // Only count profiles in displayed brackets so totals add up
  const inBrackets = allProfiles.filter((p) =>
    BRACKETS.some((b) => p.score >= b.min && p.score < b.max)
  );
  const profilesWithHoldings = inBrackets.filter((p) => p.holdingsUSD > 0 && isFinite(p.holdingsUSD)).length;

  return {
    brackets,
    totalUsers: inBrackets.length,
    fetchedAt: profilesData.exportedAt,
    profilesWithHoldings,
    lastIngestedAt: profilesData.lastIngestedAt,
    multiplier,
    medianMultiplier,
  };
}
