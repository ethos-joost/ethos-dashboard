"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { BracketData } from "@/lib/data";

function formatUSD(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  return `$${value.toFixed(0)}`;
}

export function HoldingsChart({ brackets }: { brackets: BracketData[] }) {
  const data = brackets.map((b) => ({
    name: b.label,
    "Avg (trimmed)": b.trimmedAvgHoldings,
    Median: b.medianHoldings,
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} barGap={12} barSize={48}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="hsl(0 0% 89.8%)"
          vertical={false}
        />
        <XAxis
          dataKey="name"
          tick={{ fill: "hsl(0 0% 45.1%)", fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatUSD}
          tick={{ fill: "hsl(0 0% 45.1%)", fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip
          shared={false}
          cursor={false}
          formatter={(value) => formatUSD(Number(value))}
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid hsl(0 0% 89.8%)",
            borderRadius: "6px",
            fontSize: "12px",
            fontFamily: "var(--font-geist-mono)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        />
        <Bar
          dataKey="Avg (trimmed)"
          fill="hsl(0 0% 9%)"
          radius={[3, 3, 0, 0]}
        />
        <Bar
          dataKey="Median"
          fill="hsl(0 0% 72%)"
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
