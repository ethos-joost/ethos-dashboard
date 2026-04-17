import Image from "next/image";
import { getDashboardData, type BracketData, LOW_BRACKET_LABEL, HIGH_BRACKET_LABEL } from "@/lib/data";
import { HoldingsChart } from "@/components/chart";
import { FadeIn, CountUp, AnimatedBar } from "@/components/animations";
import { ScoreSlider } from "@/components/score-slider";

function formatUSD(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

// Revalidate every hour — data refreshes without redeploy
export const revalidate = 3600;

export default async function Home() {
  const data = await getDashboardData();
  const { brackets, totalUsers, multiplier, medianMultiplier, profilesWithHoldings, lastIngestedAt } = data;

  const low = brackets.find((b) => b.label === LOW_BRACKET_LABEL);
  const high = brackets.find((b) => b.label === HIGH_BRACKET_LABEL);

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
        {medianMultiplier && (
          <FadeIn className="lg:col-span-2">
            <Panel>
              <p className="font-mono text-xs tracking-widest uppercase text-muted-foreground mb-3 md:mb-4">
                Key Insight
              </p>
              <p className="text-xl sm:text-2xl md:text-3xl font-light leading-snug text-foreground wrap-break-word">
                The typical user with a score{" "}
                <span className="font-semibold">higher than 1600</span> has{" "}
                <span className="font-mono font-bold text-2xl sm:text-3xl md:text-4xl">
                  <CountUp value={medianMultiplier} decimals={1} suffix="x" />
                </span>{" "}
                the purchasing power of a user with a score{" "}
                <span className="font-semibold">between {LOW_BRACKET_LABEL}</span>
              </p>
            </Panel>
          </FadeIn>
        )}

        {/* Stats takes 1/3 */}
        <FadeIn delay={0.2} className="lg:col-span-1">
        <Panel>
          <p className="font-mono text-xs tracking-widest uppercase text-muted-foreground mb-4 md:mb-5">
            Coverage
          </p>
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <Stat label="Profiles" value={totalUsers.toLocaleString()} />
            <Stat label="With holdings" value={profilesWithHoldings.toLocaleString()} />
            <Stat label={LOW_BRACKET_LABEL} value={low?.userCount.toLocaleString() ?? "0"} />
            <Stat label={HIGH_BRACKET_LABEL} value={high?.userCount.toLocaleString() ?? "0"} />
          </div>
        </Panel>
        </FadeIn>
      </div>

      {/* Bracket cards: side-by-side */}
      {low && high && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-4 md:mb-6">
          <FadeIn><BracketCard bracket={low} label={LOW_BRACKET_LABEL} /></FadeIn>
          <FadeIn delay={0.15}><BracketCard bracket={high} label={HIGH_BRACKET_LABEL} highlight /></FadeIn>
        </div>
      )}

      {/* Holdings Comparison (full width) */}
      {low && high && (
        <FadeIn><Panel className="mb-4 md:mb-6">
          <SectionHeader title="Holdings Comparison" />
          <HoldingsChart brackets={[low, high]} />
          <Takeaway>
            The typical {HIGH_BRACKET_LABEL} user holds ${formatUSD(high.medianHoldings)} compared to ${formatUSD(low.medianHoldings)} for {LOW_BRACKET_LABEL} users.
            At the average, the gap is ${formatUSD(high.trimmedAvgHoldings)} vs ${formatUSD(low.trimmedAvgHoldings)}.
          </Takeaway>
        </Panel></FadeIn>
      )}

      {/* Market Power */}
      {low && high && (() => {
        const above10K = ["$10K–100K", "$100K–1M", "$1M+"];
        const above1K = ["$1K–10K", ...above10K];
        const highOver10K = high.tiers.filter((t) => above10K.includes(t.label)).reduce((s, t) => s + t.count, 0);
        const highOver1K = high.tiers.filter((t) => above1K.includes(t.label)).reduce((s, t) => s + t.count, 0);
        const lowOver10K = low.tiers.filter((t) => above10K.includes(t.label)).reduce((s, t) => s + t.count, 0);
        const lowOver1K = low.tiers.filter((t) => above1K.includes(t.label)).reduce((s, t) => s + t.count, 0);

        return (
          <FadeIn><Panel className="mb-4 md:mb-6">
            <SectionHeader title="Market Power" description="Combined holdings and high-value user counts per bracket" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              <BigStat
                value={`$${formatUSD(high.totalHoldings)}`}
                label={`${HIGH_BRACKET_LABEL} combined`}
                sublabel={`${high.userCount.toLocaleString()} users`}
              />
              <BigStat
                value={`$${formatUSD(low.totalHoldings)}`}
                label={`${LOW_BRACKET_LABEL} combined`}
                sublabel={`${low.userCount.toLocaleString()} users`}
              />
              <BigStat
                value={highOver1K.toLocaleString()}
                label={`${HIGH_BRACKET_LABEL} users over $1K`}
                sublabel={`${highOver10K.toLocaleString()} hold over $10K`}
              />
              <BigStat
                value={lowOver1K.toLocaleString()}
                label={`${LOW_BRACKET_LABEL} users over $1K`}
                sublabel={`${lowOver10K.toLocaleString()} hold over $10K`}
              />
            </div>
            <Takeaway>
              Despite being {Math.round(low.userCount / high.userCount)}× smaller, the {HIGH_BRACKET_LABEL} bracket holds ${formatUSD(high.totalHoldings)} combined.
              {" "}{highOver1K.toLocaleString()} of them hold over $1K, including {highOver10K.toLocaleString()} with over $10K.
            </Takeaway>
          </Panel></FadeIn>
        );
      })()}

      {/* DeFi Participation */}
      {low && high && (
        <FadeIn><Panel className="mb-4 md:mb-6">
          <SectionHeader title="Capital Deployment" description="How users deploy their assets across DeFi, NFTs, and Hyperliquid" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            {[
              { bracket: low, label: LOW_BRACKET_LABEL },
              { bracket: high, label: HIGH_BRACKET_LABEL },
            ].map(({ bracket, label }) => (
              <div key={label}>
                <p className="font-mono text-sm font-semibold mb-4">{label}</p>
                <div className="space-y-3">
                  <DefiRow
                    label="DeFi active"
                    value={`${bracket.defiActivePct}%`}
                    sublabel={`${bracket.defiActiveCount.toLocaleString()} users`}
                  />
                  <DefiRow
                    label="Median in DeFi"
                    value={`$${formatUSD(bracket.medianDefiHoldings)}`}
                    sublabel={`$${formatUSD(bracket.totalDefi)} total deposited`}
                  />
                  <DefiRow
                    label="Median in NFTs"
                    value={`$${formatUSD(bracket.medianNftHoldings)}`}
                    sublabel={`$${formatUSD(bracket.totalNfts)} total`}
                  />
                  <DefiRow
                    label="Median in Hyperliquid"
                    value={`$${formatUSD(bracket.medianHlHoldings)}`}
                    sublabel={`$${formatUSD(bracket.totalHl)} total`}
                  />
                </div>
              </div>
            ))}
          </div>
          {high.defiActivePct > 0 && (
            <Takeaway>
              {high.defiActivePct}% of {HIGH_BRACKET_LABEL} users actively deploy capital in DeFi protocols, compared to {low.defiActivePct}% in {LOW_BRACKET_LABEL}.
              {" "}{HIGH_BRACKET_LABEL} users have ${formatUSD(high.totalDefi)} deposited across lending, staking, and yield protocols.
            </Takeaway>
          )}
        </Panel></FadeIn>
      )}

      {/* Holdings Tiers (full width) */}
      {low && high && (() => {
        const above100 = ["$100–1K", "$1K–10K", "$10K–100K", "$100K–1M", "$1M+"];
        const highOver100 = high.tiers.filter((t) => above100.includes(t.label)).reduce((s, t) => s + t.pct, 0);
        const lowOver100 = low.tiers.filter((t) => above100.includes(t.label)).reduce((s, t) => s + t.pct, 0);

        return (
          <FadeIn><Panel className="mb-4 md:mb-6">
            <SectionHeader title="Holdings Tiers" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
              {[
                { bracket: low, label: LOW_BRACKET_LABEL },
                { bracket: high, label: HIGH_BRACKET_LABEL },
              ].map(({ bracket, label }) => (
                <div key={label}>
                  <p className="font-mono text-sm font-semibold mb-3">{label}</p>
                  <div className="space-y-2">
                    {bracket.tiers.map((tier) => (
                      <div key={tier.label} className="flex items-center gap-2 md:gap-3">
                        <span className="font-mono text-[10px] md:text-xs text-muted-foreground w-18 md:w-20 shrink-0 whitespace-nowrap">
                          {tier.label}
                        </span>
                        <div className="flex-1 h-5 bg-muted/50 rounded-sm overflow-hidden">
                          <AnimatedBar pct={tier.pct} className="h-full bg-foreground/80 rounded-sm" />
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
              {highOver100.toFixed(1)}% of {HIGH_BRACKET_LABEL} users hold over $100, compared to {lowOver100.toFixed(1)}% of {LOW_BRACKET_LABEL} users.
              High-credibility users are far more likely to have meaningful on-chain assets.
            </Takeaway>
          </Panel></FadeIn>
        );
      })()}

      {/* Score Explorer */}
      <FadeIn>
        <Panel className="mb-4 md:mb-6">
          <SectionHeader
            title="Score Explorer"
            description="Drag the slider to see how purchasing power changes at different score thresholds"
          />
          <ScoreSlider profiles={data.sliderProfiles} />
        </Panel>
      </FadeIn>

      {/* Footer */}
      <div className="font-mono text-[10px] tracking-wide text-muted-foreground text-center space-y-1">
        <p>
          {new Date(data.fetchedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
          {" "}&middot;{" "}Multichain (EVM + Hyperliquid + HyperEVM){" "}&middot;{" "}Trimmed mean (5%)
          {lastIngestedAt && (
            <>{" "}&middot;{" "}Last ingested {new Date(lastIngestedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</>
          )}
        </p>
        <p>
          Data source: Zerion (DeFi + tokens + NFTs) + Hyperliquid API
          {data.zerionCoverage.map((c) => (
            <span key={c.bracket}>
              {" "}&middot;{" "}{c.bracket}: {c.scanned.toLocaleString()}/{c.total.toLocaleString()} profiles scanned
            </span>
          ))}
        </p>
      </div>
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
        <Row label="Median" value={`$${formatUSD(bracket.medianHoldings)}`} muted={highlight} large />
        <Row label="Avg" value={`$${formatUSD(bracket.trimmedAvgHoldings)}`} muted={highlight} />
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

function DefiRow({ label, value, sublabel }: { label: string; value: string; sublabel: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="font-mono text-xs text-muted-foreground">{label}</span>
      <div className="text-right">
        <span className="font-mono text-sm font-semibold">{value}</span>
        <p className="font-mono text-[10px] text-muted-foreground">{sublabel}</p>
      </div>
    </div>
  );
}

function BigStat({ value, label, sublabel }: { value: string; label: string; sublabel?: string }) {
  return (
    <div>
      <p className="font-mono text-2xl md:text-3xl font-semibold text-foreground tabular-nums">{value}</p>
      <p className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground mt-1">{label}</p>
      {sublabel && (
        <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>
      )}
    </div>
  );
}
