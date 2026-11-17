import type { NextRequest } from "next/server";
import { prisma, withActor } from "@/server/db";
import { icsFeedFor } from "@/server/services/calendar";
import { rateLimit, clientIp } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/** Personal calendar subscription feed (Apple Calendar, Outlook, Google Calendar). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const rl = await rateLimit(`ics:${clientIp(req.headers)}`, 60, 60);
  if (!rl.ok) return new Response("Too Many Requests", { status: 429 });
  const clean = token.replace(/\.ics$/, "");
  if (clean.length < 16) return new Response("Not found", { status: 404 });
  const user = await prisma.user.findUnique({ where: { icsToken: clean }, select: { id: true, teamId: true, role: true, isActive: true } });
  if (!user || !user.isActive) return new Response("Not found", { status: 404 });
  const body = await withActor(user, (db) => icsFeedFor(db, user.id));
  return new Response(body, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="priority-agent.ics"', "Cache-Control": "private, max-age=300" },
  });
}
