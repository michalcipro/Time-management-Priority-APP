import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { features } from "@/server/env";
import { getRedis } from "@/server/redis";
import { jobRunnerMode } from "@/server/jobs/queue";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe for load balancers and uptime monitors. */
export async function GET() {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
  }
  const redis = getRedis();
  let redisOk: boolean | null = null;
  if (redis) {
    for (let i = 0; i < 10 && redis.status !== "ready"; i++) await new Promise((r) => setTimeout(r, 100));
    try {
      redisOk = (await redis.ping()) === "PONG";
    } catch {
      redisOk = false;
    }
  }
  return NextResponse.json(
    {
      ok: db,
      db,
      redis: redisOk,
      jobs: jobRunnerMode(),
      ai: features.ai ? "claude" : "offline",
      time: new Date().toISOString(),
    },
    { status: db ? 200 : 503 },
  );
}
