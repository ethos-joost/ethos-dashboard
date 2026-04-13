import { Handlers } from "$fresh/server.ts";
import { getDashboardData } from "../../lib/db.ts";

export const handler: Handlers = {
  async GET(_req, _ctx) {
    const data = await getDashboardData();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  },
};
