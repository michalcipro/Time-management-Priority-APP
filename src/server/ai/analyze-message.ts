import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { clampPriority, computeMessagePriority, priorityMeta } from "@/lib/priority";
import { formatLongDate, formatTime, tzOffsetMinutes } from "@/lib/format";
import { buildSearchText } from "@/lib/search-text";
import { parseTeamSettings, rulesFromSettings } from "@/lib/settings";
import type { AIReplySuggestion, AITaskSuggestion } from "@/lib/ai-types";
import { withSystem } from "../db";
import { notify } from "../notifications";
import { publish } from "../realtime";
import { aiAvailable, callStructured, describeAIError, logAI } from "./client";
import { messageAnalysisSystem } from "./prompts";
import { messageAnalysisSchema, type MessageAnalysisRaw } from "./schemas";
import { heuristicAnalysis, OFFLINE_MODEL } from "./heuristics";

export function describeNow(now: Date): string {
  const offset = tzOffsetMinutes(now);
  const sign = offset >= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const mm = String(Math.abs(offset) % 60).padStart(2, "0");
  return `${formatLongDate(now)} ${formatTime(now)} (Europe/Prague, UTC${sign}${hh}:${mm})`;
}

function validIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  // Ignore obviously wrong years (hallucinated or mis-parsed).
  const year = new Date(t).getUTCFullYear();
  const current = new Date().getUTCFullYear();
  if (year < current - 1 || year > current + 3) return null;
  return new Date(t).toISOString();
}

/** Clamp and sanitise a raw analysis (from Claude or heuristics). */
export function normalizeAnalysis(raw: MessageAnalysisRaw, teamIds: Set<string>) {
  const tasks: AITaskSuggestion[] = (raw.tasks ?? []).slice(0, 3).map((t) => ({
    title: (t.title ?? "").trim().slice(0, 200) || "Navazující úkol",
    description: t.description?.trim().slice(0, 2000) || null,
    deadline: validIso(t.deadline),
    priority: clampPriority(t.priority ?? raw.suggestedPriority),
    suggestedAssigneeId: t.suggestedAssigneeId && teamIds.has(t.suggestedAssigneeId) ? t.suggestedAssigneeId : null,
  }));
  const replies: AIReplySuggestion[] = (raw.replies ?? [])
    .filter((r) => r.text?.trim())
    .slice(0, 3)
    .map((r) => ({ label: (r.label ?? "Návrh").trim().slice(0, 40), text: r.text.trim().slice(0, 6000) }));
  const deadlines = (raw.deadlines ?? [])
    .map((d) => ({ date: validIso(d.date), label: (d.label ?? "").trim().slice(0, 120) }))
    .filter((d): d is { date: string; label: string } => Boolean(d.date))
    .slice(0, 5);
  return {
    summary: (raw.summary ?? "").trim().slice(0, 600),
    intent: (raw.intent ?? "").trim().slice(0, 120),
    topics: (raw.topics ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 5),
    sentiment: raw.sentiment ?? "neutral",
    suggestedPriority: clampPriority(raw.suggestedPriority ?? 3),
    priorityReason: (raw.priorityReason ?? "").trim().slice(0, 300),
    deadline: validIso(raw.deadline),
    deadlines,
    tasks,
    replies,
    needsReply: raw.needsReply ?? true,
  };
}

export type NormalizedAnalysis = ReturnType<typeof normalizeAnalysis>;

/**
 * Analyse one inbound message: summary, priority, deadlines, follow-up tasks and
 * reply drafts. Uses Claude when configured, otherwise (or on failure) the offline
 * heuristics. Applies the suggested priority unless a human already set one.
 */
