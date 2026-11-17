export interface JobPayloads {
  "message.analyze": { messageId: string; force?: boolean };
  "notification.deliver": { notificationId: string };
  "integration.sync": { integrationId: string };
  "channels.sync": Record<string, never>;
  "priorities.recalculate": Record<string, never>;
  "briefings.generate": { userId?: string; force?: boolean };
  "notifications.flush": Record<string, never>;
}

export type JobName = keyof JobPayloads;

/** Recurring schedules (used by the BullMQ worker, the in-process scheduler and Vercel Cron). */
export const SCHEDULES: { name: JobName; everyMinutes: number; description: string }[] = [
  { name: "priorities.recalculate", everyMinutes: 15, description: "Přepočet priorit a eskalace" },
  { name: "channels.sync", everyMinutes: 10, description: "Synchronizace e-mailových schránek" },
  { name: "briefings.generate", everyMinutes: 15, description: "Ranní AI briefingy" },
  { name: "notifications.flush", everyMinutes: 15, description: "Doručení upozornění po klidových hodinách" },
];

export const CRON_JOBS = new Set<JobName>(SCHEDULES.map((s) => s.name));
