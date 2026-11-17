import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { safeEqual } from "@/server/crypto";
import { runJob } from "@/server/jobs/handlers";
import { CRON_JOBS, type JobName } from "@/server/jobs/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled job trigger for serverless hosting (Vercel Cron, GitHub Actions, any
 * external scheduler). Protected by `Authorization: Bearer <CRON_SECRET>`.
 */
async function handle(req: NextRequest, ctx: { params: Promise<{ job: string }> }) {
  const { job } = await ctx.params;
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!env.cronSecret || !safeEqual(provided, env.cronSecret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!CRON_JOBS.has(job as JobName)) return NextResponse.json({ error: "unknown_job" }, { status: 404 });
  const started = Date.now();
  const result = await runJob(job as JobName, {});
  return NextResponse.json({ ok: true, job, ms: Date.now() - started, result });
}

export const GET = handle;
export const POST = handle;
