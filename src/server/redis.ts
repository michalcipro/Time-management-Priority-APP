import "server-only";
import IORedis, { type Redis } from "ioredis";

/**
 * Optional Redis connections (rate limiting, realtime fan-out, BullMQ).
 * When REDIS_URL is not configured every consumer falls back to in-process
 * implementations, so the app still runs as a single instance.
 */
const globalForRedis = globalThis as unknown as { __redis?: Redis | null };

export function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (globalForRedis.__redis === undefined) {
    const client = new IORedis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: false });
    client.on("error", (err) => {
      if (process.env.NODE_ENV !== "test") console.warn("[redis]", err.message);
    });
    globalForRedis.__redis = client;
  }
  return globalForRedis.__redis ?? null;
}

/** A dedicated connection (required for SUBSCRIBE and BullMQ workers). */
export function createRedisConnection(options: { forBullMQ?: boolean } = {}): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  return new IORedis(url, options.forBullMQ ? { maxRetriesPerRequest: null } : { maxRetriesPerRequest: 2 });
}
