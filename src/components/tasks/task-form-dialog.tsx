"use client";
import { useEffect, useState } from "react";
import { BellRing, FileText, Paperclip, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PriorityPicker } from "@/components/priority/priority";
import { EscalationTimeline } from "@/components/priority/escalation-timeline";
import { PeoplePicker } from "@/components/common/people-picker";
import { DeadlineInput } from "@/components/common/deadline-input";
import { ChannelIcon } from "@/components/common/channel-icon";
import { useSessionUser } from "@/components/layout/session-context";
import { useAssignMessage, useCreateTask, useTeamMembers } from "@/hooks/queries";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { clampPriority, type PriorityLevel } from "@/lib/priority";
import type { MessageDetail } from "@/lib/dto";

export interface TaskFormPrefill {
  title?: string;
  description?: string | null;
  priority?: number;
  deadline?: string | null;
  assigneeIds?: string[];
  clientName?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog assigns a task created from this message ("Přiřadit úkol"). */
  message?: MessageDetail | null;
  prefill?: TaskFormPrefill;
  onDone?: (taskId: string) => void;
}

function formatSize(bytes: number) {
  if (!bytes) return "";
  return bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} kB`;
}

export function TaskFormDialog({ open, onOpenChange, message, prefill, onDone }: Props) {
  const user = useSessionUser();
  const members = useTeamMembers();
  const createTask = useCreateTask();
  const assign = useAssignMessage();
  const canAssignOthers = can(user.role, "tasks:assign");
  const mode = message ? "assign" : "create";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [clientName, setClientName] = useState("");
  const [priority, setPriority] = useState<PriorityLevel>(3);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [remindInDays, setRemindInDays] = useState<string>("none");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const suggestion = message?.aiTasks?.[0];
    /* eslint-disable react-hooks/set-state-in-effect -- reset the form whenever the dialog opens */
    setTitle(prefill?.title ?? suggestion?.title ?? (message ? `${message.senderName ?? message.senderContact}: ${message.subject ?? message.aiIntent ?? "požadavek"}` : ""));
    setDescription(prefill?.description ?? suggestion?.description ?? message?.aiSummary ?? "");
    setClientName(prefill?.clientName ?? message?.senderName ?? "");
    setPriority(clampPriority(prefill?.priority ?? suggestion?.priority ?? message?.priority ?? 3));
    setDeadline(prefill?.deadline ?? suggestion?.deadline ?? message?.aiDeadline ?? null);
    setAssignees(prefill?.assigneeIds ?? (suggestion?.suggestedAssigneeId ? [suggestion.suggestedAssigneeId] : canAssignOthers ? [] : [user.id]));
    setComment("");
    setRemindInDays("none");
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, message, prefill, canAssignOthers, user.id]);

  const busy = createTask.isPending || assign.isPending;
  const aiSuggested = Boolean(message?.aiTasks?.[0]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (title.trim().length < 2) return setError("Zadejte název úkolu.");
    if (mode === "assign" && assignees.length === 0) return setError("Vyberte alespoň jednoho poradce.");
    try {
      if (mode === "assign" && message) {
        const res = await assign.mutateAsync({ id: message.id, assigneeIds: assignees, title: title.trim(), description: description.trim() || null, priority, deadline, comment: comment.trim() || null });
        toast.success("Úkol přiřazen", { description: "Poradce dostal upozornění." });
        onDone?.(res.taskId);
      } else {
        const res = await createTask.mutateAsync({
          title: title.trim(),
          description: description.trim() || null,
          clientName: clientName.trim() || null,
          priority,
          deadline,
          assigneeIds: assignees.length ? assignees : [user.id],
          comment: comment.trim() || null,
          remindInDays: remindInDays === "none" ? null : Number(remindInDays),
        });
        toast.success("Úkol vytvořen", { description: assignees.some((a) => a !== user.id) ? "Přiřazení dostali upozornění." : undefined });
        onDone?.(res.id);
      }
      onOpenChange(false);
    } catch {
      /* toast shown by the mutation */
    }
  }

  const form = (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="task-title">
          Název úkolu <span className="text-destructive">*</span>
        </Label>
        <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Např. Připravit návrh hypotéky" autoFocus={mode === "create"} />
        {aiSuggested && (
          <FieldHint className="flex items-center gap-1">
            <Sparkles className="size-3 text-ai" /> Předvyplněno podle AI analýzy zprávy
          </FieldHint>
        )}
      </div>

      {(canAssignOthers || mode === "assign") && (
        <div className="space-y-1.5">
          <Label>
            {mode === "assign" ? "Přiřadit poradci" : "Přiřadit"} <span className="text-destructive">*</span>
          </Label>
          <PeoplePicker members={members.data ?? []} value={assignees} onChange={setAssignees} />
          <FieldHint className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-primary" /> Úkoly od ředitele mají u poradce přednost před týmovými.
          </FieldHint>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>
          Priorita <span className="text-destructive">*</span>
        </Label>
        <PriorityPicker value={priority} onChange={setPriority} />
      </div>

      <div className="space-y-1.5">
        <Label>Termín</Label>
        <DeadlineInput value={deadline} onChange={setDeadline} />
        {deadline && (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Jak poroste priorita s blížícím se termínem</p>
            <EscalationTimeline deadline={new Date(deadline)} basePriority={priority} />
          </div>
        )}
      </div>

      {mode === "create" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="task-client">Klient</Label>
            <Input id="task-client" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Jméno klienta (nepovinné)" />
          </div>
          <div className="space-y-1.5">
            <Label>Připomenout</Label>
            <Select value={remindInDays} onValueChange={setRemindInDays}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nepřipomínat</SelectItem>
                <SelectItem value="1">Za 1 den</SelectItem>
                <SelectItem value="3">Za 3 dny</SelectItem>
                <SelectItem value="7">Za týden</SelectItem>
                <SelectItem value="14">Za 14 dní</SelectItem>
                <SelectItem value="30">Za 30 dní</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="task-desc">Popis</Label>
        <Textarea id="task-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Co přesně je potřeba udělat…" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="task-comment">Komentář pro poradce (volitelné)</Label>
        <div className="relative">
          <Textarea id="task-comment" value={comment} onChange={(e) => setComment(e.target.value.slice(0, 500))} rows={2} placeholder="Přidejte poznámku nebo kontext…" />
          <span className="pointer-events-none absolute bottom-2 right-3 text-[11px] text-muted-foreground">{comment.length} / 500</span>
        </div>
      </div>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={message ? "max-w-4xl" : "max-w-xl"}>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{mode === "assign" ? "Přiřadit úkol" : "Nový úkol"}</DialogTitle>
            <DialogDescription>
              {mode === "assign" ? "Vytvořte ze zprávy úkol a přiřaďte ho členovi týmu. Poradce dostane upozornění." : "Úkol s termínem bude automaticky zvyšovat prioritu, jak se termín blíží."}
            </DialogDescription>
          </DialogHeader>

          {message ? (
            <div className="grid md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="border-b border-border bg-muted/25 p-6 md:border-b-0 md:border-r">
                <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <FileText className="size-3.5" /> Původní zpráva
                </p>
                <div className="rounded-xl border border-border bg-card p-4 shadow-card">
                  <div className="flex items-start gap-3">
                    <ChannelIcon channel={message.channel} />
                    <div className="min-w-0 text-xs text-muted-foreground">
                      <div className="truncate">
                        Od: <span className="font-medium text-foreground">{message.senderName ?? message.senderContact}</span> ({message.senderContact})
                      </div>
                      <div>Dne: {formatDateTime(message.receivedAt)}</div>
                    </div>
                  </div>
                  {message.subject && <p className="mt-3 text-sm font-semibold">{message.subject}</p>}
                  <p className="mt-2 line-clamp-[10] whitespace-pre-line text-sm text-muted-foreground">{message.content}</p>
                  {message.attachments.length > 0 && (
                    <div className="mt-3 space-y-1 border-t border-border pt-3">
                      {message.attachments.map((a) => (
                        <p key={a.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Paperclip className="size-3.5" /> Příloha: {a.name} {a.size ? `(${formatSize(a.size)})` : ""}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="p-6">{form}</div>
            </div>
          ) : (
            <div className="p-6">{form}</div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Zrušit
            </Button>
            <Button type="submit" loading={busy}>
              {mode === "assign" ? (
                <>
                  Přiřadit a upozornit <BellRing />
                </>
              ) : (
                "Vytvořit úkol"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
