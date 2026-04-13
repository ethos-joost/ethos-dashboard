import { DashboardData } from "../lib/types.ts";
import ChartIsland from "./Chart.tsx";

interface Props {
  data: DashboardData;
}

export default function Dashboard({ data }: Props) {
  const { brackets, totalUsers, multiplier, ingestionProgress } = data;

  const low = brackets.find((b) => b.label === "1200\u20131300");
  const high = brackets.find((b) => b.label === "1600+");

  return (
    <div class="space-y-8">
      {/* No data state */}
      {ingestionProgress.totalProfiles === 0 && (
        <div class="bg-yellow-900/50 border border-yellow-700 rounded-xl p-4">
          <p class="text-yellow-200 font-medium">No data yet</p>
          <p class="text-yellow-300/70 text-sm mt-1">
            Run <code class="bg-yellow-900 px-1.5 py-0.5 rounded">deno task ingest</code> to
            fetch profiles and their holdings.
          </p>
        </div>
      )}

      {/* Headline multiplier */}
      {multiplier && (
        <div class="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-8 text-white text-center">
          <p class="text-sm opacity-80 mb-2">Key Insight</p>
          <p class="text-3xl font-bold">
            Users with Ethos score over 1600 typically have{" "}
            <span class="text-5xl">{multiplier}x</span>{" "}
            the purchasing power of those between 1200–1300
          </p>
        </div>
      )}

      {/* Head-to-head comparison */}
      {low && high && (low.userCount > 0 || high.userCount > 0) && (
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <BracketCard
            bracket={low}
            color="orange"
            description="Moderate credibility"
          />
          <BracketCard
            bracket={high}
            color="indigo"
            description="High credibility"
          />
        </div>
      )}

      {/* Chart */}
      {totalUsers > 0 && low && high && (
        <div class="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
          <h2 class="text-lg font-semibold text-white mb-4">
            Holdings Comparison
          </h2>
          <ChartIsland brackets={[low, high]} />
        </div>
      )}

      {/* Stats */}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Users Analyzed"
          value={totalUsers.toLocaleString()}
          subtitle={`${ingestionProgress.profilesWithHoldings} with holdings`}
        />
        <StatCard
          title="1200–1300 Users"
          value={low?.userCount.toLocaleString() ?? "0"}
          subtitle={`Avg: $${formatUSD(low?.trimmedAvgHoldings ?? 0)}`}
        />
        <StatCard
          title="1600+ Users"
          value={high?.userCount.toLocaleString() ?? "0"}
          subtitle={`Avg: $${formatUSD(high?.trimmedAvgHoldings ?? 0)}`}
        />
        <StatCard
          title="Last Ingested"
          value={
            ingestionProgress.lastIngestedAt
              ? new Date(ingestionProgress.lastIngestedAt).toLocaleDateString()
              : "Never"
          }
          subtitle={
            ingestionProgress.lastIngestedAt
              ? new Date(ingestionProgress.lastIngestedAt).toLocaleTimeString()
              : "Run deno task ingest"
          }
        />
      </div>

      <p class="text-xs text-gray-600 text-center">
        Data as of {new Date(data.fetchedAt).toLocaleString()} |{" "}
        {totalUsers} profiles | Ethereum + Base
      </p>
    </div>
  );
}

function BracketCard({
  bracket,
  color,
  description,
}: {
  bracket: { label: string; userCount: number; avgHoldings: number; medianHoldings: number; totalHoldings: number };
  color: "orange" | "indigo";
  description: string;
}) {
  const borderColor = color === "indigo" ? "border-indigo-500" : "border-orange-500";
  const accentColor = color === "indigo" ? "text-indigo-400" : "text-orange-400";

  return (
    <div class={`bg-gray-800 rounded-xl p-6 border-2 ${borderColor}`}>
      <div class="mb-4">
        <p class={`text-sm ${accentColor} font-medium`}>{description}</p>
        <p class="text-2xl font-bold text-white">Score {bracket.label}</p>
      </div>
      <div class="space-y-3">
        <div class="flex justify-between">
          <span class="text-gray-400">Users</span>
          <span class="text-white font-medium">{bracket.userCount.toLocaleString()}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-400">Avg Holdings (trimmed)</span>
          <span class="text-white font-bold text-lg">${formatUSD(bracket.trimmedAvgHoldings)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-400">Median Holdings</span>
          <span class="text-white font-medium">${formatUSD(bracket.medianHoldings)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-400">Total Holdings</span>
          <span class="text-white font-medium">${formatUSD(bracket.totalHoldings)}</span>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <div class="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <p class="text-sm text-gray-400 mb-1">{title}</p>
      <p class="text-2xl font-bold text-white">{value}</p>
      <p class="text-xs text-gray-500 mt-1">{subtitle}</p>
    </div>
  );
}

function formatUSD(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}
