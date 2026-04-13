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

export function getDashboardData(): DashboardData {
  const profiles = profilesData.profiles as StoredProfile[];

  const bracketMap = new Map<string, number[]>();
  for (const b of BRACKETS) bracketMap.set(b.label, []);

  for (const profile of profiles) {
    const bracket = BRACKETS.find(
      (b) => profile.score >= b.min && profile.score < b.max
    );
    if (!bracket) continue;
    const val = profile.holdingsUSD;
    if (isNaN(val) || !isFinite(val)) continue;
    bracketMap.get(bracket.label)!.push(val);
  }

  const brackets: BracketData[] = BRACKETS.map((bracket) => {
    const values = bracketMap.get(bracket.label)!;
    const sorted = [...values].sort((a, b) => a - b);
    const total = values.reduce((sum, v) => sum + v, 0);
    const avg = values.length > 0 ? total / values.length : 0;
    const median = values.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;

    // Trimmed: remove top and bottom 5%
    let trimmedAvg = avg;
    let trimmedTotal = total;
    if (sorted.length >= 20) {
      const trimCount = Math.floor(sorted.length * 0.05);
      const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
      trimmedTotal = trimmed.reduce((sum, v) => sum + v, 0);
      trimmedAvg = trimmedTotal / trimmed.length;
    }

    return {
      label: bracket.label,
      userCount: values.length,
      avgHoldings: Math.round(avg * 100) / 100,
      trimmedAvgHoldings: Math.round(trimmedAvg * 100) / 100,
      medianHoldings: Math.round(median * 100) / 100,
      totalHoldings: Math.round(trimmedTotal * 100) / 100,
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

  const profilesWithHoldings = profiles.filter((p) => p.holdingsUSD > 0 && isFinite(p.holdingsUSD)).length;

  return {
    brackets,
    totalUsers: profiles.length,
    fetchedAt: profilesData.exportedAt,
    profilesWithHoldings,
    lastIngestedAt: profilesData.lastIngestedAt,
    multiplier,
    medianMultiplier,
  };
}
