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
    <div className="min-h-screen max-w-7xl mx-auto px-3 sm:px-4 md:px-8 py-4 md:py-10">
      {/* Header */}
      <Panel className="mb-4 md:mb-6">
        <header className="flex items-center gap-3">
          <Image src="/ethos-logo.svg" alt="Ethos" width={100} height={25} className="shrink-0 w-[72px] h-auto md:w-[100px]" />
          <div className="w-px h-5 bg-border shrink-0" />
          <span className="text-[10px] md:text-sm font-mono tracking-widest uppercase text-muted-foreground leading-none">
            Score vs Holdings
          </span>
        </header>
      </Panel>

      {/* Headline + Stats: 2-col on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 mb-4 md:mb-6">
        {/* Headline takes 2/3 */}
        {multiplier && (
          <Panel className="lg:col-span-2">
            <p className="font-mono text-xs tracking-widest uppercase text-muted-foreground mb-3 md:mb-4">
              Key Insight
            </p>
            <p className="text-xl sm:text-2xl md:text-3xl font-light leading-snug text-foreground wrap-break-word">
              On average users with a score{" "}
              <span className="font-semibold">higher than 1600</span> have{" "}
              <span className="font-mono font-bold text-2xl sm:text-3xl md:text-4xl">{multiplier}x</span>{" "}
              the purchasing power of users with a score{" "}
              <span className="font-semibold">between 1200–1300</span>
            </p>
            {medianMultiplier && (
              <p className="text-sm md:text-base text-muted-foreground mt-3 md:mt-4 font-light wrap-break-word">
                At the median — that gap is{" "}
                <span className="font-mono font-semibold text-foreground">{medianMultiplier}x</span>
              </p>
            )}
          </Panel>
        )}

        {/* Stats takes 1/3 */}
        <Panel className="lg:col-span-1">
          <p className="font-mono text-xs tracking-widest uppercase text-muted-foreground mb-4 md:mb-5">
            Coverage
          </p>
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <Stat label="Profiles" value={totalUsers.toLocaleString()} />
            <Stat label="With holdings" value={profilesWithHoldings.toLocaleString()} />
            <Stat label="1200–1300" value={low?.userCount.toLocaleString() ?? "0"} />
            <Stat label="1600+" value={high?.userCount.toLocaleString() ?? "0"} />
          </div>
        </Panel>
      </div>

      {/* Bracket cards: side-by-side */}
      {low && high && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-4 md:mb-6">
          <BracketCard bracket={low} label="1200–1300" />
          <BracketCard bracket={high} label="1600+" highlight />
        </div>
      )}

      {/* Holdings Comparison + Distribution: side by side on xl */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6 mb-4 md:mb-6">
        {low && high && (
          <Panel>
            <SectionHeader title="Holdings Comparison" />
            <HoldingsChart brackets={[low, high]} />
            <Takeaway>
              The average 1600+ user holds ${formatUSD(high.trimmedAvgHoldings)} compared to ${formatUSD(low.trimmedAvgHoldings)} for 1200–1300 users.
              Even at the median the gap holds: ${formatUSD(high.medianHoldings)} vs ${formatUSD(low.medianHoldings)}.
            </Takeaway>
          </Panel>
        )}

        {low && high && (() => {
          const lowUnder10 = low.tiers.find((t) => t.label === "$0–10")?.pct ?? 0;
          const highUnder10 = high.tiers.find((t) => t.label === "$0–10")?.pct ?? 0;
          const highOver1K = high.tiers.filter((t) => ["$1K–10K", "$10K+"].includes(t.label)).reduce((s, t) => s + t.pct, 0);
          const lowOver1K = low.tiers.filter((t) => ["$1K–10K", "$10K+"].includes(t.label)).reduce((s, t) => s + t.pct, 0);

          return (
            <Panel>
              <SectionHeader
                title="Holdings Distribution"
                description="Percentage of users in each holdings range"
              />
              <DistributionChart brackets={[low, high]} />
              <Takeaway>
                {lowUnder10.toFixed(1)}% of 1200–1300 users hold under $10, compared to {highUnder10.toFixed(1)}% of 1600+ users.
                {" "}{highOver1K.toFixed(1)}% of 1600+ users hold over $1K vs just {lowOver1K.toFixed(1)}% of 1200–1300 users.
              </Takeaway>
            </Panel>
          );
        })()}
      </div>

      {/* Percentile Breakdown (full width) */}
      {low && high && (() => {
        const p75Ratio = low.percentiles.p75 > 0
          ? Math.round((high.percentiles.p75 / low.percentiles.p75) * 10) / 10
          : null;

        return (
          <Panel className="mb-4 md:mb-6">
            <SectionHeader title="Percentile Breakdown" />
            <div className="overflow-x-auto w-full max-w-full">
              <table className="w-full font-mono text-xs md:text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left text-[10px] md:text-xs text-muted-foreground font-medium py-2 pr-2 md:pr-4">Percentile</th>
                    {(["p10", "p25", "p50", "p75", "p90"] as const).map((p) => (
                      <th key={p} className="text-right text-[10px] md:text-xs text-muted-foreground font-medium py-2 px-2 md:px-3">
                        {p.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[low, high].map((b) => (
                    <tr key={b.label} className="border-b border-border/30">
                      <td className="py-3 pr-2 md:pr-4 font-semibold">{b.label}</td>
                      {(["p10", "p25", "p50", "p75", "p90"] as const).map((p) => (
                        <td key={p} className="text-right py-3 px-2 md:px-3 tabular-nums">
                          {formatUSDExact(b.percentiles[p])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="text-muted-foreground">
                    <td className="py-3 pr-2 md:pr-4 text-[10px] md:text-xs">Multiplier</td>
                    {(["p10", "p25", "p50", "p75", "p90"] as const).map((p) => {
                      const ratio = low.percentiles[p] > 0
                        ? Math.round((high.percentiles[p] / low.percentiles[p]) * 10) / 10
                        : null;
                      return (
                        <td key={p} className="text-right py-3 px-2 md:px-3 tabular-nums text-[10px] md:text-xs">
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
          </Panel>
        );
      })()}

      {/* Holdings Tiers (full width) */}
      {low && high && (() => {
        const highOver100 = high.tiers.filter((t) => ["$100–1K", "$1K–10K", "$10K+"].includes(t.label)).reduce((s, t) => s + t.pct, 0);
        const lowOver100 = low.tiers.filter((t) => ["$100–1K", "$1K–10K", "$10K+"].includes(t.label)).reduce((s, t) => s + t.pct, 0);

        return (
          <Panel className="mb-4 md:mb-6">
            <SectionHeader title="Holdings Tiers" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
              {[
                { bracket: low, label: "1200–1300" },
                { bracket: high, label: "1600+" },
              ].map(({ bracket, label }) => (
                <div key={label}>
                  <p className="font-mono text-sm font-semibold mb-3">{label}</p>
                  <div className="space-y-2">
                    {bracket.tiers.map((tier) => (
                      <div key={tier.label} className="flex items-center gap-2 md:gap-3">
                        <span className="font-mono text-[10px] md:text-xs text-muted-foreground w-14 md:w-16 shrink-0">
                          {tier.label}
                        </span>
                        <div className="flex-1 h-5 bg-muted/50 rounded-sm overflow-hidden">
                          <div
                            className="h-full bg-foreground/80 rounded-sm"
                            style={{ width: `${Math.max(tier.pct, 0.5)}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] md:text-xs tabular-nums w-10 md:w-12 text-right shrink-0">
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
          </Panel>
        );
      })()}

      {/* Footer */}
      <p className="font-mono text-[10px] tracking-wide text-muted-foreground text-center">
        {new Date(data.fetchedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
        {" "}&middot;{" "}Ethereum + Base{" "}&middot;{" "}Trimmed mean (5%)
        {lastIngestedAt && (
          <>{" "}&middot;{" "}Last ingested {new Date(lastIngestedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</>
        )}
      </p>
    </div>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white/95 backdrop-blur-md rounded-xl shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_2px_16px_rgba(0,0,0,0.04)] p-4 sm:p-5 md:p-7 min-w-0 overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h2 className="font-mono text-xs tracking-widest uppercase text-muted-foreground">
        {title}
      </h2>
      {description && (
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      )}
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
        rounded-xl p-4 sm:p-5 md:p-7 shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_2px_16px_rgba(0,0,0,0.04)] min-w-0 overflow-hidden
        ${highlight
          ? "bg-foreground text-background"
          : "bg-white/95 backdrop-blur-md text-foreground"
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
    <div className="flex justify-between items-baseline gap-2 min-w-0">
      <span className={`font-mono text-xs truncate ${muted ? "text-background/40" : "text-muted-foreground"}`}>
        {label}
      </span>
      <span className={`font-mono shrink-0 ${large ? "text-lg font-semibold" : "text-sm"}`}>
        {value}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-xl font-semibold text-foreground">{value}</p>
      <p className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground mt-0.5">
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
