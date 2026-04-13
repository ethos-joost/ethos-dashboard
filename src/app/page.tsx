import Image from "next/image";
import { getDashboardData, type BracketData } from "@/lib/data";
import { HoldingsChart } from "@/components/chart";

function formatUSD(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

export default function Home() {
  const data = getDashboardData();
  const { brackets, totalUsers, multiplier, profilesWithHoldings, lastIngestedAt } = data;

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
              Users with score{" "}
              <span className="font-semibold">1600+</span> have{" "}
              <span className="font-mono font-bold text-4xl">{multiplier}x</span>{" "}
              the purchasing power of{" "}
              <span className="font-semibold">1200–1300</span> users
            </p>
          </div>
        )}

        {/* Comparison cards */}
        {low && high && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <BracketCard bracket={low} label="1200–1300" />
            <BracketCard bracket={high} label="1600+" highlight />
          </div>
        )}

        {/* Chart */}
        {low && high && (
          <div className="rounded-lg border border-border/50 p-6">
            <h2 className="font-mono text-xs tracking-widest uppercase text-muted-foreground mb-6">
              Holdings Comparison
            </h2>
            <HoldingsChart brackets={[low, high]} />
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Profiles" value={totalUsers.toLocaleString()} />
          <Stat label="With holdings" value={profilesWithHoldings.toLocaleString()} />
          <Stat label="1200–1300" value={low?.userCount.toLocaleString() ?? "0"} />
          <Stat label="1600+" value={high?.userCount.toLocaleString() ?? "0"} />
        </div>

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
          : "border-border/50 text-foreground"
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
        <Row
          label="Users"
          value={bracket.userCount.toLocaleString()}
          muted={highlight}
        />
        <div className={`border-t ${highlight ? "border-background/10" : "border-border/50"}`} />
        <Row
          label="Avg (trimmed)"
          value={`$${formatUSD(bracket.trimmedAvgHoldings)}`}
          muted={highlight}
          large
        />
        <Row
          label="Median"
          value={`$${formatUSD(bracket.medianHoldings)}`}
          muted={highlight}
        />
        <Row
          label="Total"
          value={`$${formatUSD(bracket.totalHoldings)}`}
          muted={highlight}
        />
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
