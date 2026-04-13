export interface ScoreBracket {
  label: string;
  min: number;
  max: number;
}

export const SCORE_BRACKETS: ScoreBracket[] = [
  { label: "1200–1300", min: 1200, max: 1300 },
  { label: "1600+", min: 1600, max: Infinity },
];

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
  min: number;
  max: number;
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
  ingestionProgress: {
    totalProfiles: number;
    profilesWithHoldings: number;
    lastIngestedAt: string | null;
  };
  multiplier: number | null;
}
