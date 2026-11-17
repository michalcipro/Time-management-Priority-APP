import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { CalendarItem } from "@/lib/dto";
import { priorityMeta } from "@/lib/priority";
import type { Db } from "../db";
import type { SessionUser } from "../session";
import { badRequest, forbidden } from "../errors";
import { env } from "../env";
import { listGoogleEvents, createGoogleEvent } from "../integrations/google";
import { listOutlookEvents, createOutlookEvent } from "../integrations/microsoft";
import { calendarScope, taskScope } from "./scopes";
import { buildIcs } from "../ics";
import { toUserRef, userRefSelect } from "./tasks";

const HOUR = 3_600_000;

/** Local events + task deadlines (DB). External events are added by `listExternalEvents`. */
export async function listCalendar(db: Db, user: SessionUser, from: Date, to: Date, userId?: string): Promise<CalendarItem[]> {
  if (to.getTime() - from.getTime() > 120 * 24 * HOUR) throw badRequest("Maximální rozsah kalendáře je 120 dní.");
  const target = userId && userId !== user.id ? userId : null;
  if (target && user.role !== "DIRECTOR") throw forbidden();

  const events = await db.calendarEvent.findMany({
      where: { AND: [calendarScope(user), { userId: target ?? user.id }, { startAt: { lt: to }, endAt: { gt: from } }] },
      include: { user: { select: userRefSelect }, task: { select: { priority: true } } },
      orderBy: { startAt: "asc" },
    });
  const tasks = await db.task.findMany({
      where: {
        AND: [
          taskScope(user),
          { assignees: { some: { userId: target ?? user.id } } },
          { status: { not: "DONE" }, deadline: { gte: from, lt: to } },
        ],
      },
      select: { id: true, title: true, deadline: true, priority: true, clientName: true },
    });

  return [
    ...events.map(
      (e): CalendarItem => ({
        id: e.id,
        kind: "event",
        title: e.title,
        start: e.startAt.toISOString(),
        end: e.endAt.toISOString(),
        allDay: e.allDay,
        location: e.location,
        description: e.description,
        priority: e.task?.priority ?? null,
        provider: e.provider,
        taskId: e.taskId,
        owner: toUserRef(e.user),
      }),
    ),
    ...tasks.map(
      (t): CalendarItem => ({
        id: `task-${t.id}`,
        kind: "deadline",
        title: `Termín: ${t.title}`,
        start: t.deadline!.toISOString(),
        end: new Date(t.deadline!.getTime() + 30 * 60_000).toISOString(),
        allDay: false,
        location: null,
        description: t.clientName ? `Klient: ${t.clientName}` : null,
        priority: t.priority,
        provider: "TASK",
        taskId: t.id,
        owner: null,
      }),
    ),
  ];
}

/** Events from the user's connected Google / Microsoft calendars (best effort). */
export async function listExternalEvents(
  integrations: { id: string; type: string; status: string; credentials: string | null }[],
  from: Date,
  to: Date,
): Promise<{ items: CalendarItem[]; errors: string[] }> {
  const items: CalendarItem[] = [];
  const errors: string[] = [];
  await Promise.all(
    integrations
      .filter((i) => i.status === "ACTIVE" && (i.type === "GOOGLE" || i.type === "MICROSOFT"))
      .map(async (i) => {
        try {
          const events = i.type === "GOOGLE" ? await listGoogleEvents(i, from, to) : await listOutlookEvents(i, from, to);
          for (const e of events) {
            items.push({
              id: `${i.type.toLowerCase()}-${e.id}`,
              kind: "external",
              title: e.title,
              start: e.start.toISOString(),
              end: e.end.toISOString(),
              allDay: e.allDay,
              location: e.location,
              description: e.description,
              priority: null,
              provider: i.type === "GOOGLE" ? "GOOGLE" : "MICROSOFT",
              taskId: null,
              owner: null,
            });
          }
        } catch (err) {
          errors.push(`${i.type === "GOOGLE" ? "Google" : "Outlook"} kalendář: ${(err as Error).message.slice(0, 120)}`);
        }
      }),
  );
  return { items, errors };
}

export async function createCalendarEvent(
  db: Db,
  user: SessionUser,
  input: { title: string; description?: string | null; location?: string | null; startAt: string; endAt: string; allDay: boolean; taskId?: string | null },
  external: { provider: "GOOGLE" | "MICROSOFT"; externalId: string } | null,
) {
  if (input.taskId) {
    const visible = await db.task.findFirst({ where: { AND: [{ id: input.taskId }, taskScope(user)] }, select: { id: true } });
    if (!visible) throw badRequest("Úkol neexistuje.");
  }
  const data: Prisma.CalendarEventUncheckedCreateInput = {
    teamId: user.teamId,
    userId: user.id,
    title: input.title,
    description: input.description || null,
    location: input.location || null,
    startAt: new Date(input.startAt),
    endAt: new Date(input.endAt),
    allDay: input.allDay,
    taskId: input.taskId || null,
    provider: external?.provider ?? "LOCAL",
    externalId: external?.externalId ?? null,
  };
  const event = await db.calendarEvent.create({ data });
  return { id: event.id };
}

export async function pushEventToProvider(
  integration: { id: string; type: string; credentials: string | null },
  event: { title: string; description?: string | null; location?: string | null; startAt: Date; endAt: Date; allDay: boolean },
): Promise<string> {
  if (integration.type === "GOOGLE") return createGoogleEvent(integration, event, env.timezone);
  return createOutlookEvent(integration, event);
}

export async function deleteCalendarEvent(db: Db, user: SessionUser, id: string) {
  const event = await db.calendarEvent.findFirst({ where: { id, userId: user.id } });
  if (!event) throw forbidden("Událost může smazat jen její autor.");
  await db.calendarEvent.delete({ where: { id } });
}

// ─── ICS feed (Apple Calendar / Outlook / Google subscription) ──────────────

/** Personal ICS feed: own events + deadlines of assigned open tasks (next 90 days, last 14 days). */
export async function icsFeedFor(db: Db, userId: string): Promise<string> {
  const from = new Date(Date.now() - 14 * 24 * HOUR);
  const to = new Date(Date.now() + 90 * 24 * HOUR);
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  const events = await db.calendarEvent.findMany({ where: { userId, startAt: { gte: from, lt: to } } });
  const tasks = await db.task.findMany({
    where: { assignees: { some: { userId } }, status: { not: "DONE" }, deadline: { gte: from, lt: to } },
    select: { id: true, title: true, deadline: true, priority: true, clientName: true, description: true },
  });
  return buildIcs(`Priority Agent – ${user?.name ?? ""}`, [
    ...events.map((e) => ({ uid: `event-${e.id}`, title: e.title, start: e.startAt, end: e.endAt, description: e.description, location: e.location })),
    ...tasks.map((t) => ({
      uid: `task-${t.id}`,
      title: `[${priorityMeta(t.priority).code}] ${t.title}`,
      start: new Date(t.deadline!.getTime() - 30 * 60_000),
      end: t.deadline!,
      description: [t.clientName ? `Klient: ${t.clientName}` : null, t.description].filter(Boolean).join("\n"),
      url: `${env.appUrl}/my-tasks?task=${t.id}`,
    })),
  ]);
}
