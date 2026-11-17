import type { NextRequest } from "next/server";
import { getSessionUser } from "@/server/session";
import { subscribe } from "@/server/realtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Server-Sent Events stream. Events only carry ids/titles for the recipient; the
 * client re-fetches data through the RBAC-protected API.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      send("ready", { at: Date.now() });
      const unsubscribe = subscribe((e) => {
        if (e.teamId !== user.teamId) return;
        switch (e.type) {
          case "notification":
            if (e.userIds.includes(user.id)) send("notification", { title: e.title, body: e.body, link: e.link, priority: e.priority });
            break;
          case "briefing.ready":
            if (e.userIds.includes(user.id)) send("briefing", {});
            break;
          case "messages.changed":
            send("messages", { ids: e.messageIds });
            break;
          case "tasks.changed":
            send("tasks", { ids: e.taskIds });
            break;
          case "integrations.changed":
            send("integrations", {});
            break;
        }
      });
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
        } catch {
          cleanup();
        }
      }, 25_000);
      cleanup = () => {
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
