import Image from "next/image";
import { getDashboardData, type BracketData, LOW_BRACKET_LABEL, HIGH_BRACKET_LABEL } from "@/lib/data";
import { HoldingsChart } from "@/components/chart";
import { FadeIn, CountUp, AnimatedBar } from "@/components/animations";
import { ScoreIcon, Score } from "@/components/score-icon";

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
  const { brackets, totalUsers, medianMultiplier, profilesWithHoldings, lastScannedAt } = data;

  const low = brackets.find((b) => b.label === LOW_BRACKET_LABEL);
  const high = brackets.find((b) => b.label === HIGH_BRACKET_LABEL);

  return (
    <div className="min-h-screen max-w-7xl mx-auto px-3 sm:px-4 md:px-8 py-4 md:py-10">
      {/* Header */}
      <Panel className="mb-4 md:mb-6">
        <header className="flex items-center gap-3">
          <Image src="/ethos-logo.svg" alt="Ethos" width={100} height={25} className="shrink-0 w-[72px] h-auto md:w-[100px]" />
          <div className="w-px h-5 bg-border shrink-0" />
          <span className="text-[10px] md:text-sm font-mono tracking-wide text-muted-foreground leading-none">
            How Ethos credibility correlates with on-chain assets
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
                <span className="font-semibold">higher than <Score>1600</Score></span> has{" "}
                <span className="font-mono font-bold text-2xl sm:text-3xl md:text-4xl">
                  <CountUp value={medianMultiplier} decimals={1} suffix="x" />
                </span>{" "}
                the purchasing power of a user with a score{" "}
                <span className="font-semibold">between <Score>{LOW_BRACKET_LABEL}</Score></span>
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
            <Stat label="Profiles scanned" value={totalUsers.toLocaleString()} />
            <Stat label="With holdings" value={profilesWithHoldings.toLocaleString()} />
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

      {/* Holdings Distribution (full width) */}
      {low && high && (() => {
        const over10K = ["$10K–100K", "$100K–1M", "$1M+"];
        const lowPctUnder100 = low.tiers.find((t) => t.label === "$0\u2013100")?.pct ?? 0;
        const highPctOver10K = high.tiers
          .filter((t) => over10K.includes(t.label))
          .reduce((s, t) => s + t.pct, 0);

        return (
          <FadeIn><Panel className="mb-4 md:mb-6">
            <SectionHeader
              title="Holdings Distribution"
              description="Share of each bracket's users in every holdings range"
            />
            <HoldingsChart brackets={[low, high]} />
            <Takeaway>
              {lowPctUnder100.toFixed(0)}% of {LOW_BRACKET_LABEL} users hold less than $100,
              while {highPctOver10K.toFixed(0)}% of {HIGH_BRACKET_LABEL} users hold over $10K.
              The shape of wealth is fundamentally different between the two brackets.
            </Takeaway>
          </Panel></FadeIn>
        );
      })()}

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
                <p className="font-mono text-sm font-semibold mb-4 flex items-center gap-1.5">
                  <ScoreIcon className="w-3 h-[0.8rem] shrink-0" />
                  <span>{label}</span>
                </p>
                <div className="space-y-3">
                  <DefiRow
                    label="DeFi participation"
                    value={`${bracket.defiActivePct}%`}
                    sublabel={`${bracket.defiActiveCount.toLocaleString()} users active`}
                  />
                  <DefiRow
                    label="Median among DeFi users"
                    value={`$${formatUSD(bracket.medianDefiHoldings)}`}
                    sublabel={`$${formatUSD(bracket.totalDefi)} total deposited`}
                  />
                  <DefiRow
                    label="Median among NFT holders"
                    value={`$${formatUSD(bracket.medianNftHoldings)}`}
                    sublabel={`$${formatUSD(bracket.totalNfts)} total floor value`}
                  />
                  <DefiRow
                    label="Median among Hyperliquid users"
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
                  <p className="font-mono text-sm font-semibold mb-3 flex items-center gap-1.5">
                    <ScoreIcon className="w-3 h-[0.8rem] shrink-0" />
                    <span>{label}</span>
                  </p>
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

      {/* Top Holders */}
      {high && high.topHolders.length > 0 && (
        <FadeIn><Panel className="mb-4 md:mb-6">
          <SectionHeader
            title={`Biggest ${HIGH_BRACKET_LABEL} holders`}
            description="The ten largest wallets in the high-credibility bracket"
          />
          <div className="space-y-1">
            {high.topHolders.slice(0, 10).map((h, i) => (
              <div key={`${h.displayName}-${i}`} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-[10px] text-muted-foreground w-5 shrink-0 tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-mono text-sm truncate">{h.displayName}</span>
                </div>
                <span className="font-mono text-sm font-semibold shrink-0 tabular-nums">
                  ${formatUSD(h.holdingsUSD)}
                </span>
              </div>
            ))}
          </div>
        </Panel></FadeIn>
      )}

      {/* Footer */}
      <Panel>
        <div className="font-mono text-[10px] tracking-wide text-muted-foreground text-center space-y-1">
          <p>
            {lastScannedAt ? (
              <>Data last scanned {new Date(lastScannedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</>
            ) : (
              <>Scan date unknown</>
            )}
            {" "}&middot;{" "}Zerion + Hyperliquid API
          </p>
          <details className="mt-3 inline-block text-left">
            <summary className="cursor-pointer hover:text-foreground transition-colors list-none select-none tracking-widest uppercase">
              Methodology
            </summary>
            <ul className="mt-3 pt-3 border-t border-border/30 space-y-1.5 leading-relaxed max-w-xl mx-auto list-disc pl-4 marker:text-muted-foreground/50">
              <li>Holdings = wallet tokens + DeFi positions (net of borrowed) + NFT floors + Hyperliquid (perps + spot).</li>
              <li>Data from Zerion API (tokens, DeFi, NFTs across all major EVM chains including HyperEVM) and Hyperliquid&apos;s public API.</li>
              <li>Bracket boundaries match Ethos-native credibility tiers.</li>
              <li>Privy-managed embedded and smart wallets are excluded — these are app-managed, not user-owned assets.</li>
              <li>Dormant wallets (holdings = $0) are excluded from medians so the metric is meaningful.</li>
              <li>Medians are the primary indicator since wealth distributions are heavily skewed by whales; averages are shown for context.</li>
              <li>One confirmed spam profile with fabricated $7B in fake DeFi deposits was manually zeroed out.</li>
            </ul>
          </details>
        </div>
      </Panel>
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
        <p className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ScoreIcon className="w-5 h-[1.3rem] shrink-0" />
          <span>{label}</span>
        </p>
      </div>

      <div className="space-y-3">
        <Row label="Users" value={bracket.userCount.toLocaleString()} muted={highlight} />
        <div className={`border-t ${highlight ? "border-background/10" : "border-border/50"}`} />
        <Row label="Median" value={`$${formatUSD(bracket.medianHoldings)}`} muted={highlight} large />
        <Row label="Avg" value={`$${formatUSD(bracket.avgHoldings)}`} muted={highlight} />
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

function Stat({ label, value, score }: { label: string; value: string; score?: boolean }) {
  return (
    <div>
      <p className="font-mono text-xl font-semibold text-foreground">{value}</p>
      <p className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground mt-0.5 flex items-center gap-1">
        {score && <ScoreIcon className="w-2.5 h-[0.66rem] shrink-0" />}
        <span>{label}</span>
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
