import "server-only";
import { can } from "@/lib/permissions";
import { aiSettingsSchema, parseTeamSettings, priorityRulesSchema, type TeamSettings } from "@/lib/settings";
import type { Db } from "../db";
import type { SessionUser } from "../session";
import { forbidden } from "../errors";

export async function getTeamSettings(db: Db, user: SessionUser): Promise<{ name: string; settings: TeamSettings }> {
  const team = await db.team.findUniqueOrThrow({ where: { id: user.teamId }, select: { name: true, settings: true } });
  return { name: team.name, settings: parseTeamSettings(team.settings) };
}

export async function updatePriorityRules(db: Db, user: SessionUser, raw: unknown): Promise<TeamSettings> {
  if (!can(user.role, "rules:manage")) throw forbidden("Pravidla prioritizace nastavuje ředitel.");
  const rules = priorityRulesSchema.parse(raw);
  const { settings } = await getTeamSettings(db, user);
  const next = { ...settings, priorityRules: rules };
  await db.team.update({ where: { id: user.teamId }, data: { settings: next } });
  return next;
}

export async function updateAISettings(db: Db, user: SessionUser, raw: unknown): Promise<TeamSettings> {
  if (!can(user.role, "ai:configure")) throw forbidden();
  const { settings } = await getTeamSettings(db, user);
  const ai = aiSettingsSchema.parse({ ...settings.ai, ...(raw as object) });
  const next = { ...settings, ai };
  await db.team.update({ where: { id: user.teamId }, data: { settings: next } });
  return next;
}

export async function aiUsage(db: Db, user: SessionUser) {
  if (!can(user.role, "ai:configure") && user.role !== "DIRECTOR") throw forbidden();
  const since = new Date(Date.now() - 30 * 24 * 3_600_000);
  const logs = await db.aILog.findMany({
    where: { teamId: user.teamId, createdAt: { gte: since } },
    select: { kind: true, model: true, status: true, inputTokens: true, outputTokens: true, costUsd: true, latencyMs: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const byDay = new Map<string, { day: string; calls: number; cost: number }>();
  const byKind = new Map<string, { kind: string; calls: number; cost: number }>();
  let cost = 0;
  let input = 0;
  let output = 0;
  let errors = 0;
  let latency = 0;
  for (const l of logs) {
    const day = l.createdAt.toISOString().slice(0, 10);
    const d = byDay.get(day) ?? { day, calls: 0, cost: 0 };
    d.calls++;
    d.cost += l.costUsd;
    byDay.set(day, d);
    const k = byKind.get(l.kind) ?? { kind: l.kind, calls: 0, cost: 0 };
    k.calls++;
    k.cost += l.costUsd;
    byKind.set(l.kind, k);
    cost += l.costUsd;
    input += l.inputTokens;
    output += l.outputTokens;
    latency += l.latencyMs;
    if (l.status !== "SUCCESS") errors++;
  }
  const recent = await db.aILog.findMany({
    where: { teamId: user.teamId },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: { id: true, kind: true, model: true, status: true, inputTokens: true, outputTokens: true, costUsd: true, latencyMs: true, error: true, createdAt: true },
  });
  return {
    totals: { calls: logs.length, costUsd: Math.round(cost * 10000) / 10000, inputTokens: input, outputTokens: output, errors, avgLatencyMs: logs.length ? Math.round(latency / logs.length) : 0 },
    byDay: [...byDay.values()],
    byKind: [...byKind.values()],
    recent: recent.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  };
}
