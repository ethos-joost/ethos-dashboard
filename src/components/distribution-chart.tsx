"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { BracketData } from "@/lib/data";

export function DistributionChart({ brackets }: { brackets: BracketData[] }) {
  const low = brackets[0];
  const high = brackets[1];

  // Merge distributions into one dataset with percentages for fair comparison
  const data = low.distribution.map((d, i) => ({
    bin: d.bin,
    "1200–1300": low.userCount > 0 ? Math.round((d.count / low.userCount) * 1000) / 10 : 0,
    "1600+": high.userCount > 0 ? Math.round((high.distribution[i].count / high.userCount) * 1000) / 10 : 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} barGap={2} barSize={20}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 89.8%)" vertical={false} />
        <XAxis
          dataKey="bin"
          tick={{ fill: "hsl(0 0% 45.1%)", fontSize: 10, fontFamily: "var(--font-geist-mono)" }}
          axisLine={false}
          tickLine={false}
          angle={-35}
          textAnchor="end"
          height={50}
        />
        <YAxis
          tickFormatter={(v) => `${v}%`}
          tick={{ fill: "hsl(0 0% 45.1%)", fontSize: 11, fontFamily: "var(--font-geist-mono)" }}
          axisLine={false}
          tickLine={false}
          width={45}
        />
        <Tooltip
          shared={false}
          cursor={false}
          formatter={(value) => `${value}%`}
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid hsl(0 0% 89.8%)",
            borderRadius: "6px",
            fontSize: "12px",
            fontFamily: "var(--font-geist-mono)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          }}
        />
        <Bar dataKey="1200–1300" fill="hsl(0 0% 72%)" radius={[2, 2, 0, 0]} />
        <Bar dataKey="1600+" fill="hsl(0 0% 9%)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
