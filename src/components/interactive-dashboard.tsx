"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import type { ClientProfile } from "@/lib/data";
import { HoldingsChart } from "@/components/chart";
import { FadeIn, CountUp, AnimatedBar } from "@/components/animations";

function formatUSD(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const TIERS = [
  { label: "$0–100", min: 0, max: 100 },
  { label: "$100–1K", min: 100, max: 1_000 },
  { label: "$1K–10K", min: 1_000, max: 10_000 },
  { label: "$10K–100K", min: 10_000, max: 100_000 },
  { label: "$100K–1M", min: 100_000, max: 1_000_000 },
  { label: "$1M+", min: 1_000_000, max: Infinity },
];

interface Props {
  profiles: ClientProfile[];
  fetchedAt: string;
}

export function InteractiveDashboard({ profiles, fetchedAt }: Props) {
  const [threshold, setThreshold] = useState(1600);

  const stats = useMemo(() => {
    const above = profiles.filter((p) => p.score >= threshold && p.holdingsUSD > 0);
    const below = profiles.filter((p) => p.score >= 1200 && p.score < threshold && p.holdingsUSD > 0);

    const aboveVals = above.map((p) => p.holdingsUSD);
    const belowVals = below.map((p) => p.holdingsUSD);

    const aboveMedian = median(aboveVals);
    const belowMedian = median(belowVals);
    const multiplier = belowMedian > 0 ? Math.round((aboveMedian / belowMedian) * 10) / 10 : 0;

    // Trimmed averages
    function trimmedAvg(vals: number[]) {
      const sorted = [...vals].sort((a, b) => a - b);
      const tc = Math.floor(sorted.length * 0.05);
      const trimmed = sorted.slice(tc, sorted.length - tc);
      return trimmed.length > 0 ? trimmed.reduce((s, v) => s + v, 0) / trimmed.length : 0;
    }

    // Tiers
    function computeTiers(vals: number[]) {
      return TIERS.map((tier) => {
        const count = vals.filter((v) => v >= tier.min && v < tier.max).length;
        return {
          label: tier.label,
          count,
          pct: vals.length > 0 ? Math.round((count / vals.length) * 1000) / 10 : 0,
        };
      });
    }

    // DeFi stats
    const aboveDefi = above.filter((p) => (p.holdingsDefi ?? 0) > 0);
    const belowDefi = below.filter((p) => (p.holdingsDefi ?? 0) > 0);

    return {
      above: {
        count: above.length,
        median: aboveMedian,
        avg: trimmedAvg(aboveVals),
        tiers: computeTiers(aboveVals),
        defiActivePct: above.length > 0 ? Math.round((aboveDefi.length / above.length) * 1000) / 10 : 0,
        defiActiveCount: aboveDefi.length,
        medianDefi: median(aboveDefi.map((p) => p.holdingsDefi)),
        medianNfts: median(above.filter((p) => (p.holdingsNfts ?? 0) > 0).map((p) => p.holdingsNfts)),
        medianHl: median(above.filter((p) => (p.holdingsHyperliquid ?? 0) > 0).map((p) => p.holdingsHyperliquid)),
        totalDefi: above.reduce((s, p) => s + (p.holdingsDefi ?? 0), 0),
        totalNfts: above.reduce((s, p) => s + (p.holdingsNfts ?? 0), 0),
        totalHl: above.reduce((s, p) => s + (p.holdingsHyperliquid ?? 0), 0),
      },
      below: {
        count: below.length,
        median: belowMedian,
        avg: trimmedAvg(belowVals),
        tiers: computeTiers(belowVals),
        defiActivePct: below.length > 0 ? Math.round((belowDefi.length / below.length) * 1000) / 10 : 0,
        defiActiveCount: belowDefi.length,
        medianDefi: median(belowDefi.map((p) => p.holdingsDefi)),
        medianNfts: median(below.filter((p) => (p.holdingsNfts ?? 0) > 0).map((p) => p.holdingsNfts)),
        medianHl: median(below.filter((p) => (p.holdingsHyperliquid ?? 0) > 0).map((p) => p.holdingsHyperliquid)),
        totalDefi: below.reduce((s, p) => s + (p.holdingsDefi ?? 0), 0),
        totalNfts: below.reduce((s, p) => s + (p.holdingsNfts ?? 0), 0),
        totalHl: below.reduce((s, p) => s + (p.holdingsHyperliquid ?? 0), 0),
      },
      multiplier,
    };
  }, [threshold, profiles]);

  const bracketForChart = (side: typeof stats.above, label: string) => ({
    label,
    userCount: side.count,
    avgHoldings: 0,
    trimmedAvgHoldings: Math.round(side.avg * 100) / 100,
    medianHoldings: Math.round(side.median * 100) / 100,
    totalHoldings: 0,
    percentiles: { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 },
    tiers: side.tiers,
    topHolders: [],
    distribution: [],
    humanVerifiedCount: 0,
    humanVerifiedPct: 0,
    vouchGivenEthTotal: 0,
    vouchReceivedEthTotal: 0,
    avgReviewsReceived: 0,
    avgXp: 0,
    defiActiveCount: side.defiActiveCount,
    defiActivePct: side.defiActivePct,
    medianDefiHoldings: side.medianDefi,
    medianNftHoldings: side.medianNfts,
    medianHlHoldings: side.medianHl,
    totalDefi: side.totalDefi,
    totalNfts: side.totalNfts,
    totalHl: side.totalHl,
  });

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Score Slider */}
      <Panel>
        <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
          <div className="flex-1">
            <div className="flex justify-between items-baseline mb-2">
              <p className="font-mono text-xs tracking-widest uppercase text-muted-foreground">
                Score threshold
              </p>
              <span className="font-mono text-2xl font-bold">{threshold}</span>
            </div>
            <input
              type="range"
              min={1300}
              max={2200}
              step={50}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-foreground"
            />
            <div className="flex justify-between font-mono text-[10px] text-muted-foreground mt-1">
              <span>1300</span>
              <span>2200</span>
            </div>
          </div>
          <div className="text-center md:text-right">
            <motion.p
              key={stats.multiplier}
              initial={{ scale: 1.1, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="font-mono text-4xl md:text-5xl font-bold"
            >
              {stats.multiplier > 0 ? `${stats.multiplier}x` : "—"}
            </motion.p>
            <p className="font-mono text-xs text-muted-foreground">median multiplier</p>
          </div>
        </div>
      </Panel>

      {/* Headline */}
      {stats.multiplier > 0 && (
        <Panel>
          <p className="text-xl sm:text-2xl md:text-3xl font-light leading-snug text-foreground wrap-break-word">
            The typical user with a score{" "}
            <span className="font-semibold">higher than {threshold}</span> has{" "}
            <span className="font-mono font-bold text-2xl sm:text-3xl md:text-4xl">{stats.multiplier}x</span>{" "}
            the purchasing power of a user with a score{" "}
            <span className="font-semibold">below {threshold}</span>
          </p>
        </Panel>
      )}

      {/* Bracket cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <BracketCard label={`1200–${threshold - 1}`} count={stats.below.count} median={stats.below.median} avg={stats.below.avg} />
        <BracketCard label={`${threshold}+`} count={stats.above.count} median={stats.above.median} avg={stats.above.avg} highlight />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Below threshold" value={stats.below.count.toLocaleString()} />
        <Stat label="Above threshold" value={stats.above.count.toLocaleString()} />
        <Stat label={`Median below`} value={`$${formatUSD(stats.below.median)}`} />
        <Stat label={`Median above`} value={`$${formatUSD(stats.above.median)}`} />
      </div>

      {/* Chart */}
      <Panel>
        <SectionHeader title="Holdings Comparison" />
        <HoldingsChart
          brackets={[
            bracketForChart(stats.below, `1200–${threshold - 1}`),
            bracketForChart(stats.above, `${threshold}+`),
          ]}
        />
      </Panel>

      {/* Capital Deployment */}
      <Panel>
        <SectionHeader title="Capital Deployment" description="How users deploy their assets across DeFi, NFTs, and Hyperliquid" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {[
            { side: stats.below, label: `1200–${threshold - 1}` },
            { side: stats.above, label: `${threshold}+` },
          ].map(({ side, label }) => (
            <div key={label}>
              <p className="font-mono text-sm font-semibold mb-4">{label}</p>
              <div className="space-y-3">
                <DefiRow label="DeFi active" value={`${side.defiActivePct}%`} sublabel={`${side.defiActiveCount.toLocaleString()} users`} />
                <DefiRow label="Median in DeFi" value={`$${formatUSD(side.medianDefi)}`} sublabel={`$${formatUSD(side.totalDefi)} total`} />
                <DefiRow label="Median in NFTs" value={`$${formatUSD(side.medianNfts)}`} sublabel={`$${formatUSD(side.totalNfts)} total`} />
                <DefiRow label="Median in HL" value={`$${formatUSD(side.medianHl)}`} sublabel={`$${formatUSD(side.totalHl)} total`} />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Holdings Tiers */}
      <Panel>
        <SectionHeader title="Holdings Tiers" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {[
            { side: stats.below, label: `1200–${threshold - 1}` },
            { side: stats.above, label: `${threshold}+` },
          ].map(({ side, label }) => (
            <div key={label}>
              <p className="font-mono text-sm font-semibold mb-3">{label}</p>
              <div className="space-y-2">
                {side.tiers.map((tier) => (
                  <div key={tier.label} className="flex items-center gap-2 md:gap-3">
                    <span className="font-mono text-[10px] md:text-xs text-muted-foreground w-18 md:w-20 shrink-0 whitespace-nowrap">
                      {tier.label}
                    </span>
                    <div className="flex-1 h-5 bg-muted/50 rounded-sm overflow-hidden">
                      <motion.div
                        className="h-full bg-foreground/80 rounded-sm"
                        animate={{ width: `${Math.max(tier.pct, 0.5)}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
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
      </Panel>

      {/* Footer */}
      <p className="font-mono text-[10px] tracking-wide text-muted-foreground text-center">
        {new Date(fetchedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
        {" "}&middot;{" "}Multichain (EVM + Hyperliquid + HyperEVM)
        {" "}&middot;{" "}Data source: Zerion + Hyperliquid API
      </p>
    </div>
  );
}

// Sub-components
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
      <h2 className="font-mono text-xs tracking-widest uppercase text-muted-foreground">{title}</h2>
      {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
    </div>
  );
}

function BracketCard({ label, count, median: med, avg, highlight }: {
  label: string; count: number; median: number; avg: number; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl p-4 sm:p-5 md:p-7 shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_2px_16px_rgba(0,0,0,0.04)] min-w-0 overflow-hidden ${
      highlight ? "bg-foreground text-background" : "bg-white/95 backdrop-blur-md text-foreground"
    }`}>
      <div className="mb-5">
        <p className={`font-mono text-[10px] tracking-widest uppercase ${highlight ? "text-background/50" : "text-muted-foreground"}`}>Score</p>
        <p className="text-2xl font-semibold tracking-tight">{label}</p>
      </div>
      <div className="space-y-3">
        <Row label="Users" value={count.toLocaleString()} muted={highlight} />
        <div className={`border-t ${highlight ? "border-background/10" : "border-border/50"}`} />
        <Row label="Median" value={`$${formatUSD(med)}`} muted={highlight} large />
        <Row label="Avg" value={`$${formatUSD(avg)}`} muted={highlight} />
      </div>
    </div>
  );
}

function Row({ label, value, muted, large }: { label: string; value: string; muted?: boolean; large?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-2 min-w-0">
      <span className={`font-mono text-xs truncate ${muted ? "text-background/40" : "text-muted-foreground"}`}>{label}</span>
      <span className={`font-mono shrink-0 ${large ? "text-lg font-semibold" : "text-sm"}`}>{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-xl font-semibold text-foreground">{value}</p>
      <p className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground mt-0.5">{label}</p>
    </div>
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
