"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { BracketData } from "@/lib/data";

// Grouped histogram showing the % of each bracket's users that fall
// into each holdings bin. Normalising to % keeps the comparison fair
// despite one bracket being ~60x larger than the other.
export function HoldingsChart({ brackets }: { brackets: BracketData[] }) {
  const bins = brackets[0].tiers.map((t, i) => {
    const row: Record<string, string | number> = { bin: t.label };
    for (const b of brackets) {
      row[b.label] = b.tiers[i]?.pct ?? 0;
    }
    return row;
  });

  const colors = ["hsl(0 0% 78%)", "hsl(0 0% 45%)", "hsl(0 0% 9%)"];

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={bins} barGap={3} barSize={14} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="hsl(0 0% 89.8%)"
          vertical={false}
        />
        <XAxis
          dataKey="bin"
          tick={{ fill: "hsl(0 0% 45.1%)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <YAxis
          tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
          tick={{ fill: "hsl(0 0% 45.1%)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip
          cursor={false}
          formatter={(value) => `${Number(value).toFixed(1)}%`}
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid hsl(0 0% 89.8%)",
            borderRadius: "6px",
            fontSize: "12px",
            fontFamily: "var(--font-geist-mono)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        />
        <Legend
          wrapperStyle={{
            fontSize: 11,
            fontFamily: "var(--font-geist-mono)",
            paddingTop: 4,
          }}
          iconType="square"
        />
        {brackets.map((b, i) => (
          <Bar
            key={b.label}
            dataKey={b.label}
            fill={colors[i % colors.length]}
            radius={[3, 3, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
