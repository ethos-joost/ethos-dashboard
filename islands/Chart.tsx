import { useEffect, useRef } from "preact/hooks";
import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

interface BracketChartData {
  label: string;
  avgHoldings: number;
  trimmedAvgHoldings: number;
  medianHoldings: number;
  totalHoldings: number;
  userCount: number;
}

interface Props {
  brackets: BracketChartData[];
}

export default function ChartIsland({ brackets }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const labels = brackets.map((b) => b.label);

    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Avg Holdings (trimmed 5%)",
            data: brackets.map((b) => b.trimmedAvgHoldings),
            backgroundColor: "rgba(249, 115, 22, 0.7)",
            borderColor: "rgb(249, 115, 22)",
            borderWidth: 2,
            borderRadius: 4,
          },
          {
            label: "Median Holdings",
            data: brackets.map((b) => b.medianHoldings),
            backgroundColor: "rgba(99, 102, 241, 0.7)",
            borderColor: "rgb(99, 102, 241)",
            borderWidth: 2,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: { color: "#d1d5db", font: { size: 13 } },
          },
          tooltip: {
            backgroundColor: "#1f2937",
            titleColor: "#f3f4f6",
            bodyColor: "#f3f4f6",
            borderColor: "#374151",
            borderWidth: 1,
            callbacks: {
              label: (ctx) =>
                `${ctx.dataset.label}: $${ctx.parsed.y.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: "#9ca3af", font: { size: 14 } },
            grid: { color: "rgba(75, 85, 99, 0.3)" },
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: "#9ca3af",
              callback: (value) => {
                const v = value as number;
                if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
                if (v >= 1000) return `$${(v / 1000).toFixed(0)}k`;
                return `$${v.toFixed(0)}`;
              },
            },
            grid: { color: "rgba(75, 85, 99, 0.3)" },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
    };
  }, [brackets]);

  return (
    <div style={{ height: "400px" }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
