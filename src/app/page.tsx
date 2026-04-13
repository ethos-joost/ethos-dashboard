import Image from "next/image";
import { getDashboardData, type BracketData } from "@/lib/data";
import { HoldingsChart } from "@/components/chart";
import { DistributionChart } from "@/components/distribution-chart";

function formatUSD(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

function formatUSDExact(value: number): string {
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (value >= 1) return `$${value.toFixed(0)}`;
  return `$${value.toFixed(2)}`;
}

export default function Home() {
  const data = getDashboardData();
  const { brackets, totalUsers, multiplier, medianMultiplier, profilesWithHoldings, lastIngestedAt } = data;

  const low = brackets.find((b) => b.label === "1200\u20131300");
  const high = brackets.find((b) => b.label === "1600+");

  return (
    <div className="min-h-screen flex items-start justify-center p-4 md:p-8 lg:p-12">
    <div className="w-full max-w-4xl bg-white/95 backdrop-blur-md rounded-2xl shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_4px_32px_rgba(0,0,0,0.06)] px-8 py-10 md:px-12 md:py-12">
      {/* Header */}
      <header className="mb-12 flex items-center gap-3">
        <Image src="/ethos-logo.svg" alt="Ethos" width={100} height={25} className="shrink-0" />
        <div className="w-px h-5 bg-border shrink-0" />
        <span className="text-sm font-mono tracking-widest uppercase text-muted-foreground leading-none">
          Score vs Holdings
        </span>
      </header>

      <div className="space-y-10">
        {/* Headline */}
        {multiplier && (
          <div className="py-8">
            <p className="font-mono text-xs tracking-widest uppercase text-muted-foreground mb-4">
              Key Insight
            </p>
            <p className="text-3xl font-light leading-snug text-foreground">
              On average users with score{" "}
              <span className="font-semibold">1600+</span> have{" "}
              <span className="font-mono font-bold text-4xl">{multiplier}x</span>{" "}
              the purchasing power of{" "}
              <span className="font-semibold">1200–1300</span> users
            </p>
            {medianMultiplier && (
              <p className="text-base text-muted-foreground mt-4 font-light">
                At the median — excluding all outliers — that gap is{" "}
                <span className="font-mono font-semibold text-foreground">{medianMultiplier}x</span>
              </p>
            )}
          </div>
        )}

        {/* Comparison cards */}
        {low && high && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <BracketCard bracket={low} label="1200–1300" />
            <BracketCard bracket={high} label="1600+" highlight />
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Profiles" value={totalUsers.toLocaleString()} />
          <Stat label="With holdings" value={profilesWithHoldings.toLocaleString()} />
          <Stat label="1200–1300" value={low?.userCount.toLocaleString() ?? "0"} />
          <Stat label="1600+" value={high?.userCount.toLocaleString() ?? "0"} />
        </div>

        {/* Avg/Median chart */}
        {low && high && (
          <div className="rounded-lg border border-border/50 p-6">
            <h2 className="font-mono text-xs tracking-widest uppercase text-muted-foreground mb-6">
              Holdings Comparison
            </h2>
            <HoldingsChart brackets={[low, high]} />
            <Takeaway>
              The average 1600+ user holds ${formatUSD(high.trimmedAvgHoldings)} compared to ${formatUSD(low.trimmedAvgHoldings)} for 1200–1300 users.
              Even at the median the gap holds: ${formatUSD(high.medianHoldings)} vs ${formatUSD(low.medianHoldings)}.
            </Takeaway>
          </div>
        )}

        {/* Distribution chart */}
        {low && high && (() => {
          const lowUnder10 = low.tiers.find((t) => t.label === "$0–10")?.pct ?? 0;
          const highUnder10 = high.tiers.find((t) => t.label === "$0–10")?.pct ?? 0;
          const highOver1K = high.tiers.filter((t) => ["$1K–10K", "$10K+"].includes(t.label)).reduce((s, t) => s + t.pct, 0);
          const lowOver1K = low.tiers.filter((t) => ["$1K–10K", "$10K+"].includes(t.label)).reduce((s, t) => s + t.pct, 0);

          return (
            <div className="rounded-lg border border-border/50 p-6">
              <h2 className="font-mono text-xs tracking-widest uppercase text-muted-foreground mb-1">
                Holdings Distribution
              </h2>
              <p className="text-xs text-muted-foreground mb-6">
                Percentage of users in each holdings range
              </p>
              <DistributionChart brackets={[low, high]} />
              <Takeaway>
                {lowUnder10.toFixed(1)}% of 1200–1300 users hold under $10, compared to {highUnder10.toFixed(1)}% of 1600+ users.
                {" "}{highOver1K.toFixed(1)}% of 1600+ users hold over $1K vs just {lowOver1K.toFixed(1)}% of 1200–1300 users.
              </Takeaway>
            </div>
          );
        })()}

        {/* Percentile table */}
        {low && high && (() => {
          const p75Ratio = low.percentiles.p75 > 0
            ? Math.round((high.percentiles.p75 / low.percentiles.p75) * 10) / 10
            : null;

          return (
            <div className="rounded-lg border border-border/50 p-6">
              <h2 className="font-mono text-xs tracking-widest uppercase text-muted-foreground mb-6">
                Percentile Breakdown
              </h2>
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left text-xs text-muted-foreground font-medium py-2 pr-4">Percentile</th>
                    {(["p10", "p25", "p50", "p75", "p90"] as const).map((p) => (
                      <th key={p} className="text-right text-xs text-muted-foreground font-medium py-2 px-3">
                        {p.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[low, high].map((b) => (
                    <tr key={b.label} className="border-b border-border/30">
                      <td className="py-3 pr-4 font-semibold">{b.label}</td>
                      {(["p10", "p25", "p50", "p75", "p90"] as const).map((p) => (
                        <td key={p} className="text-right py-3 px-3 tabular-nums">
                          {formatUSDExact(b.percentiles[p])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="text-muted-foreground">
                    <td className="py-3 pr-4 text-xs">Multiplier</td>
                    {(["p10", "p25", "p50", "p75", "p90"] as const).map((p) => {
                      const ratio = low.percentiles[p] > 0
                        ? Math.round((high.percentiles[p] / low.percentiles[p]) * 10) / 10
                        : null;
                      return (
                        <td key={p} className="text-right py-3 px-3 tabular-nums text-xs">
                          {ratio ? `${ratio}x` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
            <Takeaway>
              At the 75th percentile, 1600+ users hold {formatUSDExact(high.percentiles.p75)} vs {formatUSDExact(low.percentiles.p75)} for 1200–1300{p75Ratio ? ` — a ${p75Ratio}x gap` : ""}.
              The difference widens at every level, confirming this isn&apos;t driven by a few outliers.
            </Takeaway>
          </div>
          );
        })()}

        {/* Holdings tiers */}
        {low && high && (() => {
          const highOver100 = high.tiers.filter((t) => ["$100–1K", "$1K–10K", "$10K+"].includes(t.label)).reduce((s, t) => s + t.pct, 0);
          const lowOver100 = low.tiers.filter((t) => ["$100–1K", "$1K–10K", "$10K+"].includes(t.label)).reduce((s, t) => s + t.pct, 0);

          return (
          <div className="rounded-lg border border-border/50 p-6">
            <h2 className="font-mono text-xs tracking-widest uppercase text-muted-foreground mb-6">
              Holdings Tiers
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { bracket: low, label: "1200–1300" },
                { bracket: high, label: "1600+" },
              ].map(({ bracket, label }) => (
                <div key={label}>
                  <p className="font-mono text-sm font-semibold mb-3">{label}</p>
                  <div className="space-y-2">
                    {bracket.tiers.map((tier) => (
                      <div key={tier.label} className="flex items-center gap-3">
                        <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">
                          {tier.label}
                        </span>
                        <div className="flex-1 h-5 bg-muted/50 rounded-sm overflow-hidden">
                          <div
                            className="h-full bg-foreground/80 rounded-sm"
                            style={{ width: `${Math.max(tier.pct, 0.5)}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs tabular-nums w-12 text-right">
                          {tier.pct}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Takeaway>
              {highOver100.toFixed(1)}% of 1600+ users hold over $100, compared to {lowOver100.toFixed(1)}% of 1200–1300 users.
              High-credibility users are far more likely to have meaningful on-chain assets.
            </Takeaway>
          </div>
          );
        })()}

        {/* Footer */}
        <p className="font-mono text-[10px] tracking-wide text-muted-foreground text-center pt-4">
          {new Date(data.fetchedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
          {" "}&middot;{" "}Ethereum + Base{" "}&middot;{" "}Trimmed mean (5%)
          {lastIngestedAt && (
            <>{" "}&middot;{" "}Last ingested {new Date(lastIngestedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</>
          )}
        </p>
      </div>
    </div>
    </div>
  );
}

function BracketCard({
  bracket,
  label,
  highlight,
}: {
  bracket: BracketData;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`
        rounded-lg border p-5
        ${highlight
          ? "bg-foreground text-background border-foreground"
          : "bg-muted/50 border-border text-foreground"
        }
      `}
    >
      <div className="mb-5">
        <p className={`font-mono text-[10px] tracking-widest uppercase ${highlight ? "text-background/50" : "text-muted-foreground"}`}>
          Score
        </p>
        <p className="text-2xl font-semibold tracking-tight">{label}</p>
      </div>

      <div className="space-y-3">
        <Row label="Users" value={bracket.userCount.toLocaleString()} muted={highlight} />
        <div className={`border-t ${highlight ? "border-background/10" : "border-border/50"}`} />
        <Row label="Avg" value={`$${formatUSD(bracket.trimmedAvgHoldings)}`} muted={highlight} large />
        <Row label="Median" value={`$${formatUSD(bracket.medianHoldings)}`} muted={highlight} />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  large,
}: {
  label: string;
  value: string;
  muted?: boolean;
  large?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline">
      <span className={`font-mono text-xs ${muted ? "text-background/40" : "text-muted-foreground"}`}>
        {label}
      </span>
      <span className={`font-mono ${large ? "text-lg font-semibold" : "text-sm"}`}>
        {value}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="font-mono text-lg font-semibold text-foreground">{value}</p>
      <p className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function Takeaway({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 pt-4 border-t border-border/30 text-sm text-muted-foreground leading-relaxed">
      {children}
    </p>
  );
}
