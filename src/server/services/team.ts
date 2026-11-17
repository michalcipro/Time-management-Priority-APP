import "server-only";
import type { TeamMember, TeamOverview, WorkloadMember } from "@/lib/dto";
import { calendarDaysBetween } from "@/lib/format";
import type { Db } from "../db";
import type { SessionUser } from "../session";
import { taskListInclude, toTaskListItem } from "./tasks";

/** Active team members for pickers (with current open-task counts). */
export async function listTeamMembers(db: Db, user: SessionUser, opts: { includeInactive?: boolean } = {}): Promise<TeamMember[]> {
  const users = await db.user.findMany({
    where: { teamId: user.teamId, ...(opts.includeInactive ? {} : { isActive: true }) },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      title: true,
      avatarColor: true,
      role: true,
      capacity: true,
      isActive: true,
      _count: { select: { taskAssignments: { where: { task: { status: { not: "DONE" } } } } } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    title: u.title,
    avatarColor: u.avatarColor,
    role: u.role,
    capacity: u.capacity,
    isActive: u.isActive,
    openTasks: u._count.taskAssignments,
  }));
}

/** Director's team dashboard: workload per person, overdue tasks, escalations. */
export async function getTeamOverview(db: Db, user: SessionUser): Promise<TeamOverview> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3_600_000);

  const members = await db.user.findMany({
      where: { teamId: user.teamId, isActive: true, role: { in: ["DIRECTOR", "ADVISOR"] } },
      orderBy: [{ role: "desc" }, { name: "asc" }],
      select: { id: true, name: true, title: true, avatarColor: true, role: true, email: true, capacity: true },
    });
  const openTasks = await db.task.findMany({
      where: { teamId: user.teamId, status: { not: "DONE" } },
      include: taskListInclude,
      orderBy: [{ priority: "asc" }, { deadline: { sort: "asc", nulls: "last" } }],
    });
  const doneRecent = await db.task.findMany({
      where: { teamId: user.teamId, status: "DONE", completedAt: { gte: weekAgo } },
      select: { id: true, assignees: { select: { userId: true } } },
    });

  const workload: WorkloadMember[] = members.map((m) => {
    const mine = openTasks.filter((t) => t.assignees.some((a) => a.userId === m.id));
    const byPriority = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as WorkloadMember["byPriority"];
    for (const t of mine) byPriority[t.priority as 1 | 2 | 3 | 4 | 5] += 1;
    const overdue = mine.filter((t) => t.deadline && t.deadline < now).length;
    const dueThisWeek = mine.filter((t) => t.deadline && t.deadline >= now && calendarDaysBetween(now, t.deadline) <= 7).length;
    // Weighted load: urgent work counts more than "later" items.
    const weights = { 1: 1.5, 2: 1.25, 3: 1, 4: 0.75, 5: 0.5 } as const;
    const weighted = mine.reduce((sum, t) => sum + weights[t.priority as 1 | 2 | 3 | 4 | 5], 0);
    return {
      user: { id: m.id, name: m.name, title: m.title, avatarColor: m.avatarColor, role: m.role, email: m.email, capacity: m.capacity },
      open: mine.length,
      byPriority,
      overdue,
      dueThisWeek,
      waiting: mine.filter((t) => t.status === "WAITING").length,
      doneLast7Days: doneRecent.filter((t) => t.assignees.some((a) => a.userId === m.id)).length,
      utilization: Math.round((weighted / Math.max(1, m.capacity)) * 100),
      attention: mine.filter((t) => t.needsDirectorAttention).length,
    };
  });

  const overdue = openTasks.filter((t) => t.deadline && t.deadline < now).map(toTaskListItem);
  const attention = openTasks.filter((t) => t.needsDirectorAttention).map(toTaskListItem);
  return {
    members: workload,
    overdue,
    attention,
    totals: {
      open: openTasks.length,
      overdue: overdue.length,
      critical: openTasks.filter((t) => t.priority === 1).length,
      doneLast7Days: doneRecent.length,
    },
  };
}
