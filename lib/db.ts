import { SCORE_BRACKETS, StoredProfile, BracketData, DashboardData } from "./types.ts";

const kv = await Deno.openKv();

export async function saveProfile(profile: StoredProfile): Promise<void> {
  await kv.set(["profiles", profile.profileId], profile);
}

export async function saveProfiles(profiles: StoredProfile[]): Promise<void> {
  for (let i = 0; i < profiles.length; i += 10) {
    const batch = profiles.slice(i, i + 10);
    let op = kv.atomic();
    for (const p of batch) {
      op = op.set(["profiles", p.profileId], p);
    }
    await op.commit();
  }
}

export async function getProfile(profileId: number): Promise<StoredProfile | null> {
  const entry = await kv.get<StoredProfile>(["profiles", profileId]);
  return entry.value;
}

export async function getAllProfiles(): Promise<StoredProfile[]> {
  const profiles: StoredProfile[] = [];
  for await (const entry of kv.list<StoredProfile>({ prefix: ["profiles"] })) {
    profiles.push(entry.value);
  }
  return profiles;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await kv.set(["meta", key], value);
}

export async function getMeta<T>(key: string): Promise<T | null> {
  const entry = await kv.get<T>(["meta", key]);
  return entry.value;
}

export async function getDashboardData(): Promise<DashboardData> {
  const profiles = await getAllProfiles();

  const bracketMap = new Map<string, number[]>();
  for (const bracket of SCORE_BRACKETS) {
    bracketMap.set(bracket.label, []);
  }

  for (const profile of profiles) {
    const bracket = SCORE_BRACKETS.find(
      (b) => profile.score >= b.min && profile.score < b.max
    );
    if (!bracket) continue;
    const val = profile.holdingsUSD;
    if (isNaN(val) || !isFinite(val)) continue;
    bracketMap.get(bracket.label)!.push(val);
  }

  const brackets: BracketData[] = SCORE_BRACKETS.map((bracket) => {
    const values = bracketMap.get(bracket.label)!;
    const sorted = [...values].sort((a, b) => a - b);
    const total = values.reduce((sum, v) => sum + v, 0);
    const avg = values.length > 0 ? total / values.length : 0;
    const median = values.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;

    // Trimmed mean: remove top and bottom 5%
    let trimmedAvg = 0;
    if (sorted.length >= 20) {
      const trimCount = Math.floor(sorted.length * 0.05);
      const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
      trimmedAvg = trimmed.reduce((sum, v) => sum + v, 0) / trimmed.length;
    } else {
      trimmedAvg = avg;
    }

    return {
      label: bracket.label,
      min: bracket.min,
      max: bracket.max,
      userCount: values.length,
      avgHoldings: Math.round(avg * 100) / 100,
      trimmedAvgHoldings: Math.round(trimmedAvg * 100) / 100,
      medianHoldings: Math.round(median * 100) / 100,
      totalHoldings: Math.round(total * 100) / 100,
    };
  });

  // Compute multiplier: 1600+ avg / 1200-1300 avg
  const high = brackets.find((b) => b.label === "1600+");
  const low = brackets.find((b) => b.label === "1200–1300");
  let multiplier: number | null = null;
  if (high && low && low.trimmedAvgHoldings > 0 && high.trimmedAvgHoldings > 0) {
    multiplier = Math.round((high.trimmedAvgHoldings / low.trimmedAvgHoldings) * 10) / 10;
  }

  const profilesWithHoldings = profiles.filter((p) => p.holdingsUSD > 0).length;
  const lastIngestedAt = await getMeta<string>("lastIngestedAt");

  return {
    brackets,
    totalUsers: profiles.length,
    fetchedAt: new Date().toISOString(),
    ingestionProgress: {
      totalProfiles: profiles.length,
      profilesWithHoldings,
      lastIngestedAt,
    },
    multiplier,
  };
}
