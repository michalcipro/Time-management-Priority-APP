import { describe, expect, it } from "vitest";
import {
  applyManualPriority,
  clampPriority,
  computeMessagePriority,
  computeTaskPriority,
  DEFAULT_PRIORITY_RULES,
  escalationTimeline,
  PRIORITY_RULE_PRESETS,
  timeBasedPriority,
} from "@/lib/priority";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = new Date("2026-11-17T09:00:00Z");
const inHours = (h: number) => new Date(now.getTime() + h * HOUR);

describe("timeBasedPriority", () => {
  it("maps remaining time to P1–P5 with default rules", () => {
    expect(timeBasedPriority(null, now)).toBeNull();
    expect(timeBasedPriority(inHours(-5), now)).toBe(1); // overdue
    expect(timeBasedPriority(inHours(12), now)).toBe(1); // action needed today
    expect(timeBasedPriority(inHours(36), now)).toBe(2); // within 48 h
    expect(timeBasedPriority(inHours(5 * 24), now)).toBe(3);
    expect(timeBasedPriority(inHours(10 * 24), now)).toBe(4);
    expect(timeBasedPriority(inHours(30 * 24), now)).toBe(5);
  });

  it("a 30-day task climbs P5 → P1 as the deadline approaches", () => {
    const deadline = new Date(now.getTime() + 30 * DAY);
    const levels = [30, 20, 12, 5, 1.5, 0.5].map((daysLeft) => timeBasedPriority(deadline, new Date(deadline.getTime() - daysLeft * DAY)));
    expect(levels).toEqual([5, 5, 4, 3, 2, 1]);
  });

  it("supports the evenly spaced 30-day preset", () => {
    const even = { ...DEFAULT_PRIORITY_RULES, ...PRIORITY_RULE_PRESETS.find((p) => p.id === "even")!.rules };
    const deadline = new Date(now.getTime() + 30 * DAY);
    const at = (daysLeft: number) => timeBasedPriority(deadline, new Date(deadline.getTime() - daysLeft * DAY), even);
    expect([at(30), at(25), at(20), at(15), at(10)]).toEqual([5, 4, 3, 2, 1]);
  });
});

describe("computeTaskPriority", () => {
  it("takes the more urgent of base and time-based priority", () => {
    const r = computeTaskPriority({ basePriority: 4, deadline: inHours(20), autoEscalate: true, status: "NEW" }, now);
    expect(r.priority).toBe(1);
    expect(r.reason).toMatch(/Blíží se termín/);
  });

  it("never lowers a manually set urgent priority", () => {
    const r = computeTaskPriority({ basePriority: 1, deadline: inHours(30 * 24), autoEscalate: true, status: "NEW" }, now);
    expect(r).toEqual({ priority: 1, reason: null });
  });

  it("respects paused escalation and finished tasks", () => {
    expect(computeTaskPriority({ basePriority: 4, deadline: inHours(2), autoEscalate: false, status: "NEW" }, now).priority).toBe(4);
    expect(computeTaskPriority({ basePriority: 4, deadline: inHours(2), autoEscalate: true, status: "DONE" }, now).priority).toBe(4);
  });

  it("resurfaces a task when its reminder passes", () => {
    const r = computeTaskPriority({ basePriority: 5, deadline: null, remindAt: inHours(-1), autoEscalate: true, status: "NEW" }, now);
    expect(r.priority).toBe(DEFAULT_PRIORITY_RULES.remindPriority);
    expect(r.reason).toBe("Nastal čas připomenutí");
  });
});

describe("computeMessagePriority", () => {
  const base = { basePriority: 4, status: "WAITING_REPLY", autoEscalate: true, direction: "INBOUND" };

  it("escalates one level per N days of waiting, capped", () => {
    expect(computeMessagePriority({ ...base, receivedAt: new Date(now.getTime() - 1 * DAY) }, now).priority).toBe(4);
    expect(computeMessagePriority({ ...base, receivedAt: new Date(now.getTime() - 2 * DAY) }, now).priority).toBe(3);
    const four = computeMessagePriority({ ...base, receivedAt: new Date(now.getTime() - 4 * DAY) }, now);
    expect(four.priority).toBe(2);
    expect(four.reason).toBe("Zpráva čeká na odpověď 4 dny");
    // cap: waiting alone never goes above messageMaxAutoPriority (P2)
    expect(computeMessagePriority({ ...base, receivedAt: new Date(now.getTime() - 30 * DAY) }, now).priority).toBe(2);
  });

  it("uses a deadline extracted by the AI", () => {
    const r = computeMessagePriority({ ...base, receivedAt: now, aiDeadline: inHours(6) }, now);
    expect(r.priority).toBe(1);
    expect(r.reason).toMatch(/Termín zmíněný ve zprávě/);
  });

  it("does not escalate resolved, assigned or outbound messages", () => {
    const old = new Date(now.getTime() - 10 * DAY);
    expect(computeMessagePriority({ ...base, receivedAt: old, status: "RESOLVED" }, now).priority).toBe(4);
    expect(computeMessagePriority({ ...base, receivedAt: old, status: "ASSIGNED" }, now).priority).toBe(4);
    expect(computeMessagePriority({ ...base, receivedAt: old, direction: "OUTBOUND" }, now).priority).toBe(4);
  });
});

describe("applyManualPriority", () => {
  it("pauses escalation when the chosen level is less urgent than the deadline implies", () => {
    expect(applyManualPriority(4, inHours(10), now)).toEqual({ basePriority: 4, priority: 4, autoEscalate: false, pausedEscalation: true });
  });
  it("keeps escalation running otherwise", () => {
    expect(applyManualPriority(2, inHours(10 * 24), now)).toEqual({ basePriority: 2, priority: 2, autoEscalate: true, pausedEscalation: false });
    expect(applyManualPriority(3, null, now).autoEscalate).toBe(true);
  });
});

describe("escalationTimeline", () => {
  it("projects the escalation steps for a 30-day deadline", () => {
    const deadline = new Date(now.getTime() + 30 * DAY);
    const steps = escalationTimeline(deadline, 5, now).map((s) => s.level);
    expect(steps).toEqual([5, 4, 3, 2, 1]);
  });
  it("starts at the current level when the deadline is close", () => {
    const steps = escalationTimeline(inHours(30), 5, now);
    expect(steps[0].level).toBe(2);
    expect(steps.map((s) => s.level)).toEqual([2, 1]);
  });
});

describe("clampPriority", () => {
  it("clamps and rounds", () => {
    expect([clampPriority(0), clampPriority(9), clampPriority(2.4), clampPriority(Number.NaN)]).toEqual([1, 5, 2, 3]);
  });
});
