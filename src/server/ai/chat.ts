import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { dayKey, deadlineInfo, formatTime, addDays } from "@/lib/format";
import { priorityMeta } from "@/lib/priority";
import { normalizeForSearch } from "@/lib/search-text";
import type { AssistantMessageDTO, BoardData, TeamOverview } from "@/lib/dto";
import { withActor } from "../db";
import type { SessionUser } from "../session";
import { getBoard } from "../services/board";
import { getTeamOverview } from "../services/team";
import { loadTeamSettings } from "../services/team-settings";
import { calendarScope, messageScope, taskScope } from "../services/scopes";
import { aiAvailable, describeAIError, getAnthropic, logAI } from "./client";
import { chatSystem } from "./prompts";
import { describeNow } from "./analyze-message";
import { OFFLINE_MODEL } from "./heuristics";

const BETAS = ["server-side-fallback-2026-07-01"] as const;
const HISTORY_LIMIT = 16;

export async function listAssistantMessages(user: SessionUser): Promise<AssistantMessageDTO[]> {
  const rows = await withActor(user, (db) =>
    db.assistantMessage.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 50 }),
  );
  return rows.reverse().map((r) => ({ id: r.id, role: r.role, content: r.content, createdAt: r.createdAt.toISOString() }));
}

export async function clearAssistantMessages(user: SessionUser): Promise<void> {
  await withActor(user, (db) => db.assistantMessage.deleteMany({ where: { userId: user.id } }));
}

interface ChatSnapshot {
  board: BoardData;
  team: TeamOverview | null;
  events: { title: string; start: Date; end: Date; location: string | null }[];
  context: string | null;
}

async function loadSnapshot(user: SessionUser, context?: { taskId?: string; messageId?: string }): Promise<ChatSnapshot> {
  return withActor(user, async (db) => {
    const now = new Date();
    const board = await getBoard(db, user);
    const team = user.role === "DIRECTOR" ? await getTeamOverview(db, user) : null;
    const events = await db.calendarEvent.findMany({
      where: { AND: [calendarScope(user), { userId: user.id }, { startAt: { gte: now, lt: addDays(now, 2) } }] },
      orderBy: { startAt: "asc" },
      take: 10,
      select: { title: true, startAt: true, endAt: true, location: true },
    });
    let ctx: string | null = null;
    if (context?.taskId) {
      const t = await db.task.findFirst({
        where: { AND: [{ id: context.taskId }, taskScope(user)] },
        include: {
          assignees: { include: { user: { select: { name: true } } } },
          comments: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 20 },
          sourceMessage: { select: { senderName: true, content: true, aiSummary: true } },
        },
      });
      if (t) {
        ctx = JSON.stringify({
          task: {
            title: t.title,
            description: t.description,
            client: t.clientName,
            priority: priorityMeta(t.priority).code,
            status: t.status,
            deadline: t.deadline ? deadlineInfo(t.deadline, now).label : null,
            assignees: t.assignees.map((a) => a.user.name),
            comments: t.comments.map((c) => `${c.author.name}: ${c.body}`),
            sourceMessage: t.sourceMessage ? { from: t.sourceMessage.senderName, summary: t.sourceMessage.aiSummary, content: t.sourceMessage.content.slice(0, 3000) } : null,
          },
        });
      }
    } else if (context?.messageId) {
      const m = await db.message.findFirst({ where: { AND: [{ id: context.messageId }, messageScope(user)] } });
      if (m) {
        ctx = JSON.stringify({
          message: {
            from: `${m.senderName ?? ""} <${m.senderContact}>`,
            channel: m.channel,
            subject: m.subject,
            received: describeNow(m.receivedAt),
            priority: priorityMeta(m.priority).code,
            status: m.status,
            summary: m.aiSummary,
            content: m.content.slice(0, 6000),
          },
        });
      }
    }
    return { board, team, events: events.map((e) => ({ title: e.title, start: e.startAt, end: e.endAt, location: e.location })), context: ctx };
  });
}

