"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlarmClock, CalendarCheck2, CheckCircle2, ClipboardList, ListTodo, Plus, Search, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/common/empty-state";
import { useAppUI } from "@/components/layout/app-ui";
import { useSessionUser } from "@/components/layout/session-context";
import { useTasks, useTeamMembers } from "@/hooks/queries";
import { calendarDaysBetween } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaskListQuery } from "@/lib/validation";
import { TaskTable } from "./task-table";
import { useNow } from "@/hooks/use-now";

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function SummaryCard({ icon: Icon, label, value, tone }: { icon: typeof ListTodo; label: string; value: number | string; tone: string }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className={cn("inline-flex size-10 items-center justify-center rounded-xl", tone)}>
        <Icon className="size-5" />
      </span>
      <div>
        <div className="text-xl font-semibold tabular-nums leading-none">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      </div>
    </Card>
  );
}

type StatusTab = "open" | "WAITING" | "DONE" | "all";

export function MyTasksView() {
  const user = useSessionUser();
  const ui = useAppUI();
  const now = useNow();
  const [tab, setTab] = useState<StatusTab>("open");
  const [q, setQ] = useState("");
  const query = useDebounced(q);
  const all = useTasks({ scope: "mine", status: "all", limit: 300 });
  const list = useTasks({ scope: "mine", status: tab, q: query || undefined, limit: 300 });

  const summary = useMemo(() => {
    const items = all.data ?? [];
    const open = items.filter((t) => t.status !== "DONE");
    return {
      open: open.length,
      soon: open.filter((t) => t.deadline && Date.parse(t.deadline) >= now.getTime() && calendarDaysBetween(now, t.deadline) <= 1).length,
      overdue: open.filter((t) => t.deadline && Date.parse(t.deadline) < now.getTime()).length,
      done: items.filter((t) => t.status === "DONE" && t.completedAt && now.getTime() - Date.parse(t.completedAt) < 7 * 864e5).length,
    };
  }, [all.data, now]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Moje úkoly</h2>
          <p className="text-sm text-muted-foreground">Přehled vašich přiřazených úkolů a jejich stavů. Úkoly od ředitele mají přednost.</p>
        </div>
        <Button onClick={() => ui.openCreateTask({ assigneeIds: [user.id] })} variant="outline">
          <Plus /> Přidat vlastní úkol
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard icon={ListTodo} label="Aktivní úkoly" value={summary.open} tone="bg-primary/10 text-primary" />
        <SummaryCard icon={CalendarCheck2} label="Termín dnes či zítra" value={summary.soon} tone="bg-p2-soft text-p2" />
        <SummaryCard icon={AlarmClock} label="Po termínu" value={summary.overdue} tone="bg-p1-soft text-p1" />
        <SummaryCard icon={CheckCircle2} label="Hotovo za 7 dní" value={summary.done} tone="bg-p4-soft text-p4" />
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <Tabs value={tab} onValueChange={(v) => setTab(v as StatusTab)}>
            <TabsList>
              <TabsTrigger value="open">Aktivní</TabsTrigger>
              <TabsTrigger value="WAITING">Čeká na klienta</TabsTrigger>
              <TabsTrigger value="DONE">Hotové</TabsTrigger>
              <TabsTrigger value="all">Vše</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative sm:ml-auto sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat úkol nebo klienta…" className="pl-9" />
          </div>
        </div>
        {list.data && list.data.length === 0 ? (
          <EmptyState
            icon={tab === "DONE" ? CheckCircle2 : Sparkles}
            title={q ? "Nic nenalezeno" : tab === "open" ? "Žádné aktivní úkoly" : "Prázdné"}
            description={tab === "open" && !q ? "Nové úkoly od ředitele se tu objeví okamžitě a dostanete upozornění." : undefined}
          />
        ) : (
          <TaskTable tasks={list.data} loading={list.isLoading} onOpen={ui.openTask} />
        )}
      </Card>
    </div>
  );
}

export function TeamTasksView() {
  const ui = useAppUI();
  const params = useSearchParams();
  const members = useTeamMembers();
  const [tab, setTab] = useState<StatusTab>("open");
  const [assignee, setAssignee] = useState<string>(params.get("assignee") ?? "all");
  const [maxPriority, setMaxPriority] = useState<string>("all");
  const [overdue, setOverdue] = useState(params.get("overdue") === "true");
  const [attention, setAttention] = useState(params.get("attention") === "true");
  const [sort, setSort] = useState<TaskListQuery["sort"]>("priority");
  const [q, setQ] = useState("");
  const query = useDebounced(q);

  const tasks = useTasks({
    scope: "all",
    status: tab,
    assigneeId: assignee === "all" ? undefined : assignee,
    maxPriority: maxPriority === "all" ? undefined : Number(maxPriority),
    overdue: overdue ? "true" : undefined,
    attention: attention ? "true" : undefined,
    q: query || undefined,
    sort,
    limit: 300,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Úkoly týmu</h2>
          <p className="text-sm text-muted-foreground">Kompletní přehled úkolů všech poradců – stav, termíny a eskalace.</p>
        </div>
        <Button onClick={() => ui.openCreateTask()}>
          <Plus /> Přiřadit nový úkol
        </Button>
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <Tabs value={tab} onValueChange={(v) => setTab(v as StatusTab)}>
              <TabsList>
                <TabsTrigger value="open">Aktivní</TabsTrigger>
                <TabsTrigger value="WAITING">Čeká</TabsTrigger>
                <TabsTrigger value="DONE">Hotové</TabsTrigger>
                <TabsTrigger value="all">Vše</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative lg:ml-auto lg:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat úkol nebo klienta…" className="pl-9" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všichni poradci</SelectItem>
                {(members.data ?? [])
                  .filter((m) => m.role !== "ADMIN")
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select value={maxPriority} onValueChange={setMaxPriority}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všechny priority</SelectItem>
                <SelectItem value="1">Jen P1</SelectItem>
                <SelectItem value="2">P1–P2</SelectItem>
                <SelectItem value="3">P1–P3</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as TaskListQuery["sort"])}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="priority">Řadit podle priority</SelectItem>
                <SelectItem value="deadline">Podle termínu</SelectItem>
                <SelectItem value="updated">Naposledy změněné</SelectItem>
                <SelectItem value="created">Nejnovější</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-[13px]">
              <Switch checked={overdue} onCheckedChange={setOverdue} /> Po termínu
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-[13px]">
              <Switch checked={attention} onCheckedChange={setAttention} /> Žádosti o pomoc
            </label>
          </div>
        </div>
        {tasks.data && tasks.data.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Žádné úkoly" description="Žádný úkol neodpovídá zvoleným filtrům." />
        ) : (
          <TaskTable tasks={tasks.data} loading={tasks.isLoading} showAssignees onOpen={ui.openTask} />
        )}
      </Card>
    </div>
  );
}
