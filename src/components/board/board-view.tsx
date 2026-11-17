"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { ChevronDown, Columns3, Inbox, List, PartyPopper, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/common/empty-state";
import { PriorityBadge, PRIORITY_STYLES } from "@/components/priority/priority";
import { useBoard, useBriefing, useTeamMembers, useUpdateMessage, useUpdateTask } from "@/hooks/queries";
import { priorityMeta, type PriorityLevel } from "@/lib/priority";
import { cn } from "@/lib/utils";
import type { BoardItem } from "@/lib/dto";
import { StatsCards } from "./stats-cards";
import { WorkItemCard } from "./work-item-card";

type KindFilter = "all" | "task" | "message";

function BriefingTeaser() {
  const { data, isLoading } = useBriefing();
  const b = data?.briefing;
  return (
    <div className="ai-surface relative overflow-hidden rounded-xl border border-ai-border p-4 shadow-card">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-7 items-center justify-center rounded-lg bg-gradient-ai text-white shadow-sm shadow-ai/30">
          <Sparkles className="size-4" />
        </span>
        <div className="text-sm font-semibold">
          AI Briefing <span className="text-gradient-ai">– dnes</span>
        </div>
        <Link href="/assistant" className="ml-auto text-xs font-medium text-primary hover:underline">
          Celý briefing →
        </Link>
      </div>
      {isLoading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ) : b ? (
        <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{b.content.greeting}</span> {b.content.summary}
        </p>
      ) : (
        <p className="mt-2.5 text-[13px] text-muted-foreground">Dnešní briefing ještě nebyl vygenerován. Otevřete AI asistenta a vytvořte ho jedním kliknutím.</p>
      )}
    </div>
  );
}

function PrioritySection({ level, items, defaultOpen }: { level: PriorityLevel; items: BoardItem[]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const meta = priorityMeta(level);
  return (
    <section>
      <button onClick={() => setOpen((o) => !o)} className="group mb-2.5 flex w-full items-center gap-3 text-left">
        <PriorityBadge priority={level} />
        <span className="text-xs text-muted-foreground">{meta.description}</span>
        <span className={cn("rounded-full px-2 py-px text-xs font-semibold", PRIORITY_STYLES[level].soft, PRIORITY_STYLES[level].text)}>{items.length}</span>
        <span className="h-px flex-1 bg-border" />
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
      </button>
      {open && (
        <div className="space-y-2.5">
          <AnimatePresence initial={false}>
            {items.map((item) => (
              <WorkItemCard key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}

function KanbanColumn({ level, items, onDropItem }: { level: PriorityLevel; items: BoardItem[]; onDropItem: (data: { kind: "task" | "message"; id: string; priority: number }, level: PriorityLevel) => void }) {
  const [over, setOver] = useState(false);
  const meta = priorityMeta(level);
  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-work-item")) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        try {
          onDropItem(JSON.parse(e.dataTransfer.getData("application/x-work-item")), level);
        } catch {
          /* ignore */
        }
      }}
      className={cn("flex min-h-[60vh] w-[290px] shrink-0 flex-col rounded-2xl border bg-muted/30 p-2.5 transition-colors xl:w-auto xl:min-w-0 xl:flex-1", over ? cn(PRIORITY_STYLES[level].border, PRIORITY_STYLES[level].soft) : "border-border")}
    >
      <div className="mb-2.5 flex items-center gap-2 px-1.5 pt-1">
        <PriorityBadge priority={level} />
        <span className="ml-auto rounded-full bg-card px-2 py-px text-xs font-semibold text-muted-foreground shadow-xs">{items.length}</span>
      </div>
      <p className="mb-2 px-1.5 text-[11px] text-muted-foreground">{meta.description}</p>
      <div className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <WorkItemCard key={`${item.kind}-${item.id}`} item={item} compact draggable />
          ))}
        </AnimatePresence>
        {items.length === 0 && <div className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">Přetáhněte sem kartu</div>}
      </div>
    </div>
  );
}

export function BoardView() {
  const [kind, setKind] = useState<KindFilter>("all");
  const [person, setPerson] = useState<string>("all");
  const [view, setView] = useState<"list" | "columns">("list");
  const board = useBoard();
  const members = useTeamMembers();
  const updateTask = useUpdateTask();
  const updateMessage = useUpdateMessage();

  const items = useMemo(() => {
    let list = board.data?.items ?? [];
    if (kind !== "all") list = list.filter((i) => i.kind === kind);
    if (person !== "all") list = list.filter((i) => i.people.some((p) => p.id === person));
    return list;
  }, [board.data, kind, person]);

  const grouped = useMemo(() => {
    const g: Record<PriorityLevel, BoardItem[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    for (const i of items) g[priorityMeta(i.priority).level].push(i);
    return g;
  }, [items]);

  const moveTo = (data: { kind: "task" | "message"; id: string; priority: number }, level: PriorityLevel) => {
    if (data.priority === level) return;
    const reason = "Přesunuto na Priority Boardu";
    const onSuccess = () => toast.success(`Priorita změněna na ${priorityMeta(level).code}`);
    if (data.kind === "task") updateTask.mutate({ id: data.id, priority: level, priorityReason: reason }, { onSuccess });
    else updateMessage.mutate({ id: data.id, priority: level, priorityReason: reason }, { onSuccess });
  };

  return (
    <div className="space-y-6">
      <StatsCards stats={board.data?.stats} loading={board.isLoading} />
      <BriefingTeaser />

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={kind} onValueChange={(v) => setKind(v as KindFilter)}>
          <TabsList>
            <TabsTrigger value="all">Vše {board.data ? <span className="text-muted-foreground">{board.data.items.length}</span> : null}</TabsTrigger>
            <TabsTrigger value="task">Úkoly</TabsTrigger>
            <TabsTrigger value="message">Zprávy</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={person} onValueChange={setPerson}>
          <SelectTrigger className="h-9 w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Celý tým</SelectItem>
            {(members.data ?? [])
              .filter((m) => m.role !== "ADMIN")
              .map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button variant="ghost" size="icon-sm" onClick={() => board.refetch()} aria-label="Obnovit">
          <RefreshCw className={cn(board.isFetching && "animate-spin")} />
        </Button>
        <Tabs value={view} onValueChange={(v) => setView(v as "list" | "columns")}>
          <TabsList>
            <TabsTrigger value="list">
              <List /> Seznam
            </TabsTrigger>
            <TabsTrigger value="columns">
              <Columns3 /> Sloupce
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {board.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card">
          <EmptyState
            icon={board.data?.items.length ? Inbox : PartyPopper}
            title={board.data?.items.length ? "Nic neodpovídá filtru" : "Vše vyřízeno!"}
            description={board.data?.items.length ? "Zkuste změnit filtr." : "Nemáte žádné otevřené úkoly ani čekající zprávy."}
          />
        </div>
      ) : view === "list" ? (
        <div className="space-y-7">
          {([1, 2, 3, 4, 5] as PriorityLevel[])
            .filter((l) => grouped[l].length > 0)
            .map((l) => (
              <PrioritySection key={l} level={l} items={grouped[l]} defaultOpen={l <= 4} />
            ))}
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 scrollbar-thin lg:mx-0 lg:px-0">
          <div className="flex gap-3">
            {([1, 2, 3, 4, 5] as PriorityLevel[]).map((l) => (
              <KanbanColumn key={l} level={l} items={grouped[l]} onDropItem={moveTo} />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Tip: přetažením karty do jiného sloupce ručně změníte prioritu (změna se zapíše do historie).</p>
        </div>
      )}
    </div>
  );
}
