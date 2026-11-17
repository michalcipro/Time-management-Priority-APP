import "server-only";
import { EventEmitter } from "node:events";
import { createRedisConnection } from "./redis";

/**
 * Realtime fan-out for Server-Sent Events.
 *
 * Events are published to Redis (when configured) so that every web instance –
 * and the background worker – reaches every connected browser. Without Redis an
 * in-process EventEmitter is used (single instance deployments, local dev).
 */
export type RealtimeEvent =
  | { type: "notification"; teamId: string; userIds: string[]; title: string; body?: string | null; link?: string | null; priority?: number | null }
  | { type: "messages.changed"; teamId: string; messageIds: string[] }
  | { type: "tasks.changed"; teamId: string; taskIds: string[] }
  | { type: "briefing.ready"; teamId: string; userIds: string[] }
  | { type: "integrations.changed"; teamId: string };

const CHANNEL = "priority-agent:realtime";

interface BusState {
  emitter: EventEmitter;
  publisher: ReturnType<typeof createRedisConnection> | undefined;
  subscriberReady: boolean;
}

const g = globalThis as unknown as { __realtime?: BusState };

function state(): BusState {
  if (!g.__realtime) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    g.__realtime = { emitter, publisher: undefined, subscriberReady: false };
  }
  return g.__realtime;
}

function ensureSubscriber() {
  const s = state();
  if (s.subscriberReady || !process.env.REDIS_URL) return;
  const sub = createRedisConnection();
  if (!sub) return;
  s.subscriberReady = true;
  sub.on("error", (e) => console.warn("[realtime] redis subscriber:", e.message));
  sub.subscribe(CHANNEL).catch((e) => console.warn("[realtime] subscribe failed:", e.message));
  sub.on("message", (_channel, raw) => {
    try {
      s.emitter.emit("event", JSON.parse(raw) as RealtimeEvent);
    } catch {
      /* ignore malformed */
    }
  });
}

export async function publish(event: RealtimeEvent): Promise<void> {
  const s = state();
  if (process.env.REDIS_URL) {
    if (s.publisher === undefined) s.publisher = createRedisConnection();
    if (s.publisher) {
      try {
        await s.publisher.publish(CHANNEL, JSON.stringify(event));
        return;
      } catch (e) {
        console.warn("[realtime] publish failed, delivering locally:", (e as Error).message);
      }
    }
  }
  s.emitter.emit("event", event);
}

export function subscribe(listener: (event: RealtimeEvent) => void): () => void {
  ensureSubscriber();
  const s = state();
  s.emitter.on("event", listener);
  return () => s.emitter.off("event", listener);
}
