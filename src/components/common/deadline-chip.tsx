"use client";
import { CalendarClock, Clock } from "lucide-react";
import { deadlineInfo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useNow } from "@/hooks/use-now";

const TONES = {
  overdue: "border-p1-border bg-p1-soft text-p1",
  today: "border-p1-border bg-p1-soft text-p1",
  soon: "border-p2-border bg-p2-soft text-p2",
  normal: "border-border bg-card text-muted-foreground",
};

export function DeadlineChip({ deadline, className, showRemaining }: { deadline: string | Date; className?: string; showRemaining?: boolean }) {
  const now = useNow();
  const info = deadlineInfo(deadline, now);
  const Icon = info.tone === "today" || info.tone === "overdue" ? Clock : CalendarClock;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium", TONES[info.tone], className)} suppressHydrationWarning>
      <Icon className="size-3.5" />
      {info.label}
      {showRemaining && <span className="opacity-75">· {info.remaining}</span>}
    </span>
  );
}

export function DeadlineText({ deadline }: { deadline: string | Date }) {
  const now = useNow();
  const info = deadlineInfo(deadline, now);
  return (
    <div className="leading-tight" suppressHydrationWarning>
      <div className={cn("text-sm font-medium", info.tone === "overdue" || info.tone === "today" ? "text-p1" : info.tone === "soon" ? "text-p2" : "text-foreground")}>{info.label}</div>
      <div className="text-xs text-muted-foreground">{info.remaining}</div>
    </div>
  );
}
