/**
 * Priority model (P1–P5) and the dynamic escalation engine.
 *
 * Pure, isomorphic functions – used by background jobs, API handlers, the seed
 * script and UI previews (Settings → Prioritization rules).
 *
 * Lower number = more urgent. Escalation only ever makes an item MORE urgent;
 * a less urgent value only results from an explicit human action (manual
 * override or moving the deadline).
 */

export type PriorityLevel = 1 | 2 | 3 | 4 | 5;

export interface PriorityMeta {
  level: PriorityLevel;
  code: `P${PriorityLevel}`;
  label: string;
  /** Uppercase tag used on cards ("KRITICKÉ"). */
  tag: string;
  description: string;
}

export const PRIORITIES: readonly PriorityMeta[] = [
  { level: 1, code: "P1", label: "Kritická", tag: "Kritické", description: "Vyžaduje akci dnes" },
  { level: 2, code: "P2", label: "Vysoká", tag: "Vysoká", description: "Do 48 hodin" },
  { level: 3, code: "P3", label: "Střední", tag: "Střední", description: "Během týdne" },
  { level: 4, code: "P4", label: "Nízká", tag: "Nízká", description: "Až to půjde" },
  { level: 5, code: "P5", label: "Později", tag: "Později", description: "Informativní / později" },
] as const;

export function priorityMeta(level: number): PriorityMeta {
  return PRIORITIES[clampPriority(level) - 1];
}

export function clampPriority(level: number): PriorityLevel {
  if (!Number.isFinite(level)) return 3;
  return Math.min(5, Math.max(1, Math.round(level))) as PriorityLevel;
}

export function isPriority(value: unknown): value is PriorityLevel {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

// ─── Rules ──────────────────────────────────────────────────────────────────

export interface PriorityRules {
  /** Deadline within this many hours → at least P1. */
  p1Hours: number;
  /** … → at least P2. */
  p2Hours: number;
  /** … → at least P3. */
  p3Hours: number;
  /** … → at least P4 (otherwise the time component is P5). */
  p4Hours: number;
  /** An unanswered inbound message gains one level of urgency per N days of waiting. */
  messageWaitDays: number;
  /** Waiting-time escalation of messages never goes above this level. */
  messageMaxAutoPriority: PriorityLevel;
  /** When a task's "remind me" moment passes it surfaces at least at this level. */
  remindPriority: PriorityLevel;
  /** Notify people when an item escalates to this level or more urgent. */
  notifyAtOrAbove: PriorityLevel;
}

export const DEFAULT_PRIORITY_RULES: PriorityRules = {
  p1Hours: 24,
  p2Hours: 48,
  p3Hours: 24 * 7,
  p4Hours: 24 * 14,
  messageWaitDays: 2,
  messageMaxAutoPriority: 2,
  remindPriority: 2,
  notifyAtOrAbove: 2,
};

export const PRIORITY_RULE_PRESETS: { id: string; name: string; description: string; rules: Pick<PriorityRules, "p1Hours" | "p2Hours" | "p3Hours" | "p4Hours"> }[] = [
  {
    id: "standard",
    name: "Standardní",
    description: "P1 v posledních 24 h, P2 do 48 h, P3 do týdne, P4 do 14 dní.",
    rules: { p1Hours: 24, p2Hours: 48, p3Hours: 24 * 7, p4Hours: 24 * 14 },
  },
  {
    id: "proactive",
    name: "Proaktivní",
    description: "Dřívější eskalace – vhodné pro hypotéky a smlouvy s delší přípravou.",
    rules: { p1Hours: 24 * 3, p2Hours: 24 * 7, p3Hours: 24 * 14, p4Hours: 24 * 21 },
  },
  {
    id: "even",
    name: "Rovnoměrná (30 dní)",
    description: "Každých 5 dní o stupeň výš: P5 → P4 → P3 → P2 → P1 (10 dní před termínem).",
    rules: { p1Hours: 24 * 10, p2Hours: 24 * 15, p3Hours: 24 * 20, p4Hours: 24 * 25 },
  },
];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// ─── Core computations ──────────────────────────────────────────────────────

/** Priority implied purely by the time left until a deadline. */
export function timeBasedPriority(
  deadline: Date | null | undefined,
  now: Date,
  rules: PriorityRules = DEFAULT_PRIORITY_RULES,
): PriorityLevel | null {
  if (!deadline) return null;
  const hoursLeft = (deadline.getTime() - now.getTime()) / HOUR;
  if (hoursLeft <= rules.p1Hours) return 1;
  if (hoursLeft <= rules.p2Hours) return 2;
  if (hoursLeft <= rules.p3Hours) return 3;
  if (hoursLeft <= rules.p4Hours) return 4;
  return 5;
}

/** Human-readable (Czech) description of the time left until a deadline. */
export function describeTimeLeft(deadline: Date, now: Date): string {
  const ms = deadline.getTime() - now.getTime();
  if (ms < 0) {
    const overdueDays = Math.floor(-ms / DAY);
    if (overdueDays < 1) return "termín právě vypršel";
    return `termín ${overdueDays} ${pluralDays(overdueDays)} po splatnosti`;
  }
  const hours = Math.round(ms / HOUR);
  if (hours < 24) return hours <= 1 ? "termín do hodiny" : `termín za ${hours} h`;
  const days = Math.round(ms / DAY);
  return `termín za ${days} ${pluralDays(days)}`;
}

export function pluralDays(n: number): string {
  const abs = Math.abs(n);
  if (abs === 1) return "den";
  if (abs >= 2 && abs <= 4) return "dny";
  return "dní";
}

export interface TaskPriorityInput {
  basePriority: number;
  priority?: number;
  deadline: Date | null;
  remindAt?: Date | null;
  autoEscalate: boolean;
  status: string;
}

export interface PriorityComputation {
  priority: PriorityLevel;
  /** Why the effective priority differs from the base priority (null = it doesn't). */
  reason: string | null;
}

/** Effective priority of a task = the more urgent of base priority and time-based priority. */
export function computeTaskPriority(
  task: TaskPriorityInput,
  now: Date,
  rules: PriorityRules = DEFAULT_PRIORITY_RULES,
): PriorityComputation {
  const base = clampPriority(task.basePriority);
  if (!task.autoEscalate || task.status === "DONE") return { priority: base, reason: null };

  let priority = base;
  let reason: string | null = null;

  const timeBased = timeBasedPriority(task.deadline, now, rules);
  if (timeBased !== null && timeBased < priority && task.deadline) {
    priority = timeBased;
    reason = `Blíží se termín (${describeTimeLeft(task.deadline, now)})`;
  }

  if (task.remindAt && task.remindAt.getTime() <= now.getTime() && rules.remindPriority < priority) {
    priority = rules.remindPriority;
    reason = "Nastal čas připomenutí";
  }

  return { priority, reason };
}

export interface MessagePriorityInput {
  basePriority: number;
  receivedAt: Date;
  status: string;
  autoEscalate: boolean;
  aiDeadline?: Date | null;
  direction?: string;
}

/** Number of whole days an inbound message has been waiting. */
export function waitingDays(receivedAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - receivedAt.getTime()) / DAY));
}

