import { Handlers, PageProps } from "$fresh/server.ts";
import { getDashboardData } from "../lib/db.ts";
import { DashboardData } from "../lib/types.ts";
import DashboardIsland from "../islands/Dashboard.tsx";

export const handler: Handlers<DashboardData> = {
  async GET(_req, ctx) {
    const data = await getDashboardData();
    return ctx.render(data);
  },
};

export default function Home({ data }: PageProps<DashboardData>) {
  return (
    <div class="max-w-6xl mx-auto px-4 py-8">
      <header class="mb-8">
        <h1 class="text-3xl font-bold text-white">
          Ethos Score vs Holdings
        </h1>
        <p class="text-gray-400 mt-2">
          Analyzing the correlation between Ethos credibility scores and
          on-chain purchasing power
        </p>
      </header>

      <DashboardIsland data={data} />
    </div>
  );
}
