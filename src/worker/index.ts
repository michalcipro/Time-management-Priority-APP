/**
 * Background worker (BullMQ on Redis).
 *
 *   JOB_RUNNER=queue REDIS_URL=redis://… npm run worker
 *
 * Processes queued jobs (AI analysis, notification delivery, mailbox sync) and owns
 * the recurring schedules (priority recalculation, channel sync, briefings).
 */
import "dotenv/config";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { QUEUE_NAME } from "../server/jobs/queue";
import { SCHEDULES, type JobName, type JobPayloads } from "../server/jobs/types";
import { runJob } from "../server/jobs/handlers";

const url = process.env.REDIS_URL;
if (!url) {
  console.error("REDIS_URL is required for the worker. Without Redis, jobs run in-process in the web server.");
  process.exit(1);
}

const connection = new IORedis(url, { maxRetriesPerRequest: null });
const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);

async function main() {
  const queue = new Queue(QUEUE_NAME, { connection });
  for (const s of SCHEDULES) {
    await queue.upsertJobScheduler(`schedule:${s.name}`, { every: s.everyMinutes * 60_000 }, { name: s.name, data: {} });
  }

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const started = Date.now();
      const result = await runJob(job.name as JobName, job.data as JobPayloads[JobName]);
      const summary = job.name === "message.analyze" ? (result as { model?: string } | null)?.model ?? "skipped" : job.name === "notification.deliver" ? undefined : result;
      if (summary !== undefined) console.info(`[worker] ${job.name} done in ${Date.now() - started} ms`, typeof summary === "string" ? summary : JSON.stringify(summary));
      return result;
    },
    { connection, concurrency },
  );
  worker.on("failed", (job, err) => console.error(`[worker] ${job?.name} failed (attempt ${job?.attemptsMade}):`, err.message));
  worker.on("error", (err) => console.error("[worker] error", err.message));

  console.info(`[worker] listening on "${QUEUE_NAME}" (concurrency ${concurrency}); schedules: ${SCHEDULES.map((s) => `${s.name} every ${s.everyMinutes} min`).join(", ")}`);

  const shutdown = async (signal: string) => {
    console.info(`[worker] ${signal} received, shutting down…`);
    await worker.close();
    await queue.close();
    await connection.quit();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