function snapshotText(user: SessionUser, snap: ChatSnapshot, now: Date): string {
  const data = {
    now: describeNow(now),
    stats: snap.board.stats,
    openItems: snap.board.items.slice(0, 30).map((i) => ({
      type: i.kind,
      title: i.title,
      priority: priorityMeta(i.priority).code,
      escalated: i.escalated,
      deadline: i.deadline ? deadlineInfo(i.deadline, now).label : null,
      status: i.status,
      people: i.people.map((p) => p.name),
      summary: i.summary?.slice(0, 220) ?? null,
    })),
    calendarNext48h: snap.events.map((e) => ({ title: e.title, start: describeNow(e.start), location: e.location })),
    team: snap.team?.members.map((m) => ({ name: m.user.name, title: m.user.title, open: m.open, overdue: m.overdue, utilization: `${m.utilization} %` })) ?? null,
  };
  return [
    `<data_snapshot user="${user.name}">\n${JSON.stringify(data)}\n</data_snapshot>`,
    snap.context ? `<focused_item>\n${snap.context}\n</focused_item>` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Offline assistant: rule-based answers built from the same snapshot. */
export function offlineAnswer(question: string, snap: ChatSnapshot, now: Date): string {
  const q = normalizeForSearch(question);
  const items = snap.board.items;
  const fmt = (i: (typeof items)[number]) =>
    `- **${priorityMeta(i.priority).code}** ${i.title}${i.deadline ? ` · ${deadlineInfo(i.deadline, now).label}` : ""}${i.people.length ? ` · ${i.people.map((p) => p.name).join(", ")}` : ""}`;

  if (/kalendar|schuzk|program|dnes mam/.test(q)) {
    if (snap.events.length === 0) return "V příštích 48 hodinách nemáte v kalendáři žádné události.";
    return "V příštích 48 hodinách máte:\n" + snap.events.map((e) => `- ${dayKey(e.start) === dayKey(now) ? "Dnes" : "Zítra"} ${formatTime(e.start)} – ${e.title}${e.location ? ` (${e.location})` : ""}`).join("\n");
  }
  if (/tym|vytizen|kapacit|kdo ma/.test(q) && snap.team) {
    return "Vytížení týmu:\n" + snap.team.members.map((m) => `- ${m.user.name}: ${m.open} otevřených úkolů, ${m.utilization} % kapacity${m.overdue ? `, ${m.overdue} po termínu` : ""}`).join("\n");
  }
  if (/kritick|hori|urgent/.test(q)) {
    const critical = items.filter((i) => i.priority === 1);
    return critical.length ? `Kritické položky (P1):\n${critical.map(fmt).join("\n")}` : "Momentálně nemáte žádné kritické (P1) položky. 👍";
  }
  if (/zprav|odpoved|ceka/.test(q)) {
    const waiting = items.filter((i) => i.kind === "message");
    return waiting.length ? `Zprávy čekající na odpověď:\n${waiting.slice(0, 8).map(fmt).join("\n")}` : "Žádná zpráva nečeká na odpověď.";
  }
  const top = items.slice(0, 5);
  if (top.length === 0) return "Nemáte žádné otevřené úkoly ani čekající zprávy. Skvělá práce!";
  return `Doporučuji začít v tomto pořadí:\n${top.map(fmt).join("\n")}\n\n_(Offline režim AI – pro plnohodnotné odpovědi nastavte ANTHROPIC_API_KEY.)_`;
}

/**
 * Stream an assistant answer. The user's question and the answer are stored in
 * AssistantMessage; each request includes a fresh, RBAC-scoped data snapshot.
 */
export async function streamChat(
  user: SessionUser,
  input: { message: string; context?: { taskId?: string; messageId?: string } },
): Promise<ReadableStream<Uint8Array>> {
  const now = new Date();
  const [snap, settings, members, history] = await Promise.all([
    loadSnapshot(user, input.context),
    withActor(user, (db) => loadTeamSettings(db, user.teamId)),
    withActor(user, (db) => db.user.findMany({ where: { teamId: user.teamId, isActive: true }, select: { id: true, name: true, role: true, title: true } })),
    withActor(user, (db) => db.assistantMessage.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: HISTORY_LIMIT })),
  ]);
  await withActor(user, (db) => db.assistantMessage.create({ data: { teamId: user.teamId, userId: user.id, role: "USER", content: input.message } }));

  const encoder = new TextEncoder();
  const persistAnswer = (content: string, model: string) =>
    withActor(user, (db) => db.assistantMessage.create({ data: { teamId: user.teamId, userId: user.id, role: "ASSISTANT", content, model } }));

  const anthropic = aiAvailable() ? getAnthropic() : null;
  if (!anthropic) {
    const answer = offlineAnswer(input.message, snap, now);
    await persistAnswer(answer, OFFLINE_MODEL);
    return new ReadableStream({
      async start(controller) {
        for (const chunk of answer.match(/.{1,24}(\s|$)|.+/gs) ?? [answer]) {
          controller.enqueue(encoder.encode(chunk));
          await new Promise((r) => setTimeout(r, 12));
        }
        controller.close();
      },
    });
  }

  const past = history
    .reverse()
    .map((m) => ({ role: m.role === "USER" ? ("user" as const) : ("assistant" as const), content: m.content }));
  while (past.length && past[0].role === "assistant") past.shift();

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...past,
    { role: "user", content: `${snapshotText(user, snap, now)}\n\n<question>\n${input.message}\n</question>` },
  ];

  let abort: (() => void) | null = null;
  const started = Date.now();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let text = "";
      try {
        const stream = anthropic.beta.messages.stream({
          model: settings.ai.assistantModel,
          max_tokens: 16_000,
          betas: [...BETAS],
          fallbacks: "default",
          system: [{ type: "text", text: chatSystem(settings.ai, members, user), cache_control: { type: "ephemeral" } }],
          messages,
          output_config: { effort: "low" },
        });
        abort = () => stream.abort();
        stream.on("text", (delta) => {
          text += delta;
          controller.enqueue(encoder.encode(delta));
        });
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          const note = "\n\n_Model tuto žádost odmítl zpracovat._";
          text += note;
          controller.enqueue(encoder.encode(note));
        }
        await persistAnswer(text, final.model);
        await logAI({
          kind: "CHAT",
          model: final.model,
          status: final.stop_reason === "refusal" ? "ERROR" : "SUCCESS",
          teamId: user.teamId,
          userId: user.id,
          inputTokens: final.usage.input_tokens,
          outputTokens: final.usage.output_tokens,
          cacheReadTokens: final.usage.cache_read_input_tokens ?? 0,
          latencyMs: Date.now() - started,
        });
      } catch (err) {
        const fallback = offlineAnswer(input.message, snap, now);
        const note = `${text ? "\n\n" : ""}⚠️ ${describeAIError(err)}\n\n${fallback}`;
        controller.enqueue(encoder.encode(note));
        await persistAnswer(text + note, OFFLINE_MODEL).catch(() => undefined);
        await logAI({ kind: "CHAT", model: settings.ai.assistantModel, status: "FALLBACK", teamId: user.teamId, userId: user.id, error: describeAIError(err), latencyMs: Date.now() - started });
      } finally {
        controller.close();
      }
    },
    cancel() {
      abort?.();
    },
  });
}
