import { apiRoute, parseJson } from "@/server/api";
import { chatSchema } from "@/lib/validation";
import { clearAssistantMessages, listAssistantMessages, streamChat } from "@/server/ai/chat";

export const GET = apiRoute(async ({ user }) => ({ messages: await listAssistantMessages(user) }), { permission: "ai:use" });

/** Streams the assistant's answer as plain text (UTF-8 chunks). */
export const POST = apiRoute(
  async ({ req, user }) => {
    const input = await parseJson(req, chatSchema);
    const stream = await streamChat(user, input);
    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  },
  { permission: "ai:use", limit: 20, limitKey: "chat" },
);

export const DELETE = apiRoute(async ({ user }) => {
  await clearAssistantMessages(user);
  return { ok: true };
}, { permission: "ai:use" });
