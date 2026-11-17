import "server-only";
import { withActor } from "../db";
import type { SessionUser } from "../session";
import { notFound } from "../errors";
import { messageScope } from "../services/scopes";
import { loadTeamSettings } from "../services/team-settings";
import { aiAvailable, callStructured, describeAIError } from "./client";
import { replyDraftSchema } from "./schemas";
import { replyDraftSystem } from "./prompts";
import { heuristicDraft, OFFLINE_MODEL } from "./heuristics";
import { describeNow } from "./analyze-message";

/** Draft or rewrite a reply on request ("make it more formal", "decline politely" …). */
export async function draftReply(
  user: SessionUser,
  messageId: string,
  input: { instruction?: string; draft?: string },
): Promise<{ text: string; model: string; warning?: string }> {
  const { message, settings } = await withActor(user, async (db) => {
    const message = await db.message.findFirst({ where: { AND: [{ id: messageId }, messageScope(user)] } });
    if (!message) throw notFound("Zpráva");
    return { message, settings: await loadTeamSettings(db, user.teamId) };
  });

  const offline = () => heuristicDraft(message, input.instruction, settings.ai.signature);
  if (!aiAvailable()) return { text: offline(), model: OFFLINE_MODEL };

  try {
    const prompt = [
      `Current date and time: ${describeNow(new Date())}`,
      `Channel: ${message.channel}`,
      `Writing on behalf of: ${user.name}`,
      `Incoming message from ${message.senderName ?? message.senderContact}${message.subject ? ` (subject: ${message.subject})` : ""}:`,
      `<message>\n${message.content.slice(0, 8000)}\n</message>`,
      input.draft?.trim() ? `Current draft to improve:\n<draft>\n${input.draft.slice(0, 8000)}\n</draft>` : "Write a new reply.",
      input.instruction?.trim() ? `Instruction from the user: ${input.instruction.trim()}` : "Make it clear, polite and concise.",
    ].join("\n\n");
    const result = await callStructured({
      kind: "REPLY_DRAFT",
      model: settings.ai.analysisModel,
      system: replyDraftSystem(settings.ai),
      prompt,
      schema: replyDraftSchema,
      effort: "low",
      teamId: user.teamId,
      userId: user.id,
      messageId: message.id,
    });
    return { text: result.data.text.trim(), model: result.model };
  } catch (err) {
    return { text: offline(), model: OFFLINE_MODEL, warning: describeAIError(err) };
  }
}