/**
 * Effective priority of a message. Unanswered inbound messages escalate one level
 * per `messageWaitDays` of waiting (capped at `messageMaxAutoPriority`), and a
 * deadline extracted by the AI escalates them like a task deadline.
 */
export function computeMessagePriority(
  message: MessagePriorityInput,
  now: Date,
  rules: PriorityRules = DEFAULT_PRIORITY_RULES,
): PriorityComputation {
  const base = clampPriority(message.basePriority);
  const open = message.status === "UNREAD" || message.status === "WAITING_REPLY";
  if (!message.autoEscalate || !open || message.direction === "OUTBOUND") {
    return { priority: base, reason: null };
  }

  let priority = base;
  let reason: string | null = null;

  const days = waitingDays(message.receivedAt, now);
  const steps = rules.messageWaitDays > 0 ? Math.floor(days / rules.messageWaitDays) : 0;
  if (steps > 0) {
    const cap = rules.messageMaxAutoPriority;
    const waited = clampPriority(Math.max(cap, base - steps));
    if (waited < priority) {
      priority = waited;
      reason = `Zpráva čeká na odpověď ${days} ${pluralDays(days)}`;
    }
  }

  const timeBased = timeBasedPriority(message.aiDeadline ?? null, now, rules);
  if (timeBased !== null && timeBased < priority && message.aiDeadline) {
    priority = timeBased;
    reason = `Termín zmíněný ve zprávě (${describeTimeLeft(message.aiDeadline, now)})`;
  }

  return { priority, reason };
}

export interface ManualPriorityResult {
  basePriority: PriorityLevel;
  priority: PriorityLevel;
  autoEscalate: boolean;
  /** True when the chosen level is less urgent than the deadline dictates. */
  pausedEscalation: boolean;
}

/**
 * Apply a manual priority override. If the person chooses a LOWER urgency than the
 * deadline implies, automatic escalation is paused (explicit, visible in the UI and
 * logged); otherwise escalation continues from the new base.
 */
export function applyManualPriority(
  chosen: number,
  deadline: Date | null,
  now: Date,
  rules: PriorityRules = DEFAULT_PRIORITY_RULES,
  keepEscalation = true,
): ManualPriorityResult {
  const level = clampPriority(chosen);
  const timeBased = timeBasedPriority(deadline, now, rules);
  const conflicts = timeBased !== null && timeBased < level;
  const autoEscalate = keepEscalation && !conflicts;
  return { basePriority: level, priority: level, autoEscalate, pausedEscalation: conflicts };
}

/** Projected escalation timeline for a deadline – used by the UI preview. */
export function escalationTimeline(
  deadline: Date,
  basePriority: number,
  now: Date,
  rules: PriorityRules = DEFAULT_PRIORITY_RULES,
): { level: PriorityLevel; from: Date }[] {
  const base = clampPriority(basePriority);
  const thresholds: [PriorityLevel, number][] = [
    [4, rules.p4Hours],
    [3, rules.p3Hours],
    [2, rules.p2Hours],
    [1, rules.p1Hours],
  ];
  const points: { level: PriorityLevel; from: Date }[] = [];
  const startLevel = Math.min(base, timeBasedPriority(deadline, now, rules) ?? 5) as PriorityLevel;
  points.push({ level: startLevel, from: now });
  for (const [level, hours] of thresholds) {
    if (level >= startLevel) continue;
    const from = new Date(deadline.getTime() - hours * HOUR);
    if (from.getTime() <= now.getTime()) continue;
    points.push({ level, from });
  }
  return points.sort((a, b) => a.from.getTime() - b.from.getTime());
}
