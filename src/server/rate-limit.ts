import "server-only";
import { getRedis } from "./redis";

/**
 * Fixed-window rate limiter. Uses Redis when available (shared across instances),
 * otherwise an in-memory window per process.
 */
export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfter: number;
}

const memory = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const bucket = Math.floor(now / windowMs);
  const resetAt = (bucket + 1) * windowMs;
  const redisKey = `rl:${key}:${bucket}`;

  const redis = getRedis();
  if (redis && redis.status === "ready") {
    try {
      const count = await redis.incr(redisKey);
      if (count === 1) await redis.pexpire(redisKey, windowMs + 1000);
      return { ok: count <= limit, remaining: Math.max(0, limit - count), retryAfter: Math.ceil((resetAt - now) / 1000) };
    } catch {
      // fall through to memory
    }
  }

  const entry = memory.get(redisKey);
  if (!entry || entry.resetAt <= now) {
    memory.set(redisKey, { count: 1, resetAt });
    if (memory.size > 10_000) {
      for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
    }
    return { ok: true, remaining: limit - 1, retryAfter: Math.ceil((resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { ok: entry.count <= limit, remaining: Math.max(0, limit - entry.count), retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}
