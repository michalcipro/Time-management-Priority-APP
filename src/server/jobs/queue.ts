import "server-only";
import type { Queue } from "bullmq";
import type { JobName, JobPayloads } from "./types";

/**
 * Job dispatch.
 *
 *  JOB_RUNNER=queue  → BullMQ on Redis, processed by `npm run worker` (retries, backoff).
 *  JOB_RUNNER=inline → (default) executed in-process after the response is sent
 *                      (Next.js `after()`), suitable for single-instance and serverless.
 */
export const QUEUE_NAME = "priority-agent";

export function jobRunnerMode(): "queue" | "inline" {
  return process.env.JOB_RUNNER === "queue" && process.env.REDIS_URL ? "queue" : "inline";
}

const g = globalThis as unknown as { __jobQueue?: Queue };

async function getQueue(): Promise<Queue> {
  if (!g.__jobQueue) {
    const { Queue } = await import("bullmq");
    const { createRedisConnection } = await import("../redis");
    g.__jobQueue = new Queue(QUEUE_NAME, { connection: createRedisConnection({ forBullMQ: true })! });
  }
  return g.__jobQueue;
}

export async function enqueue<N extends JobName>(name: N, payload: JobPayloads[N], opts: { delayMs?: number; jobId?: string } = {}) {
  if (jobRunnerMode() === "queue") {
    const queue = await getQueue();
    await queue.add(name, payload, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: 500,
      removeOnFail: 1_000,
      delay: opts.delayMs,
      jobId: opts.jobId,
    });
    return;
  }

  const run = async () => {
    try {
      const { runJob } = await import("./handlers");
      await runJob(name, payload);
    } catch (err) {
      console.error(`[job:${name}] failed`, err);
    }
  };
  try {
    const { after } = await import("next/server");
    after(run);
  } catch {
    setTimeout(run, opts.delayMs ?? 0);
  }
}
