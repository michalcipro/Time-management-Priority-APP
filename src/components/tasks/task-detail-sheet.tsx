"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarPlus,
  History,
  LifeBuoy,
  MessageSquare,
  PauseCircle,
  PlayCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea, Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Avatar } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PriorityBadge, PriorityPicker, PRIORITY_STYLES } from "@/components/priority/priority";
import { EscalationTimeline } from "@/components/priority/escalation-timeline";
import { DeadlineChip } from "@/components/common/deadline-chip";
import { DeadlineInput } from "@/components/common/deadline-input";
import { ChannelIcon } from "@/components/common/channel-icon";
import { PeoplePicker } from "@/components/common/people-picker";
import { AILabel } from "@/components/ai/ai-label";
import { useAddComment, useDeleteTask, useEscalateTask, useTask, useTeamMembers, useUpdateTask } from "@/hooks/queries";
import { formatDateTime, timeAgo } from "@/lib/format";
import { priorityMeta, type PriorityLevel } from "@/lib/priority";
import { TASK_STATUS_LABELS, TASK_STATUS_ORDER } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { TaskDetail } from "@/lib/dto";
import type { TaskStatus } from "@/generated/prisma/enums";
import { useNow } from "@/hooks/use-now";

function downloadIcs(task: TaskDetail) {
  if (!task.deadline) return;
  const end = new Date(task.deadline);
  const start = new Date(end.getTime() - 30 * 60_000);
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Priority Agent//CS",
    "BEGIN:VEVENT",
    `UID:task-${task.id}@priority-agent`,
    `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(start)}`,
    `DTEND:${f(end)}`,
    `SUMMARY:[${priorityMeta(task.priority).code}] ${task.title.replace(/[,;]/g, " ")}`,
    `DESCRIPTION:${(task.description ?? "").replace(/\n/g, "\\n").replace(/[,;]/g, " ")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `ukol-${task.id}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

const SOURCE_LABEL = { AUTO: "Automaticky", MANUAL: "Ručně", AI: "AI", SYSTEM: "Systém" } as const;

function PrioritySection({ task }: { task: TaskDetail }) {
  const update = useUpdateTask();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<PriorityLevel>(priorityMeta(task.priority).level);
  const [reason, setReason] = useState("");
  const [keep, setKeep] = useState(true);
  const s = PRIORITY_STYLES[priorityMeta(task.priority).level];

  return (
    <section className={cn("rounded-xl border p-4", s.border, s.soft)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PriorityBadge priority={task.priority} />
          {task.escalated && (
            <span className="inline-flex items-center gap-1 rounded-full bg-card/70 px-2 py-0.5 text-[11px] font-medium text-foreground/80">
              <TrendingUp className="size-3" /> zvýšeno z P{task.basePriority}
            </span>
          )}
          {!task.autoEscalate && task.status !== "DONE" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-card/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <PauseCircle className="size-3" /> auto-eskalace pozastavena
            </span>
          )}
        </div>
        {task.permissions.canOverridePriority && task.status !== "DONE" && !editing && (
          <div className="flex gap-1">
            {!task.autoEscalate && (
              <Button size="xs" variant="ghost" onClick={() => update.mutate({ id: task.id, autoEscalate: true })}>
                <PlayCircle /> Obnovit eskalaci
              </Button>
            )}
            <Button size="xs" variant="outline" onClick={() => setEditing(true)}>
              Změnit prioritu
            </Button>
          </div>
        )}
      </div>
      {task.deadline && task.status !== "DONE" && (
        <div className="mt-3">
          <EscalationTimeline deadline={new Date(task.deadline)} basePriority={task.basePriority} compact />
        </div>
      )}
      {editing && (
        <div className="mt-4 space-y-3 rounded-lg bg-card p-3">
          <PriorityPicker value={value} onChange={setValue} size="sm" />
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Důvod změny (uloží se do historie)" />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={keep} onCheckedChange={setKeep} /> Dál automaticky zvyšovat s blížícím se termínem
          </label>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Zrušit
            </Button>
            <Button
              size="sm"
              loading={update.isPending}
              onClick={() =>
                update.mutate(
                  { id: task.id, priority: value, priorityReason: reason || undefined, keepEscalation: keep },
                  {
                    onSuccess: () => {
                      setEditing(false);
                      toast.success(`Priorita změněna na ${priorityMeta(value).code}`);
                    },
                  },
                )
              }
            >
              Uložit
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Comments({ task }: { task: TaskDetail }) {
  const add = useAddComment(task.id);
  const [body, setBody] = useState("");
  const now = useNow();
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="size-4 text-muted-foreground" /> Komentáře <span className="text-muted-foreground">{task.comments.length}</span>
      </h3>
      <div className="space-y-3">
        {task.comments.map((c) => (
          <div key={c.id} className="flex gap-3">
            <Avatar name={c.author.name} color={c.author.avatarColor} size="sm" />
            <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm bg-muted/60 px-3 py-2">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-semibold">{c.author.name}</span>
                {c.author.role === "DIRECTOR" && <ShieldCheck className="size-3 text-primary" />}
                <span className="text-[11px] text-muted-foreground" suppressHydrationWarning>
                  {timeAgo(c.createdAt, now)}
                </span>
              </div>
              <p className="mt-0.5 whitespace-pre-line text-sm">{c.body}</p>
            </div>
          </div>
        ))}
        {task.comments.length === 0 && <p className="text-sm text-muted-foreground">Zatím žádné komentáře.</p>}
      </div>
      {task.permissions.canComment && (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!body.trim()) return;
            add.mutate(body.trim(), { onSuccess: () => setBody("") });
          }}
        >
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Napište komentář… (Ctrl+Enter odešle)"
            className="min-h-0 resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                (e.currentTarget.form as HTMLFormElement).requestSubmit();
              }
            }}
          />
          <Button type="submit" size="icon" loading={add.isPending} aria-label="Odeslat komentář">
            {!add.isPending && <Send />}
          </Button>
        </form>
      )}
    </section>
  );
}

