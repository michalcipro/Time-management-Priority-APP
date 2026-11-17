"use client";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { CheckCircle2, LifeBuoy, Reply, TrendingUp, UserPlus, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AvatarStack } from "@/components/ui/avatar";
import { Tooltip } from "@/components/ui/tooltip";
import { PriorityBadge, PriorityIcon, PRIORITY_STYLES } from "@/components/priority/priority";
import { DeadlineChip } from "@/components/common/deadline-chip";
import { ChannelIcon } from "@/components/common/channel-icon";
import { AILabel } from "@/components/ai/ai-label";
import { useAppUI } from "@/components/layout/app-ui";
import { useUpdateMessage, useUpdateTask, keys } from "@/hooks/queries";
import { api } from "@/lib/api-client";
import { priorityMeta } from "@/lib/priority";
import { formatListTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BoardItem, MessageDetail } from "@/lib/dto";

export function WorkItemCard({ item, compact, draggable }: { item: BoardItem; compact?: boolean; draggable?: boolean }) {
  const router = useRouter();
  const ui = useAppUI();
  const qc = useQueryClient();
  const updateTask = useUpdateTask();
  const updateMessage = useUpdateMessage();
  const level = priorityMeta(item.priority).level;
  const s = PRIORITY_STYLES[level];

  const open = () => (item.kind === "task" ? ui.openTask(item.id) : router.push(`/inbox?message=${item.id}`));

  const assign = async () => {
    if (item.kind === "task") return ui.openTask(item.id);
    try {
      const detail = await qc.fetchQuery({ queryKey: keys.message(item.id), queryFn: () => api.get<MessageDetail>(`/api/messages/${item.id}`) });
      ui.openAssign(detail);
    } catch {
      toast.error("Zprávu se nepodařilo načíst.");
    }
  };

  const done = () => {
    if (item.kind === "task") updateTask.mutate({ id: item.id, status: "DONE" }, { onSuccess: () => toast.success("Hotovo", { description: item.title }) });
    else updateMessage.mutate({ id: item.id, status: "RESOLVED" }, { onSuccess: () => toast.success("Zpráva vyřízena") });
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
    >
    <article
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-work-item", JSON.stringify({ kind: item.kind, id: item.id, priority: item.priority }));
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card shadow-card transition-shadow hover:shadow-elevated",
        "before:absolute before:inset-y-0 before:left-0 before:w-1",
        s.bar,
        level <= 2 ? s.border : "border-border",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      <div className={cn("pl-4 pr-3", compact ? "py-3" : "py-3.5 sm:pr-4")}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 hidden sm:block">
            {item.channel ? <ChannelIcon channel={item.channel} size="sm" /> : <span className={cn("inline-flex size-6 items-center justify-center rounded-md", s.soft)}><PriorityIcon priority={item.priority} className="size-3.5" /></span>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <PriorityBadge priority={item.priority} size="sm" />
              {item.escalated && (
                <Tooltip content={`Automaticky zvýšeno z P${item.basePriority}`}>
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-p2-soft px-1.5 py-px text-[10.5px] font-semibold text-p2">
                    <TrendingUp className="size-3" /> eskalováno
                  </span>
                </Tooltip>
              )}
              {item.needsDirectorAttention && (
                <span className="inline-flex items-center gap-1 rounded-full bg-p1-soft px-1.5 py-px text-[10.5px] font-semibold text-p1">
                  <LifeBuoy className="size-3" /> žádost o pomoc
                </span>
              )}
              <span className="text-[11px] text-muted-foreground">{item.kind === "task" ? "Úkol" : `Zpráva · ${formatListTime(item.createdAt)}`}</span>
            </div>
            <button onClick={open} className="mt-1 block max-w-full text-left">
              <h3 className={cn("font-semibold leading-snug tracking-tight hover:text-primary", compact ? "line-clamp-2 text-[13.5px]" : "text-[15px]")}>{item.title}</h3>
            </button>
          </div>
          {item.deadline && <DeadlineChip deadline={item.deadline} className={cn(compact && "hidden")} />}
        </div>

        {item.summary && !compact && (
          <div className="mt-2.5 flex items-start gap-2 border-t border-border/70 pt-2.5 sm:ml-9">
            {item.aiGenerated ? <AILabel className="shrink-0 pt-px" /> : <span className="shrink-0 pt-px text-xs font-semibold text-muted-foreground">Popis</span>}
            <p className="line-clamp-2 text-[13px] text-muted-foreground">{item.summary}</p>
          </div>
        )}
        {compact && item.deadline && (
          <div className="mt-2">
            <DeadlineChip deadline={item.deadline} />
          </div>
        )}

        <div className={cn("mt-3 flex flex-wrap items-center gap-1.5", !compact && "sm:ml-9")}>
          {item.kind === "message" ? (
            <Button size="xs" onClick={open}>
              <Reply /> Odpovědět
            </Button>
          ) : (
            <Button size="xs" variant="outline" onClick={open}>
              <ArrowUpRight /> Otevřít
            </Button>
          )}
          <Button size="xs" variant="outline" onClick={assign}>
            <UserPlus /> {item.kind === "task" ? "Přeřadit" : "Přiřadit"}
          </Button>
          <Button size="xs" variant="outline" onClick={done} loading={updateTask.isPending || updateMessage.isPending}>
            {!(updateTask.isPending || updateMessage.isPending) && <CheckCircle2 />} Hotovo
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {item.people.length > 0 && <AvatarStack people={item.people} size="xs" />}
          </div>
        </div>
      </div>
    </article>
    </motion.div>
  );
}
