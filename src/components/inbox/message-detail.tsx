"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ChevronDown, Clock3, Copy, ListChecks, MailOpen, Paperclip, Reply, RotateCcw, Sparkles, Star, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChannelTag } from "@/components/common/channel-icon";
import { MessageStatusPill, TaskStatusPill } from "@/components/common/status-pill";
import { PriorityBadge, PriorityPicker } from "@/components/priority/priority";
import { useAppUI } from "@/components/layout/app-ui";
import { useMessage, useUpdateMessage } from "@/hooks/queries";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MessageDetail as MessageDetailDTO } from "@/lib/dto";
import { AIPanel } from "./ai-panel";
import { ReplyComposer, type ReplyComposerHandle } from "./reply-composer";

function Thread({ message }: { message: MessageDetailDTO }) {
  const [open, setOpen] = useState(false);
  const earlier = message.thread.filter((t) => t.id !== message.id && new Date(t.receivedAt) < new Date(message.receivedAt));
  if (earlier.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-muted/30">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
        <MailOpen className="size-3.5" /> Předchozí konverzace ({earlier.length})
        <ChevronDown className={cn("ml-auto size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-2 px-4 pb-4">
          {earlier.map((t) => (
            <div key={t.id} className={cn("rounded-lg px-3 py-2 text-sm", t.direction === "OUTBOUND" ? "ml-8 bg-primary/8 ring-1 ring-primary/15" : "mr-8 bg-card ring-1 ring-border")}>
              <div className="mb-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground/80">{t.direction === "OUTBOUND" ? `↩ ${t.senderName ?? "Naše odpověď"}` : t.senderName}</span>
                <span>{formatDateTime(t.receivedAt)}</span>
              </div>
              <p className="whitespace-pre-line">{t.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Replies({ message, onPick }: { message: MessageDetailDTO; onPick: (text: string) => void }) {
  if (message.aiReplies.length === 0) return null;
  return (
    <section>
      <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold">
        <Sparkles className="size-3.5 text-ai" /> <span className="text-gradient-ai">Návrhy odpovědí</span>
        <span className="font-normal text-muted-foreground">· kliknutím vložíte do odpovědi</span>
      </p>
      <div className="grid gap-2 md:grid-cols-3">
        {message.aiReplies.map((r, i) => (
          <div key={i} className="group relative flex flex-col rounded-xl border border-border bg-card p-3 text-left shadow-xs transition hover:border-ai-border hover:shadow-card">
            <button onClick={() => onPick(r.text)} className="flex-1 text-left">
              <span className="mb-1 inline-block rounded-full bg-ai-soft px-2 py-0.5 text-[11px] font-semibold text-ai">{r.label}</span>
              <p className="line-clamp-4 whitespace-pre-line text-[12.5px] text-muted-foreground">{r.text}</p>
            </button>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(r.text);
                  toast.success("Zkopírováno");
                } catch {
                  toast.error("Kopírování selhalo");
                }
              }}
              className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-muted group-hover:opacity-100"
              aria-label="Kopírovat"
            >
              <Copy className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function Body({ message, onBack }: { message: MessageDetailDTO; onBack?: () => void }) {
  const ui = useAppUI();
  const update = useUpdateMessage();
  const composer = useRef<ReplyComposerHandle>(null);
  const [priorityOpen, setPriorityOpen] = useState(false);

  useEffect(() => {
    if (message.status === "UNREAD") update.mutate({ id: message.id, status: "WAITING_REPLY" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mark as read once per opened message
  }, [message.id]);

  const resolved = message.status === "RESOLVED";

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          {onBack && (
            <Button variant="ghost" size="icon-sm" className="-ml-2 lg:hidden" onClick={onBack} aria-label="Zpět">
              <ArrowLeft />
            </Button>
          )}
          <Avatar name={message.senderName ?? message.senderContact} size="lg" className="hidden sm:inline-flex" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold tracking-tight">{message.senderName ?? message.senderContact}</h2>
              <ChannelTag channel={message.channel} />
              <MessageStatusPill status={message.status} />
            </div>
            <p className="truncate text-sm text-muted-foreground">{message.senderContact}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span>Komu: {message.owner?.name ?? message.recipient ?? "—"}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Clock3 className="size-3" /> {formatDateTime(message.receivedAt)}
              </span>
              {message.assignee && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    Řeší <Avatar name={message.assignee.name} color={message.assignee.avatarColor} size="xs" /> {message.assignee.name}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" onClick={() => update.mutate({ id: message.id, starred: !message.starred })} aria-label="Označit hvězdičkou">
                <Star className={cn(message.starred && "fill-amber-400 text-amber-400")} />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Další akce">
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => update.mutate({ id: message.id, status: "UNREAD" })}>
                    <MailOpen /> Označit jako nepřečtené
                  </DropdownMenuItem>
                  {resolved && (
                    <DropdownMenuItem onSelect={() => update.mutate({ id: message.id, status: "WAITING_REPLY" })}>
                      <RotateCcw /> Znovu otevřít
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Popover open={priorityOpen} onOpenChange={setPriorityOpen}>
              <PopoverTrigger asChild disabled={!message.permissions.canChangePriority}>
                <button className="rounded-md px-1 py-0.5 transition hover:bg-muted" title="Změnit prioritu">
                  <PriorityBadge priority={message.priority} />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-96">
                <p className="mb-2 text-xs font-semibold">Změnit prioritu zprávy</p>
                <PriorityPicker
                  value={message.priority}
                  size="sm"
                  onChange={(p) =>
                    update.mutate(
                      { id: message.id, priority: p, priorityReason: "Ruční změna v inboxu" },
                      {
                        onSuccess: () => {
                          setPriorityOpen(false);
                          toast.success(`Priorita změněna na P${p}`);
                        },
                      },
                    )
                  }
                />
                {message.escalated && <p className="mt-2 text-[11.5px] text-p2">Priorita byla automaticky zvýšena z P{message.basePriority}, protože zpráva čeká na odpověď.</p>}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {message.permissions.canReply && (
            <Button size="sm" onClick={() => composer.current?.focus()}>
              <Reply /> Odpovědět
            </Button>
          )}
          {message.permissions.canAssign && (
            <Button size="sm" variant="outline" onClick={() => ui.openAssign(message)}>
              <UserPlus /> Přiřadit úkol
            </Button>
          )}
          <Button size="sm" variant="ghost" asChild>
            <Link href={`/assistant?aboutMessage=${message.id}`}>
              <Sparkles className="text-ai" /> Zeptat se AI
            </Link>
          </Button>
          {!resolved ? (
            <Button size="sm" variant="outline" onClick={() => update.mutate({ id: message.id, status: "RESOLVED" }, { onSuccess: () => toast.success("Zpráva vyřízena") })}>
              <CheckCircle2 /> Vyřízeno
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: message.id, status: "WAITING_REPLY" })}>
              <RotateCcw /> Znovu otevřít
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5 scrollbar-thin sm:px-6">
        <Thread message={message} />
        <article className="space-y-3">
          {message.subject && <h3 className="text-[15px] font-semibold">{message.subject}</h3>}
          <div className="whitespace-pre-line text-[14.5px] leading-relaxed text-foreground/90">{message.content}</div>
          {message.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {message.attachments.map((a) => (
                <span key={a.name} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs">
                  <Paperclip className="size-3.5 text-muted-foreground" /> {a.name}
                </span>
              ))}
            </div>
          )}
        </article>

        <AIPanel message={message} />

        {message.tasks.length > 0 && (
          <section className="rounded-xl border border-border p-4">
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold">
              <ListChecks className="size-3.5 text-muted-foreground" /> Navázané úkoly
            </p>
            <ul className="space-y-2">
              {message.tasks.map((t) => (
                <li key={t.id}>
                  <button onClick={() => ui.openTask(t.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted/60">
                    <PriorityBadge priority={t.priority} showLabel={false} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                    <span className="hidden text-xs text-muted-foreground sm:inline">{t.assignees.map((a) => a.name).join(", ")}</span>
                    <TaskStatusPill status={t.status} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {message.permissions.canReply && (
          <>
            <Replies message={message} onPick={(t) => composer.current?.insert(t)} />
            <ReplyComposer ref={composer} message={message} />
          </>
        )}

        {message.history.length > 0 && (
          <details className="group rounded-xl border border-border px-4 py-3 text-sm">
            <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground">Historie priority ({message.history.length})</summary>
            <ul className="mt-2 space-y-1.5">
              {message.history.map((h) => (
                <li key={h.id} className="flex gap-2 text-xs text-muted-foreground">
                  <span className="w-28 shrink-0 tabular-nums">{formatDateTime(h.createdAt)}</span>
                  <span className="font-medium text-foreground">
                    {h.oldPriority ? `P${h.oldPriority} → ` : ""}P{h.newPriority}
                  </span>
                  <span className="min-w-0 flex-1">{h.reason}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <p className="pb-2 text-center text-[11px] text-muted-foreground">
          <Link href="/settings/privacy" className="hover:underline">
            AI nikdy nic neodesílá samo – vše schvalujete vy.
          </Link>
        </p>
      </div>
    </div>
  );
}

export function MessageDetail({ id, onBack }: { id: string; onBack?: () => void }) {
  const { data, isLoading, error } = useMessage(id);
  if (error) return <div className="p-8 text-sm text-muted-foreground">Zprávu se nepodařilo načíst nebo k ní nemáte přístup.</div>;
  if (isLoading || !data) {
    return (
      <div className="space-y-4 p-6">
        <div className="flex gap-3">
          <Skeleton className="size-11 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-3.5 w-1/4" />
          </div>
        </div>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }
  return <Body message={data} onBack={onBack} />;
}
