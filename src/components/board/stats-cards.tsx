"use client";
import { motion } from "motion/react";
import { AlarmClock, ArrowUpRight, MailWarning, TriangleAlert } from "lucide-react";
import type { BriefingStats } from "@/lib/ai-types";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const CARDS: { key: keyof BriefingStats; label: string; hint: string; icon: typeof TriangleAlert; tone: string; bar: string }[] = [
  { key: "critical", label: "Kritické položky", hint: "Vyžadují akci dnes", icon: TriangleAlert, tone: "bg-p1-soft text-p1", bar: "bg-p1" },
  { key: "escalated", label: "Eskalované", hint: "Priorita se zvýšila", icon: ArrowUpRight, tone: "bg-p2-soft text-p2", bar: "bg-p2" },
  { key: "waitingMessages", label: "Zprávy čekají", hint: "Na odpověď klientům", icon: MailWarning, tone: "bg-primary/10 text-primary", bar: "bg-primary" },
  { key: "overdue", label: "Po termínu", hint: "Úkoly po splatnosti", icon: AlarmClock, tone: "bg-p1-soft text-p1", bar: "bg-p1" },
];

export function StatsCards({ stats, loading, keys }: { stats?: BriefingStats; loading?: boolean; keys?: (keyof BriefingStats)[] }) {
  const cards = keys ? CARDS.filter((c) => keys.includes(c.key)) : CARDS;
  const total = stats ? Math.max(1, stats.openTasks + stats.waitingMessages) : 1;
  return (
    <div className={cn("grid gap-3", cards.length === 3 ? "sm:grid-cols-3" : "grid-cols-2 xl:grid-cols-4")}>
      {cards.map((c, i) => {
        const Icon = c.icon;
        const value = stats?.[c.key] ?? 0;
        return (
          <motion.div
            key={c.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="rounded-xl border border-border bg-card p-4 shadow-card"
          >
            <div className="flex items-start gap-3">
              <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-xl", c.tone)}>
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                {loading || !stats ? <Skeleton className="h-7 w-10" /> : <div className="text-2xl font-semibold leading-none tracking-tight tabular-nums">{value}</div>}
                <div className="mt-1 text-[13px] font-medium">{c.label}</div>
                <div className="text-xs text-muted-foreground">{c.hint}</div>
              </div>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
              <motion.div
                className={cn("h-full rounded-full", c.bar)}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (value / total) * 100 * 3)}%` }}
                transition={{ duration: 0.6, delay: 0.1 + i * 0.05 }}
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

