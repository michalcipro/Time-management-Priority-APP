/**
 * Next.js instrumentation hook – starts the in-process job scheduler on Node.js
 * servers unless a dedicated worker (JOB_RUNNER=queue) or external cron is used.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.JOB_RUNNER === "queue" || process.env.INTERNAL_SCHEDULER === "false") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startInProcessScheduler } = await import("./server/jobs/scheduler");
  startInProcessScheduler();
}
