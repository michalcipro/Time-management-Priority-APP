import type { MessageStatus, TaskStatus } from "@/generated/prisma/enums";
import { MESSAGE_STATUS_LABELS, TASK_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

const TASK_TONES: Record<TaskStatus, string> = {
  NEW: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  IN_PROGRESS: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  WAITING: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  DONE: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
};

const MESSAGE_TONES: Record<MessageStatus, string> = {
  UNREAD: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  WAITING_REPLY: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  ASSIGNED: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  RESOLVED: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
};

export function TaskStatusPill({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", TASK_TONES[status], className)}>
      <span className="size-1.5 rounded-full bg-current" />
      {TASK_STATUS_LABELS[status]}
    </span>
  );
}

export function MessageStatusPill({ status, className }: { status: MessageStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", MESSAGE_TONES[status], className)}>
      {MESSAGE_STATUS_LABELS[status]}
    </span>
  );
}
