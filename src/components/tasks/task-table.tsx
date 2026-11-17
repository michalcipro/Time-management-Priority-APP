"use client";
import { ChevronRight, LifeBuoy, MessageSquare, ShieldCheck, TrendingUp } from "lucide-react";
import { motion } from "motion/react";
import { Skeleton } from "@/components/ui/skeleton";
import { AvatarStack } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChannelIcon } from "@/components/common/channel-icon";
import { DeadlineText } from "@/components/common/deadline-chip";
import { TaskStatusPill } from "@/components/common/status-pill";
import { PriorityIcon, PriorityLabel, PRIORITY_STYLES } from "@/components/priority/priority";
import { useUpdateTask } from "@/hooks/queries";
import { TASK_STATUS_LABELS, TASK_STATUS_ORDER } from "@/lib/labels";
import { priorityMeta } from "@/lib/priority";
import { cn } from "@/lib/utils";
import type { TaskListItem } from "@/lib/dto";
import type { TaskStatus } from "@/generated/prisma/enums";

function StatusMenu({ task, canChange }: { task: TaskListItem; canChange: boolean }) {
  const update = useUpdateTask();
  if (!canChange) return <TaskStatusPill status={task.status} />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <button className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40" aria-label="Změnit stav">
          <TaskStatusPill status={task.status} className={cn("transition hover:brightness-95", update.isPending && "opacity-60")} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuRadioGroup value={task.status} onValueChange={(v) => update.mutate({ id: task.id, status: v as TaskStatus })}>
          {TASK_STATUS_ORDER.map((s) => (
            <DropdownMenuRadioItem key={s} value={s}>
              {TASK_STATUS_LABELS[s]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TaskIcon({ task }: { task: TaskListItem }) {
  if (task.sourceMessage) return <ChannelIcon channel={task.sourceMessage.channel} />;
  const level = priorityMeta(task.priority).level;
  return (
    <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg", PRIORITY_STYLES[level].soft)}>
      <PriorityIcon priority={task.priority} />
    </span>
  );
}

function Badges({ task }: { task: TaskListItem }) {
  return (
    <>
      {task.escalated && task.status !== "DONE" && (
        <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-p2">
          <TrendingUp className="size-3" /> eskalováno
        </span>
      )}
      {task.needsDirectorAttention && (
        <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-p1">
          <LifeBuoy className="size-3" /> žádost o pomoc
        </span>
      )}
      {task.assignedByDirector && task.creator.role === "DIRECTOR" && (
        <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary">
          <ShieldCheck className="size-3" /> od ředitele
        </span>
      )}
      {task.commentCount > 0 && (
        <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
          <MessageSquare className="size-3" /> {task.commentCount}
        </span>
      )}
    </>
  );
}

export function TaskTable({
  tasks,
  loading,
  showAssignees,
  canChangeStatus = () => true,
  onOpen,
}: {
  tasks: TaskListItem[] | undefined;
  loading?: boolean;
  showAssignees?: boolean;
  canChangeStatus?: (task: TaskListItem) => boolean;
  onOpen: (id: string) => void;
}) {
  if (loading || !tasks) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Desktop */}
      <table className="hidden w-full text-left md:table">
        <thead>
          <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="px-5 py-3 font-semibold">Úkol</th>
            {showAssignees && <th className="px-3 py-3 font-semibold">Řeší</th>}
            <th className="px-3 py-3 font-semibold">Priorita</th>
            <th className="px-3 py-3 font-semibold">Termín</th>
            <th className="px-3 py-3 font-semibold">Stav</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {tasks.map((t, i) => (
            <motion.tr
              key={t.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: Math.min(i * 0.015, 0.2) }}
              onClick={() => onOpen(t.id)}
              className={cn("group cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-muted/40", t.status === "DONE" && "opacity-60")}
            >
              <td className="px-5 py-3.5">
                <div className="flex items-start gap-3">
                  <TaskIcon task={t} />
                  <div className="min-w-0">
                    <p className={cn("text-[14px] font-medium leading-snug", t.status === "DONE" && "line-through decoration-muted-foreground/50")}>{t.title}</p>
                    <p className="line-clamp-1 text-[12.5px] text-muted-foreground">{t.clientName ? `${t.clientName} · ` : ""}{t.description ?? ""}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5">
                      <Badges task={t} />
                    </div>
                  </div>
                </div>
              </td>
              {showAssignees && (
                <td className="px-3 py-3.5">
                  <div className="flex items-center gap-2">
                    <AvatarStack people={t.assignees} size="sm" />
                    {t.assignees.length === 1 && <span className="hidden text-[13px] xl:inline">{t.assignees[0].name}</span>}
                  </div>
                </td>
              )}
              <td className="px-3 py-3.5">
                <PriorityLabel priority={t.priority} />
              </td>
              <td className="px-3 py-3.5">{t.deadline ? <DeadlineText deadline={t.deadline} /> : <span className="text-sm text-muted-foreground">—</span>}</td>
              <td className="px-3 py-3.5">
                <StatusMenu task={t} canChange={canChangeStatus(t)} />
              </td>
              <td className="pr-4">
                <ChevronRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>

      {/* Mobile */}
      <div className="divide-y divide-border md:hidden">
        {tasks.map((t) => (
          <button key={t.id} onClick={() => onOpen(t.id)} className={cn("flex w-full gap-3 px-4 py-3.5 text-left", t.status === "DONE" && "opacity-60")}>
            <TaskIcon task={t} />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[14px] font-medium leading-snug">{t.title}</p>
              <div className="flex flex-wrap items-center gap-2">
                <PriorityLabel priority={t.priority} className="text-xs" />
                <TaskStatusPill status={t.status} />
              </div>
              {t.deadline && <DeadlineText deadline={t.deadline} />}
              <div className="flex flex-wrap gap-x-2.5">
                <Badges task={t} />
              </div>
            </div>
            {showAssignees && <AvatarStack people={t.assignees} size="xs" />}
          </button>
        ))}
      </div>
    </>
  );
}
