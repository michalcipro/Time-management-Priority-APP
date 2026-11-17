import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { dayKey, deadlineInfo, localHour } from "@/lib/format";
import { priorityMeta } from "@/lib/priority";
import type { BriefingContent, BriefingStats } from "@/lib/ai-types";
import type { BoardData, BriefingDTO, TeamOverview } from "@/lib/dto";
import { withActor, withSystem } from "../db";
import type { SessionUser } from "../session";
import { notify } from "../notifications";
import { publish } from "../realtime";
import { getBoard } from "../services/board";
import { getTeamOverview } from "../services/team";
import { loadTeamSettings } from "../services/team-settings";
import { aiAvailable, callStructured, describeAIError, logAI } from "./client";
import { briefingSchema, type BriefingRaw } from "./schemas";
import { briefingSystem } from "./prompts";
import { describeNow } from "./analyze-message";
import { OFFLINE_MODEL } from "./heuristics";
import { vocative } from "@/lib/czech";

function greetingFor(now: Date, name: string): string {
  const hour = localHour(now);
  const first = vocative(name.split(" ")[0] ?? name);
  if (hour < 11) return `Dobré ráno, ${first}!`;
  if (hour < 18) return `Dobré odpoledne, ${first}!`;
  return `Dobrý večer, ${first}!`;
}

interface Snapshot {
  board: BoardData;
  team: TeamOverview | null;
}

function compactSnapshot(user: SessionUser, snap: Snapshot, now: Date) {
  return {
    person: { name: user.name, role: user.role },
    now: describeNow(now),
    stats: snap.board.stats,
    openItems: snap.board.items.slice(0, 40).map((i) => ({
      id: i.id,
      itemType: i.kind,
      title: i.title,
      priority: i.priority,
      escalated: i.escalated,
      deadline: i.deadline ? deadlineInfo(i.deadline, now).label : null,
      status: i.status,
      people: i.people.map((p) => p.name),
      summary: i.summary?.slice(0, 240) ?? null,
    })),
    team: snap.team
      ? snap.team.members.map((m) => ({
          id: m.user.id,
          name: m.user.name,
          title: m.user.title,
          open: m.open,
          overdue: m.overdue,
          utilizationPercent: m.utilization,
          needsAttention: m.attention,
        }))
      : null,
  };
}

/** Deterministic briefing used when AI is unavailable. */
export function fallbackBriefing(user: SessionUser, snap: Snapshot, now: Date): BriefingContent {
  const s = snap.board.stats;
  const items = snap.board.items;
  const top = items.slice(0, 5);
  const waiting = items.filter((i) => i.kind === "message");
  const overdueTasks = items.filter((i) => i.kind === "task" && i.deadline && Date.parse(i.deadline) < now.getTime());

  const parts: string[] = [];
  parts.push(
    s.critical > 0
      ? `Dnes máte ${s.critical} ${s.critical === 1 ? "kritickou položku" : s.critical < 5 ? "kritické položky" : "kritických položek"}`
      : "Dnes nemáte žádnou kritickou položku",
  );
  if (s.overdue > 0) parts.push(`${s.overdue} po termínu`);
  if (s.waitingMessages > 0) parts.push(`${s.waitingMessages} ${s.waitingMessages === 1 ? "zpráva čeká" : "zpráv čeká"} na odpověď`);
  let summary = parts.join(", ") + ".";
  if (top[0]) summary += ` Začněte položkou „${top[0].title}“ (${priorityMeta(top[0].priority).code}).`;

  const overloaded = snap.team?.members.filter((m) => m.utilization >= 90) ?? [];
  const free = [...(snap.team?.members ?? [])].filter((m) => m.user.role === "ADVISOR").sort((a, b) => a.utilization - b.utilization);

  return {
    greeting: greetingFor(now, user.name),
    summary,
    focus: top.map((i) => ({
      title: i.title,
      reason: i.deadline ? `${priorityMeta(i.priority).label} priorita · ${deadlineInfo(i.deadline, now).label}` : `${priorityMeta(i.priority).label} priorita`,
      priority: i.priority,
      itemType: i.kind,
      itemId: i.id,
    })),
    risks: [
      ...overdueTasks.slice(0, 2).map((t) => ({ title: `Po termínu: ${t.title}`, detail: `Řeší ${t.people.map((p) => p.name).join(", ") || "nepřiřazeno"}.`, itemType: "task" as const, itemId: t.id })),
      ...overloaded.slice(0, 2).map((m) => ({ title: `${m.user.name} je přetížen(a)`, detail: `Vytížení ${m.utilization} % (${m.open} otevřených úkolů).`, itemType: null, itemId: null })),
    ],
    teamNotes: (snap.team?.members ?? []).map((m) => `${m.user.name}: ${m.open} otevřených úkolů, vytížení ${m.utilization} %${m.overdue ? `, ${m.overdue} po termínu` : ""}.`).slice(0, 4),
    suggestedAssignments:
      user.role === "DIRECTOR" && free[0]
        ? waiting
            .filter((w) => w.people.length === 0 || w.people.every((p) => p.role === "DIRECTOR"))
            .slice(0, 3)
            .map((w) => ({ title: w.title, reason: `${free[0].user.name} má nejvíce volné kapacity (${free[0].utilization} %).`, priority: w.priority, itemType: "message" as const, itemId: w.id, assigneeId: free[0].user.id, assigneeName: free[0].user.name }))
        : [],
    suggestedReplies: [],
  };
}

