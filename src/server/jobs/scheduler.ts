import "server-only";
import { SCHEDULES } from "./types";
import { runJob } from "./handlers";

/**
 * Lightweight in-process scheduler for single-instance deployments (`next start`,
 * `next dev`). Disabled when the BullMQ worker owns scheduling (JOB_RUNNER=queue)
 * or on serverless platforms (INTERNAL_SCHEDULER=false; use Vercel Cron instead).
 */
const g = globalThis as unknown as { __schedulerStarted?: boolean };

export function startInProcessScheduler() {
  if (g.__schedulerStarted) return;
  g.__schedulerStarted = true;
  const running = new Set<string>();

  for (const schedule of SCHEDULES) {
    const tick = async () => {
      if (running.has(schedule.name)) return;
      running.add(schedule.name);
      try {
        await runJob(schedule.name, {});
      } catch (err) {
        console.error(`[scheduler] ${schedule.name} failed`, err);
      } finally {
        running.delete(schedule.name);
      }
    };
    // Stagger the first runs so a cold start does not hit everything at once.
    setTimeout(tick, 15_000 + Math.floor(Math.random() * 20_000));
    setInterval(tick, schedule.everyMinutes * 60_000).unref?.();
  }
  console.info(`[scheduler] in-process scheduler started (${SCHEDULES.map((s) => `${s.name}/${s.everyMinutes}m`).join(", ")})`);
}