function EscalateBox({ task }: { task: TaskDetail }) {
  const escalate = useEscalateTask(task.id);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  if (!task.permissions.canEscalate || task.status === "DONE") return null;
  if (task.needsDirectorAttention)
    return (
      <div className="flex items-center gap-2 rounded-xl border border-p2-border bg-p2-soft px-3 py-2 text-sm text-p2">
        <LifeBuoy className="size-4" /> Ředitel byl požádán o pomoc.
      </div>
    );
  return open ? (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <Label>S čím potřebujete pomoct?</Label>
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Např. potřebuji konzultaci k výluce v pojistné smlouvě" />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Zrušit
        </Button>
        <Button size="sm" loading={escalate.isPending} onClick={() => escalate.mutate(note, { onSuccess: () => setOpen(false) })}>
          Požádat ředitele
        </Button>
      </div>
    </div>
  ) : (
    <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="w-full">
      <LifeBuoy /> Požádat ředitele o pomoc
    </Button>
  );
}

function TaskBody({ task, onClose }: { task: TaskDetail; onClose: () => void }) {
  const update = useUpdateTask();
  const del = useDeleteTask();
  const members = useTeamMembers();
  const now = useNow();
  const [editDeadline, setEditDeadline] = useState(false);
  const [editAssignees, setEditAssignees] = useState(false);
  const [assignees, setAssignees] = useState(task.assignees.map((a) => a.id));

  return (
    <>
      <div className="border-b border-border px-6 pb-4 pt-5 pr-14">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {task.clientName && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><UserRound className="size-3.5" /> {task.clientName}</span>}
          {task.assignedByDirector && task.creator.role === "DIRECTOR" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              <ShieldCheck className="size-3" /> Od ředitele
            </span>
          )}
        </div>
        <SheetTitle className="text-lg font-semibold leading-snug tracking-tight">{task.title}</SheetTitle>
        <SheetDescription className="mt-1 text-xs text-muted-foreground">
          Vytvořil(a) {task.creator.name} · {formatDateTime(task.createdAt)}
        </SheetDescription>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5 scrollbar-thin">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Stav</Label>
            <Select value={task.status} disabled={!task.permissions.canChangeStatus || update.isPending} onValueChange={(v) => update.mutate({ id: task.id, status: v as TaskStatus })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TASK_STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {TASK_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Termín</Label>
            <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1">
              {task.deadline ? <DeadlineChip deadline={task.deadline} showRemaining /> : <span className="text-sm text-muted-foreground">Bez termínu</span>}
              {task.permissions.canEdit && (
                <Button variant="ghost" size="xs" onClick={() => setEditDeadline((v) => !v)}>
                  Změnit
                </Button>
              )}
            </div>
          </div>
        </div>
        {editDeadline && (
          <DeadlineInput
            value={task.deadline}
            onChange={(iso) => {
              update.mutate({ id: task.id, deadline: iso }, { onSuccess: () => toast.success("Termín změněn – priorita přepočítána") });
              setEditDeadline(false);
            }}
          />
        )}

        <PrioritySection task={task} />

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Řeší</h3>
            {task.permissions.canAssign && task.status !== "DONE" && (
              <Button variant="ghost" size="xs" onClick={() => setEditAssignees((v) => !v)}>
                {editAssignees ? "Zavřít" : "Přeřadit"}
              </Button>
            )}
          </div>
          {editAssignees ? (
            <div className="space-y-2">
              <PeoplePicker members={members.data ?? []} value={assignees} onChange={setAssignees} />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={assignees.length === 0}
                  loading={update.isPending}
                  onClick={() => update.mutate({ id: task.id, assigneeIds: assignees }, { onSuccess: () => { setEditAssignees(false); toast.success("Úkol přeřazen"); } })}
                >
                  Uložit a upozornit
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {task.assignees.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm">
                  <Avatar name={a.name} color={a.avatarColor} size="sm" />
                  <span className="leading-tight">
                    <span className="block text-[13px] font-medium">{a.name}</span>
                    {a.title && <span className="block text-[11px] text-muted-foreground">{a.title}</span>}
                  </span>
                </span>
              ))}
            </div>
          )}
        </section>

        {task.description && (
          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold">Popis</h3>
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/85">{task.description}</p>
          </section>
        )}

        {task.source && (
          <section className="rounded-xl border border-border p-4">
            <div className="flex items-start gap-3">
              <ChannelIcon channel={task.source.channel} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{task.source.senderName ?? task.source.senderContact}</p>
                  <Link href={`/inbox?message=${task.source.id}`} onClick={onClose} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    Otevřít zprávu <ArrowUpRight className="size-3" />
                  </Link>
                </div>
                {task.source.subject && <p className="truncate text-xs text-muted-foreground">{task.source.subject}</p>}
                {task.source.aiSummary ? (
                  <div className="mt-2 rounded-lg bg-ai-soft px-3 py-2">
                    <AILabel />
                    <p className="mt-0.5 text-[13px] text-foreground/85">{task.source.aiSummary}</p>
                  </div>
                ) : (
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{task.source.preview}</p>
                )}
              </div>
            </div>
          </section>
        )}

        <EscalateBox task={task} />
        <Comments task={task} />

        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <History className="size-4 text-muted-foreground" /> Historie priority
          </h3>
          <ol className="relative space-y-3 border-l border-border pl-4">
            {task.history.map((h) => (
              <li key={h.id} className="relative">
                <span className={cn("absolute -left-[21px] top-1 size-2.5 rounded-full ring-4 ring-card", PRIORITY_STYLES[priorityMeta(h.newPriority).level].bg)} />
                <div className="flex flex-wrap items-center gap-x-2 text-[13px]">
                  <span className="font-medium">
                    {h.oldPriority ? `P${h.oldPriority} → ` : ""}P{h.newPriority}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-px text-[10.5px] font-medium text-muted-foreground">
                    {h.source === "AI" ? <Sparkles className="mr-0.5 inline size-3 text-ai" /> : null}
                    {SOURCE_LABEL[h.source]}
                  </span>
                  <span className="text-[11px] text-muted-foreground" suppressHydrationWarning>
                    {timeAgo(h.createdAt, now)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {h.reason}
                  {h.changedBy ? ` · ${h.changedBy.name}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 px-6 py-3">
        {task.permissions.canChangeStatus && task.status !== "DONE" && (
          <Button size="sm" onClick={() => update.mutate({ id: task.id, status: "DONE" }, { onSuccess: () => toast.success("Hotovo! 🎉") })} loading={update.isPending}>
            Označit jako hotové
          </Button>
        )}
        <Button size="sm" variant="outline" asChild>
          <Link href={`/assistant?aboutTask=${task.id}`} onClick={onClose}>
            <Sparkles className="text-ai" /> Zeptat se AI
          </Link>
        </Button>
        {task.deadline && (
          <Button size="sm" variant="outline" onClick={() => downloadIcs(task)}>
            <CalendarPlus /> Do kalendáře
          </Button>
        )}
        <div className="flex-1" />
        {task.permissions.canDelete && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              if (confirm("Opravdu smazat tento úkol?")) del.mutate(task.id, { onSuccess: () => { toast.success("Úkol smazán"); onClose(); } });
            }}
          >
            <Trash2 /> Smazat
          </Button>
        )}
      </div>
    </>
  );
}

export function TaskDetailSheet({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const { data, isLoading, error } = useTask(taskId);
  return (
    <Sheet open={Boolean(taskId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="sm:max-w-[560px]">
        {isLoading || !data ? (
          <div className="space-y-4 p-6">
            <SheetTitle className="sr-only">Načítám úkol</SheetTitle>
            {error ? (
              <p className="text-sm text-muted-foreground">Úkol se nepodařilo načíst nebo k němu nemáte přístup.</p>
            ) : (
              <>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-7 w-3/4" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-32 w-full" />
              </>
            )}
          </div>
        ) : (
          <TaskBody key={data.id + data.updatedAt} task={data} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}
