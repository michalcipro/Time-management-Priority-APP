"use client";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

/**
 * Subscribes to /api/realtime (SSE) and invalidates cached queries when data
 * changes anywhere in the team. Shows a toast for new notifications.
 */
export function useRealtime(enabled = true, showToasts = true) {
  const qc = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
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
          const data = JSON.parse((e as MessageEvent).data) as { title: string; body?: string; link?: string; priority?: number };
          const fn = data.priority && data.priority <= 2 ? toast.warning : toast.info;
          fn(data.title, {
            description: data.body ? data.body.slice(0, 140) : undefined,
            action: data.link ? { label: "Otevřít", onClick: () => router.push(data.link!) } : undefined,
          });
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
  }, [enabled, qc, router, showToasts]);
}
