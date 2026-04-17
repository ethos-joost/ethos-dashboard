"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ScoreIcon } from "@/components/score-icon";

interface SliderProfile {
  score: number;
  holdingsUSD: number;
}

export function ScoreSlider({ profiles }: { profiles: SliderProfile[] }) {
  const [threshold, setThreshold] = useState(1600);

  const stats = useMemo(() => {
    const above = profiles.filter((p) => p.score >= threshold && p.holdingsUSD > 0);
    const below = profiles.filter((p) => p.score < threshold && p.score >= 1200 && p.holdingsUSD > 0);

    function median(arr: number[]) {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    }

    const aboveMedian = median(above.map((p) => p.holdingsUSD));
    const belowMedian = median(below.map((p) => p.holdingsUSD));
    const multiplier = belowMedian > 0 ? aboveMedian / belowMedian : 0;

    return {
      aboveCount: above.length,
      belowCount: below.length,
      aboveMedian,
      belowMedian,
      multiplier,
    };
  }, [threshold, profiles]);

  function formatUSD(n: number) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex justify-between items-baseline mb-2">
          <p className="font-mono text-xs tracking-widest uppercase text-muted-foreground">
            Score threshold
          </p>
          <span className="font-mono text-2xl font-bold inline-flex items-center gap-2">
            <ScoreIcon className="w-5 h-[1.3rem] shrink-0" />
            {threshold}
          </span>
        </div>
        <input
          type="range"
          min={1200}
          max={2200}
          step={50}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-foreground"
        />
        <div className="flex justify-between font-mono text-[10px] text-muted-foreground mt-1">
          <span>1200</span>
          <span>2200</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="font-mono text-xs text-muted-foreground inline-flex items-center gap-1 justify-center">
            Below
            <ScoreIcon className="w-2.5 h-[0.66rem] shrink-0" />
            {threshold}
          </p>
          <p className="font-mono text-lg font-semibold">{stats.belowCount.toLocaleString()}</p>
          <p className="font-mono text-xs text-muted-foreground">
            median {formatUSD(stats.belowMedian)}
          </p>
        </div>
        <div>
          <p className="font-mono text-xs text-muted-foreground">Multiplier</p>
          <motion.p
            key={stats.multiplier.toFixed(1)}
            initial={{ scale: 1.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="font-mono text-2xl font-bold"
          >
            {stats.multiplier > 0 ? `${stats.multiplier.toFixed(1)}x` : "—"}
          </motion.p>
          <p className="font-mono text-xs text-muted-foreground">median gap</p>
        </div>
        <div>
          <p className="font-mono text-xs text-muted-foreground inline-flex items-center gap-1 justify-center">
            Above
            <ScoreIcon className="w-2.5 h-[0.66rem] shrink-0" />
            {threshold}
          </p>
          <p className="font-mono text-lg font-semibold">{stats.aboveCount.toLocaleString()}</p>
          <p className="font-mono text-xs text-muted-foreground">
            median {formatUSD(stats.aboveMedian)}
          </p>
        </div>
      </div>
    </div>
  );
}
