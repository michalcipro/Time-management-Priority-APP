"use client";
import { cn } from "@/lib/utils";
import { escalationTimeline, priorityMeta, type PriorityRules, DEFAULT_PRIORITY_RULES, type PriorityLevel } from "@/lib/priority";
import { formatDateShort } from "@/lib/format";
import { PRIORITY_STYLES } from "./priority";

/**
 * Visual projection of how an item's priority rises as its deadline approaches
 * (P5 → P4 → P3 → P2 → P1), as in the product concept.
 */
export function EscalationTimeline({
  deadline,
  basePriority,
  rules = DEFAULT_PRIORITY_RULES,
  now = new Date(),
  compact,
}: {
  deadline: Date;
  basePriority: number;
  rules?: PriorityRules;
  now?: Date;
  compact?: boolean;
}) {
  const points = escalationTimeline(deadline, basePriority, now, rules);
  const start = now.getTime();
  const end = Math.max(deadline.getTime(), start + 1);
  const span = end - start;
  const segments = points.map((p, i) => {
    const from = p.from.getTime();
    const to = i < points.length - 1 ? points[i + 1].from.getTime() : end;
    return { level: p.level, from, to, width: Math.max(2, ((to - from) / span) * 100) };
  });

  if (deadline.getTime() <= start) {
    return <p className="text-xs font-medium text-p1">Termín již uplynul – úkol má nejvyšší prioritu.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((s, i) => (
          <div key={i} className={cn("h-full transition-all", PRIORITY_STYLES[s.level as PriorityLevel].bg, i > 0 && "border-l-2 border-card")} style={{ width: `${s.width}%` }} title={priorityMeta(s.level).code} />
        ))}
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {segments.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn("size-2 rounded-full", PRIORITY_STYLES[s.level as PriorityLevel].bg)} />
              <span className={cn("font-semibold", PRIORITY_STYLES[s.level as PriorityLevel].text)}>{priorityMeta(s.level).code}</span>
              {i === 0 ? "nyní" : `od ${formatDateShort(new Date(s.from))}`}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">⏱ termín {formatDateShort(deadline)}</span>
        </div>
      )}
    </div>
  );
}