function sanitize(raw: BriefingRaw, snap: Snapshot, members: Map<string, string>): BriefingContent {
  const ids = new Set(snap.board.items.map((i) => `${i.kind}:${i.id}`));
  const messageIds = new Set(snap.board.items.filter((i) => i.kind === "message").map((i) => i.id));
  const known = (type: string | null | undefined, id: string | null | undefined) => Boolean(type && id && ids.has(`${type}:${id}`));
  return {
    greeting: raw.greeting.trim().slice(0, 120),
    summary: raw.summary.trim().slice(0, 900),
    focus: raw.focus.filter((f) => known(f.itemType, f.itemId)).slice(0, 5).map((f) => ({ ...f, priority: Math.min(5, Math.max(1, f.priority)) })),
    risks: raw.risks.slice(0, 4).map((r) => ({ ...r, itemType: known(r.itemType, r.itemId) ? r.itemType : null, itemId: known(r.itemType, r.itemId) ? r.itemId : null })),
    teamNotes: raw.teamNotes.slice(0, 4),
    suggestedAssignments: raw.suggestedAssignments
      .filter((a) => known(a.itemType, a.itemId))
      .slice(0, 4)
      .map((a) => ({
        ...a,
        priority: Math.min(5, Math.max(1, a.priority)),
        assigneeId: a.assigneeId && members.has(a.assigneeId) ? a.assigneeId : null,
        assigneeName: a.assigneeId ? members.get(a.assigneeId) ?? null : null,
      })),
    suggestedReplies: raw.suggestedReplies.filter((r) => messageIds.has(r.messageId)).slice(0, 3),
  };
}

function toDTO(b: { id: string; day: string; content: Prisma.JsonValue; stats: Prisma.JsonValue; model: string; createdAt: Date }): BriefingDTO {
  return {
    id: b.id,
    day: b.day,
    content: b.content as unknown as BriefingContent,
    stats: b.stats as unknown as BriefingStats,
    model: b.model,
    createdAt: b.createdAt.toISOString(),
  };
}

export async function getTodayBriefing(user: SessionUser): Promise<BriefingDTO | null> {
  const day = dayKey(new Date());
  const b = await withActor(user, (db) => db.briefing.findUnique({ where: { userId_day: { userId: user.id, day } } }));
  return b ? toDTO(b) : null;
}

