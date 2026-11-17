import { apiRoute } from "@/server/api";
import { generateBriefing, getTodayBriefing } from "@/server/ai/briefing";

export const GET = apiRoute(async ({ user }) => ({ briefing: await getTodayBriefing(user) }), { permission: "ai:use" });

/** Generate or regenerate today's briefing on demand. */
export const POST = apiRoute(
  async ({ user }) => ({ briefing: await generateBriefing(user, { force: true }) }),
  { permission: "ai:use", limit: 10, limitKey: "briefing" },
);