export async function analyzeMessage(messageId: string, opts: { force?: boolean; actorId?: string | null } = {}) {
  const loaded = await withSystem(async (db) => {
    const message = await db.message.findUnique({
      where: { id: messageId },
      include: { team: { select: { id: true, settings: true } } },
    });
    if (!message || message.direction !== "INBOUND") return null;
    if (!opts.force && (message.aiStatus === "DONE" || message.aiStatus === "PROCESSING")) return null;
    const team = await db.user.findMany({ where: { teamId: message.teamId, isActive: true }, select: { id: true, name: true, role: true, title: true } });
    const thread = message.threadKey
        ? await db.message.findMany({
            where: { threadKey: message.threadKey, teamId: message.teamId, id: { not: message.id }, receivedAt: { lt: message.receivedAt } },
            orderBy: { receivedAt: "desc" },
            take: 4,
            select: { direction: true, senderName: true, content: true, receivedAt: true },
          })
        : [];
    const manual = await db.priorityHistory.count({ where: { messageId: message.id, source: "MANUAL" } });
    await db.message.update({ where: { id: message.id }, data: { aiStatus: "PROCESSING" } });
    return { message, team, thread: thread.reverse(), hasManualPriority: manual > 0 };
  });
  if (!loaded) return null;

  const { message, team, thread, hasManualPriority } = loaded;
  const settings = parseTeamSettings(message.team.settings);
  const now = new Date();
  const teamIds = new Set(team.map((t) => t.id));

  let raw: MessageAnalysisRaw;
  let model = OFFLINE_MODEL;
  try {
    if (!aiAvailable()) throw new Error("offline");
    const prompt = [
      `Current date and time: ${describeNow(now)}`,
      `Channel: ${message.channel}`,
      `From: ${message.senderName ?? "?"} <${message.senderContact}>`,
      message.subject ? `Subject: ${message.subject}` : null,
      `Received: ${describeNow(message.receivedAt)}`,
      thread.length
        ? `Earlier messages in this conversation (oldest first):\n${thread
            .map((t) => `[${t.direction === "OUTBOUND" ? "our reply" : t.senderName ?? "client"} · ${describeNow(t.receivedAt)}]\n${t.content.slice(0, 1200)}`)
            .join("\n\n")}`
        : null,
      `<message>\n${message.content.slice(0, 12_000)}\n</message>`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const result = await callStructured({
      kind: "MESSAGE_ANALYSIS",
      model: settings.ai.analysisModel,
      system: messageAnalysisSystem(settings.ai, team),
      prompt,
      schema: messageAnalysisSchema,
      effort: "low",
      teamId: message.teamId,
      userId: opts.actorId ?? null,
      messageId: message.id,
    });
    raw = result.data;
    model = result.model;
  } catch (err) {
    raw = heuristicAnalysis({
      channel: message.channel,
      senderName: message.senderName,
      subject: message.subject,
      content: message.content,
      receivedAt: message.receivedAt,
      now,
      team,
      signature: settings.ai.signature,
      formal: settings.ai.replyTone === "formal",
    });
    if ((err as Error).message !== "offline") {
      await logAI({ kind: "MESSAGE_ANALYSIS", model: OFFLINE_MODEL, status: "FALLBACK", teamId: message.teamId, messageId: message.id, error: describeAIError(err) });
    }
  }

  const analysis = normalizeAnalysis(raw, teamIds);
  const rules = rulesFromSettings(settings);

  const updated = await withSystem(async (db) => {
    const current = await db.message.findUnique({ where: { id: message.id } });
    if (!current) return null;
    const base = hasManualPriority ? current.basePriority : analysis.suggestedPriority;
    const deadline = analysis.deadline ? new Date(analysis.deadline) : null;
    const computed = computeMessagePriority(
      { basePriority: base, receivedAt: current.repliedAt ?? current.receivedAt, status: current.status, autoEscalate: current.autoEscalate, aiDeadline: deadline, direction: current.direction },
      now,
      rules,
    );
    const priority = current.status === "RESOLVED" ? base : computed.priority;

    const row = await db.message.update({
      where: { id: current.id },
      data: {
        aiStatus: "DONE",
        aiSummary: analysis.summary || null,
        aiIntent: analysis.intent || null,
        aiTopics: analysis.topics,
        aiSentiment: analysis.sentiment,
        aiSuggestedPriority: analysis.suggestedPriority,
        aiPriorityReason: analysis.priorityReason || null,
        aiDeadline: deadline,
        aiDeadlines: analysis.deadlines as unknown as Prisma.InputJsonValue,
        aiTasks: analysis.tasks as unknown as Prisma.InputJsonValue,
        aiReplies: analysis.replies as unknown as Prisma.InputJsonValue,
        aiModel: model,
        aiProcessedAt: new Date(),
        basePriority: base,
        priority,
        searchText: buildSearchText(current.senderName, current.senderContact, current.subject, current.content, analysis.summary, analysis.topics),
      },
    });

    if (!hasManualPriority && base !== current.basePriority) {
      await db.priorityHistory.create({
        data: {
          teamId: current.teamId,
          messageId: current.id,
          oldPriority: current.priority,
          newPriority: base,
          reason: `AI navrhla ${priorityMeta(base).code}${analysis.priorityReason ? `: ${analysis.priorityReason}` : ""}`,
          source: "AI",
        },
      });
    }
    if (priority < base && computed.reason) {
      await db.priorityHistory.create({
        data: { teamId: current.teamId, messageId: current.id, oldPriority: base, newPriority: priority, reason: computed.reason, source: "AUTO" },
      });
    }
    const directors = await db.user.findMany({ where: { teamId: current.teamId, role: "DIRECTOR", isActive: true }, select: { id: true } });
    return { row, directors: directors.map((d) => d.id), becameUrgent: priority <= 2 && current.priority > 2 && current.status !== "RESOLVED" };
  });

  if (!updated) return null;
  await publish({ type: "messages.changed", teamId: updated.row.teamId, messageIds: [updated.row.id] });

  // Proactive alert for urgent new messages (not for re-analysis of old ones).
  if (updated.becameUrgent && !opts.force) {
    await notify({
      teamId: updated.row.teamId,
      userIds: [updated.row.ownerId, updated.row.assigneeId, ...updated.directors],
      type: "MESSAGE_URGENT",
      title: `${priorityMeta(updated.row.priority).code}: zpráva od ${updated.row.senderName ?? updated.row.senderContact}`,
      body: updated.row.aiSummary ?? updated.row.preview,
      link: `/inbox?message=${updated.row.id}`,
      priority: updated.row.priority,
      messageId: updated.row.id,
    });
  }
  return { model, analysis };
}