/** Generate (or regenerate) today's briefing for a user. */
export async function generateBriefing(user: SessionUser, opts: { force?: boolean; notifyUser?: boolean } = {}): Promise<BriefingDTO> {
  const now = new Date();
  const day = dayKey(now);
  if (!opts.force) {
    const existing = await withSystem((db) => db.briefing.findUnique({ where: { userId_day: { userId: user.id, day } } }));
    if (existing) return toDTO(existing);
  }

  const { snap, settings, members } = await withActor(user, async (db) => {
    const board = await getBoard(db, user);
    const team = user.role === "DIRECTOR" ? await getTeamOverview(db, user) : null;
    const settings = await loadTeamSettings(db, user.teamId);
    const members = await db.user.findMany({ where: { teamId: user.teamId, isActive: true }, select: { id: true, name: true, role: true, title: true } });
    return { snap: { board, team }, settings, members };
  });

  let content: BriefingContent;
  let model = OFFLINE_MODEL;
  try {
    if (!aiAvailable()) throw new Error("offline");
    const result = await callStructured({
      kind: "BRIEFING",
      model: settings.ai.assistantModel,
      system: briefingSystem(settings.ai, members),
      prompt: `Snapshot of the open work (JSON):\n${JSON.stringify(compactSnapshot(user, snap, now))}`,
      schema: briefingSchema,
      effort: "medium",
      teamId: user.teamId,
      userId: user.id,
    });
    content = sanitize(result.data, snap, new Map(members.map((m) => [m.id, m.name])));
    if (content.focus.length === 0) content.focus = fallbackBriefing(user, snap, now).focus;
    model = result.model;
  } catch (err) {
    content = fallbackBriefing(user, snap, now);
    if ((err as Error).message !== "offline") {
      await logAI({ kind: "BRIEFING", model: OFFLINE_MODEL, status: "FALLBACK", teamId: user.teamId, userId: user.id, error: describeAIError(err) });
    }
  }

  const saved = await withSystem((db) =>
    db.briefing.upsert({
      where: { userId_day: { userId: user.id, day } },
      create: { teamId: user.teamId, userId: user.id, day, content: content as unknown as Prisma.InputJsonValue, stats: snap.board.stats as unknown as Prisma.InputJsonValue, model },
      update: { content: content as unknown as Prisma.InputJsonValue, stats: snap.board.stats as unknown as Prisma.InputJsonValue, model, createdAt: now },
    }),
  );

  await publish({ type: "briefing.ready", teamId: user.teamId, userIds: [user.id] });
  if (opts.notifyUser) {
    const s = snap.board.stats;
    await notify({
      teamId: user.teamId,
      userIds: [user.id],
      type: "BRIEFING_READY",
      title: "Ranní AI briefing je připraven",
      body: `${s.critical} kritických položek · ${s.escalated} eskalovaných · ${s.waitingMessages} zpráv čeká na odpověď.\n\n${content.summary}`,
      link: "/assistant",
    });
  }
  return toDTO(saved);
}

/** Scheduled: generate morning briefings for directors once their briefing hour has passed. */
export async function generateDueBriefings(): Promise<number> {
  const now = new Date();
  const day = dayKey(now);
  const teams = await withSystem((db) => db.team.findMany({ select: { id: true } }));
  let generated = 0;
  for (const team of teams) {
    const settings = await withSystem((db) => loadTeamSettings(db, team.id));
    if (!settings.ai.briefingEnabled || localHour(now) < settings.ai.briefingHour) continue;
    const directors = await withSystem((db) =>
      db.user.findMany({
        where: { teamId: team.id, role: "DIRECTOR", isActive: true, briefings: { none: { day } } },
        select: { id: true, email: true, name: true, role: true, teamId: true, title: true, avatarColor: true, capacity: true, managerId: true },
      }),
    );
    for (const d of directors) {
      try {
        await generateBriefing(d, { notifyUser: true });
        generated++;
      } catch (err) {
        console.error("[briefing] failed for", d.id, err);
      }
    }
  }
  return generated;
}
