"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { AlarmClock, ArrowRight, CheckCircle2, Flame, LifeBuoy, ListTodo, ShieldCheck, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/common/empty-state";
import { DeadlineChip } from "@/components/common/deadline-chip";
import { PriorityBadge, PRIORITY_STYLES } from "@/components/priority/priority";
import { useAppUI } from "@/components/layout/app-ui";
import { useTeamOverview } from "@/hooks/queries";
import { priorityMeta, type PriorityLevel } from "@/lib/priority";
import { ROLE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { TaskListItem, WorkloadMember } from "@/lib/dto";

function utilizationTone(u: number) {
  if (u >= 100) return { text: "text-p1", bar: "bg-p1", label: "Přetížen(a)" };
  if (u >= 80) return { text: "text-p2", bar: "bg-p2", label: "Vysoké vytížení" };
  if (u >= 50) return { text: "text-p3-text", bar: "bg-p3", label: "Optimální" };
  return { text: "text-p4", bar: "bg-p4", label: "Volná kapacita" };
}

function PriorityBar({ byPriority, total }: { byPriority: WorkloadMember["byPriority"]; total: number }) {
  if (total === 0) return <div className="h-2 rounded-full bg-muted" />;
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-muted">
      {([1, 2, 3, 4, 5] as PriorityLevel[]).map((p) =>
        byPriority[p] ? (
          <Tooltip key={p} content={`${priorityMeta(p).code}: ${byPriority[p]}`}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${(byPriority[p] / total) * 100}%` }} transition={{ duration: 0.5 }} className={cn("h-full", PRIORITY_STYLES[p].bg)} />
          </Tooltip>
        ) : null,
      )}
    </div>
  );
}

function MemberCard({ m, index }: { m: WorkloadMember; index: number }) {
  const tone = utilizationTone(m.utilization);
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
      <Card className="h-full p-5 transition hover:shadow-elevated">
        <div className="flex items-start gap-3">
          <Avatar name={m.user.name} color={m.user.avatarColor} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 font-semibold">
              {m.user.name} {m.user.role === "DIRECTOR" && <ShieldCheck className="size-4 text-primary" />}
            </p>
            <p className="truncate text-xs text-muted-foreground">{m.user.title ?? ROLE_LABELS[m.user.role]}</p>
          </div>
          <div className="text-right">
            <div className={cn("text-xl font-semibold tabular-nums", tone.text)}>{m.utilization} %</div>
            <div className={cn("text-[11px] font-medium", tone.text)}>{tone.label}</div>
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Vytížení (váženo prioritou)</span>
            <span>kapacita {m.user.capacity}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <motion.div className={cn("h-full rounded-full", tone.bar)} initial={{ width: 0 }} animate={{ width: `${Math.min(100, m.utilization)}%` }} transition={{ duration: 0.6 }} />
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Rozložení priorit</span>
            <span>{m.open} otevřených</span>
          </div>
          <PriorityBar byPriority={m.byPriority} total={m.open} />
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          {[
            { label: "P1", value: m.byPriority[1], tone: m.byPriority[1] ? "text-p1" : "" },
            { label: "Po termínu", value: m.overdue, tone: m.overdue ? "text-p1" : "" },
            { label: "Tento týden", value: m.dueThisWeek, tone: "" },
            { label: "Hotovo 7 d", value: m.doneLast7Days, tone: "text-p4" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-muted/50 px-1 py-2">
              <div className={cn("text-base font-semibold tabular-nums", s.tone)}>{s.value}</div>
              <div className="text-[10.5px] leading-tight text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          {m.attention > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-p1">
              <LifeBuoy className="size-3.5" /> {m.attention}× žádost o pomoc
            </span>
          ) : (
            <span />
          )}
          <Link href={`/tasks?assignee=${m.user.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Zobrazit úkoly <ArrowRight className="size-3" />
          </Link>
        </div>
      </Card>
    </motion.div>
  );
}

function TaskMiniList({ tasks, empty }: { tasks: TaskListItem[]; empty: string }) {
  const ui = useAppUI();
  if (tasks.length === 0) return <p className="px-5 pb-5 text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {tasks.map((t) => (
        <li key={t.id}>
          <button onClick={() => ui.openTask(t.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-muted/40">
            <PriorityBadge priority={t.priority} showLabel={false} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{t.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{t.assignees.map((a) => a.name).join(", ")}</span>
            </span>
            {t.deadline && <DeadlineChip deadline={t.deadline} />}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function TeamView() {
  const { data, isLoading } = useTeamOverview();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Přehled týmu</h2>
        <p className="text-sm text-muted-foreground">Vytížení poradců, rozložení priorit a úkoly, které potřebují vaši pozornost.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: ListTodo, label: "Otevřené úkoly", value: data?.totals.open, tone: "bg-primary/10 text-primary" },
          { icon: Flame, label: "Kritické (P1)", value: data?.totals.critical, tone: "bg-p1-soft text-p1" },
          { icon: AlarmClock, label: "Po termínu", value: data?.totals.overdue, tone: "bg-p2-soft text-p2" },
          { icon: CheckCircle2, label: "Hotovo za 7 dní", value: data?.totals.doneLast7Days, tone: "bg-p4-soft text-p4" },
        ].map((c) => (
          <Card key={c.label} className="flex items-center gap-3 p-4">
            <span className={cn("inline-flex size-10 items-center justify-center rounded-xl", c.tone)}>
              <c.icon className="size-5" />
            </span>
            <div>
              {isLoading ? <Skeleton className="h-6 w-8" /> : <div className="text-xl font-semibold tabular-nums leading-none">{c.value}</div>}
              <div className="mt-1 text-xs text-muted-foreground">{c.label}</div>
            </div>
          </Card>
        ))}
      </div>

      {isLoading || !data ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : data.members.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="Tým je prázdný" description="Přidejte poradce v Nastavení → Uživatelé." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {data.members.map((m, i) => (
            <MemberCard key={m.user.id} m={m} index={i} />
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <AlarmClock className="size-4 text-p1" /> Úkoly po termínu
            </CardTitle>
            <CardDescription>Přiřazení i autoři úkolu dostali upozornění.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">{data && <TaskMiniList tasks={data.overdue} empty="Žádný úkol není po termínu. 👏" />}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <LifeBuoy className="size-4 text-p2" /> Žádosti o pomoc
            </CardTitle>
            <CardDescription>Poradci požádali o konzultaci nebo rozhodnutí.</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">{data && <TaskMiniList tasks={data.attention} empty="Nikdo momentálně nežádá o pomoc." />}</CardContent>
        </Card>
      </div>
    </div>
  );
}
