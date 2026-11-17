"use client";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import type { NotificationDTO } from "@/lib/dto";

/** "sse": server-sent events (long-running servers); "poll": periodic refresh (serverless hosting). */
export type RealtimeTransport = "sse" | "poll";

type Router = ReturnType<typeof useRouter>;

interface ToastPayload {
  title: string;
  body?: string | null;
  link?: string | null;
  priority?: number | null;
}

function showNotificationToast(router: Router, data: ToastPayload) {
  const fn = data.priority && data.priority <= 2 ? toast.warning : toast.info;
  fn(data.title, {
    description: data.body ? data.body.slice(0, 140) : undefined,
    action: data.link ? { label: "Otevřít", onClick: () => router.push(data.link!) } : undefined,
  });
}

const NOTIFICATION_KEYS = [["notifications"]];
const DATA_KEYS = [["messages"], ["tasks"], ["board"], ["team"], ["ai", "briefing"]];
const POLL_NOTIFICATIONS_MS = 30_000;
const POLL_DATA_MS = 60_000;

/**
 * Keeps cached queries fresh when data changes anywhere in the team and shows a
 * toast for new notifications.
 * - sse: subscribes to /api/realtime and invalidates exactly what changed.
 * - poll: while the tab is visible, refreshes notifications every 30 s and the
 *   rest every 60 s; new unread notifications are detected by id.
 */
export function useRealtime(transport: RealtimeTransport = "sse", showToasts = true) {
  const qc = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    if (transport !== "sse" || typeof EventSource === "undefined") return;
    let source: EventSource | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const connect = () => {
      source = new EventSource("/api/realtime");
      source.addEventListener("ready", () => {
        retry = 0;
      });
      source.addEventListener("messages", () => {
        qc.invalidateQueries({ queryKey: ["messages"] });
        qc.invalidateQueries({ queryKey: ["board"] });
      });
      source.addEventListener("tasks", () => {
        qc.invalidateQueries({ queryKey: ["tasks"] });
        qc.invalidateQueries({ queryKey: ["board"] });
        qc.invalidateQueries({ queryKey: ["team"] });
      });
      source.addEventListener("integrations", () => qc.invalidateQueries({ queryKey: ["integrations"] }));
      source.addEventListener("briefing", () => qc.invalidateQueries({ queryKey: ["ai", "briefing"] }));
      source.addEventListener("notification", (e) => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
        if (!showToasts) return;
        try {
          showNotificationToast(router, JSON.parse((e as MessageEvent).data) as ToastPayload);
        } catch {
          /* ignore */
        }
      });
      source.onerror = () => {
        source?.close();
        if (closed) return;
        retry = Math.min(retry + 1, 6);
        timer = setTimeout(connect, 1000 * 2 ** retry);
      };
    };
    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      source?.close();
    };
  }, [transport, qc, router, showToasts]);

  useEffect(() => {
    if (transport !== "poll") return;
    const visible = () => document.visibilityState === "visible";
    const refresh = (keys: string[][]) => {
      for (const queryKey of keys) qc.invalidateQueries({ queryKey });
    };
    const fast = setInterval(() => visible() && refresh(NOTIFICATION_KEYS), POLL_NOTIFICATIONS_MS);
    const slow = setInterval(() => visible() && refresh(DATA_KEYS), POLL_DATA_MS);
    const onVisibility = () => {
      if (visible()) refresh([...NOTIFICATION_KEYS, ...DATA_KEYS]);
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Toast notifications that arrived since the previous poll; never on first load.
    let seen: Set<string> | null = null;
    const initial = qc.getQueryData<{ items?: NotificationDTO[] }>(["notifications"]);
    if (initial?.items) seen = new Set(initial.items.map((n) => n.id));
    const unsubscribe = qc.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "success") return;
      if (event.query.queryKey[0] !== "notifications") return;
      const items = (event.query.state.data as { items?: NotificationDTO[] } | undefined)?.items ?? [];
      if (!seen) {
        seen = new Set(items.map((n) => n.id));
        return;
      }
      const known = seen;
      const fresh = items.filter((n) => !known.has(n.id) && !n.readAt);
      for (const n of items) known.add(n.id);
      if (!showToasts) return;
      // Oldest first, at most three at once.
      for (const n of fresh.slice(0, 3).reverse()) showNotificationToast(router, n);
    });

    return () => {
      clearInterval(fast);
      clearInterval(slow);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
    };
  }, [transport, qc, router, showToasts]);
}
