"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { ArrowUp, Bot, CalendarDays, Eraser, Lightbulb, MessageSquareReply, RefreshCw, ShieldAlert, Sparkles, Target, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { PriorityBadge } from "@/components/priority/priority";
import { StatsCards } from "@/components/board/stats-cards";
import { useAppUI } from "@/components/layout/app-ui";
import { useSessionUser } from "@/components/layout/session-context";
import { keys, useAssistantMessages, useBriefing, useBoard, useMessage, useTask } from "@/hooks/queries";
import { api, errorMessage } from "@/lib/api-client";
import { formatLongDate, formatTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AssistantMessageDTO, BriefingDTO, MessageDetail } from "@/lib/dto";
import { Markdown } from "./markdown";

function PromptChips({ onPick, director }: { onPick: (p: string) => void; director: boolean }) {
  const prompts = [
    "Shrň kritické věci",
    "Prioritizuj můj den",
    "Ukaž můj kalendář",
    ...(director ? ["Kdo z týmu má volnou kapacitu?"] : []),
    "Které zprávy čekají nejdéle?",
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {prompts.map((p) => (
        <button key={p} onClick={() => onPick(p)} className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground/80 transition hover:border-ai-border hover:bg-ai-soft hover:text-ai">
          {p}
        </button>
      ))}
    </div>
  );
}

interface ChatContext {
  taskId?: string;
  messageId?: string;
  label: string;
}

function Chat({ context, onClearContext }: { context: ChatContext | null; onClearContext: () => void }) {
  const user = useSessionUser();
  const qc = useQueryClient();
  const history = useAssistantMessages();
  const [messages, setMessages] = useState<AssistantMessageDTO[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync server history into local chat state
    if (history.data && !streaming) setMessages(history.data.messages);
  }, [history.data, streaming]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || streaming) return;
    setInput("");
    setStreaming(true);
    const now = new Date().toISOString();
    setMessages((m) => [...m, { id: `u-${now}`, role: "USER", content, createdAt: now }, { id: `a-${now}`, role: "ASSISTANT", content: "", createdAt: now }]);
    try {
      const res = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: content, context: context ? { taskId: context.taskId, messageId: context.messageId } : undefined }) });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? "Asistent je nedostupný.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          copy[copy.length - 1] = { ...last, content: last.content + chunk };
          return copy;
        });
      }
    } catch (err) {
      toast.error(errorMessage(err));
      setMessages((m) => m.slice(0, -1));
    } finally {
      setStreaming(false);
      void qc.invalidateQueries({ queryKey: keys.chat });
    }
  }

  async function clear() {
    await api.del("/api/ai/chat");
    setMessages([]);
    void qc.invalidateQueries({ queryKey: keys.chat });
  }

  return (
    <Card className="flex h-[640px] flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
        <span className="inline-flex size-7 items-center justify-center rounded-lg bg-gradient-ai text-white shadow-sm shadow-ai/30">
          <Sparkles className="size-4" />
        </span>
        <h3 className="text-[15px] font-semibold">AI Asistent</h3>
        <span className={cn("ml-1 inline-flex items-center gap-1 text-xs font-medium", user.aiMode === "claude" ? "text-p4" : "text-muted-foreground")}>
          <span className={cn("size-1.5 rounded-full", user.aiMode === "claude" ? "bg-p4" : "bg-p5")} /> {user.aiMode === "claude" ? "Online" : "Offline režim"}
        </span>
        <Button variant="ghost" size="xs" className="ml-auto" onClick={clear} disabled={streaming || messages.length === 0}>
          <Eraser /> Vymazat
        </Button>
      </div>
      <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto px-5 py-5 scrollbar-thin">
        {history.isLoading ? (
          <Skeleton className="h-20 w-2/3 rounded-2xl" />
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-ai-soft text-ai">
              <Bot className="size-6" />
            </span>
            <p className="max-w-sm text-sm text-muted-foreground">Zeptejte se na priority, termíny, klienty nebo vytížení týmu. Asistent vidí jen data, ke kterým máte přístup.</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn("flex gap-2.5", m.role === "USER" && "justify-end")}>
                {m.role === "ASSISTANT" && (
                  <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-ai text-[11px] font-bold text-white">AI</span>
                )}
                <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2.5", m.role === "USER" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-tl-sm border border-border bg-card shadow-xs")}>
                  {m.role === "ASSISTANT" ? (
                    m.content ? (
                      <Markdown text={m.content} />
                    ) : (
                      <span className="flex gap-1 py-1.5">
                        {[0, 1, 2].map((i) => (
                          <span key={i} className="size-1.5 animate-bounce rounded-full bg-ai/60" style={{ animationDelay: `${i * 120}ms` }} />
                        ))}
                      </span>
                    )
                  ) : (
                    <p className="whitespace-pre-line text-sm">{m.content}</p>
                  )}
                  <p className={cn("mt-1 text-[10.5px]", m.role === "USER" ? "text-primary-foreground/70" : "text-muted-foreground")} suppressHydrationWarning>
                    {formatTime(m.createdAt)}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
      <div className="space-y-2.5 border-t border-border p-3">
        {context && (
          <div className="flex items-center gap-2 rounded-lg border border-ai-border bg-ai-soft px-3 py-1.5 text-xs">
            <Sparkles className="size-3.5 shrink-0 text-ai" />
            <span className="min-w-0 flex-1 truncate">
              Ptáte se k: <span className="font-semibold">{context.label}</span>
            </span>
            <button onClick={onClearContext} className="rounded p-0.5 text-muted-foreground hover:bg-card" aria-label="Zrušit kontext">
              <X className="size-3.5" />
            </button>
          </div>
        )}
        <PromptChips onPick={(p) => void send(p)} director={user.role === "DIRECTOR"} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex items-end gap-2 rounded-xl border border-input bg-card p-1.5 pl-3 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            rows={1}
            placeholder="Zeptejte se na cokoliv nebo zadejte pokyn…"
            className="max-h-32 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button type="submit" size="icon-sm" disabled={!input.trim()} loading={streaming} aria-label="Odeslat">
            {!streaming && <ArrowUp />}
          </Button>
        </form>
      </div>
    </Card>
  );
}

function Suggestions({ briefing }: { briefing: BriefingDTO | null | undefined }) {
  const ui = useAppUI();
  const router = useRouter();
  const qc = useQueryClient();
  const openItem = (type: "task" | "message", id: string) => (type === "task" ? ui.openTask(id) : router.push(`/inbox?message=${id}`));

  const assign = async (s: BriefingDTO["content"]["suggestedAssignments"][number]) => {
    if (s.itemType === "task") return ui.openTask(s.itemId);
    try {
      const detail = await qc.fetchQuery({ queryKey: keys.message(s.itemId), queryFn: () => api.get<MessageDetail>(`/api/messages/${s.itemId}`) });
      ui.openAssign({ ...detail, aiTasks: [{ title: s.title, description: s.reason, priority: s.priority, suggestedAssigneeId: s.assigneeId, deadline: detail.aiDeadline }, ...detail.aiTasks] });
    } catch {
      toast.error("Položku se nepodařilo načíst.");
    }
  };

  if (!briefing) return <Skeleton className="h-[640px] rounded-xl" />;
  const c = briefing.content;
  return (
    <Card className="h-[640px] overflow-y-auto scrollbar-thin">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card/95 px-5 py-3.5 backdrop-blur">
        <Sparkles className="size-4 text-ai" />
        <h3 className="text-[15px] font-semibold">AI návrhy</h3>
      </div>
      <div className="space-y-5 p-5">
        <section>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Target className="size-3.5" /> Na co se dnes zaměřit
          </p>
          <ol className="space-y-2">
            {c.focus.map((f, i) => (
              <li key={f.itemId}>
                <button onClick={() => openItem(f.itemType, f.itemId)} className="flex w-full gap-3 rounded-xl border border-border p-3 text-left transition hover:border-primary/30 hover:shadow-card">
                  <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <PriorityBadge priority={f.priority} showLabel={false} size="sm" />
                      <span className="truncate text-[13.5px] font-medium">{f.title}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{f.reason}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        {c.suggestedReplies.length > 0 && (
          <section>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <MessageSquareReply className="size-3.5" /> Navržené odpovědi
            </p>
            <div className="space-y-2">
              {c.suggestedReplies.map((r) => (
                <button key={r.messageId + r.label} onClick={() => openItem("message", r.messageId)} className="block w-full rounded-xl bg-muted/50 p-3 text-left transition hover:bg-muted">
                  <span className="text-[12.5px] font-semibold">{r.label}</span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{r.text}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {c.suggestedAssignments.length > 0 && (
          <section>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <UserPlus className="size-3.5" /> Návrhy přiřazení
            </p>
            <div className="space-y-2">
              {c.suggestedAssignments.map((s) => (
                <div key={s.itemId} className="flex items-center gap-3 rounded-xl border border-border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{s.title}</p>
                    <p className="text-xs text-muted-foreground">{s.reason}</p>
                  </div>
                  <Button size="xs" variant="outline" onClick={() => void assign(s)}>
                    {s.assigneeName ? (
                      <>
                        <Avatar name={s.assigneeName} size="xs" /> {s.assigneeName.split(" ")[0]}
                      </>
                    ) : (
                      "Přiřadit"
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}

        {c.risks.length > 0 && (
          <section>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <ShieldAlert className="size-3.5" /> Rizika
            </p>
            <ul className="space-y-2">
              {c.risks.map((r, i) => (
                <li key={i}>
                  <button disabled={!r.itemId} onClick={() => r.itemId && r.itemType && openItem(r.itemType, r.itemId)} className="w-full rounded-xl border border-p2-border bg-p2-soft/60 p-3 text-left disabled:cursor-default">
                    <p className="text-[13px] font-medium">{r.title}</p>
                    <p className="text-xs text-muted-foreground">{r.detail}</p>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {c.teamNotes.length > 0 && (
          <section>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Users className="size-3.5" /> Tým
            </p>
            <ul className="space-y-1.5">
              {c.teamNotes.map((n, i) => (
                <li key={i} className="flex gap-2 text-[13px] text-muted-foreground">
                  <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-ai" /> {n}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Card>
  );
}

export function AssistantView() {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const aboutTask = params.get("aboutTask");
  const aboutMessage = params.get("aboutMessage");
  const task = useTask(aboutTask);
  const message = useMessage(aboutMessage);
  const chatContext: ChatContext | null = aboutTask
    ? { taskId: aboutTask, label: task.data?.title ?? "úkol" }
    : aboutMessage
      ? { messageId: aboutMessage, label: message.data ? `zpráva od ${message.data.senderName ?? message.data.senderContact}` : "zpráva" }
      : null;
  const briefing = useBriefing();
  const board = useBoard();
  const regenerate = useMutation({
    mutationFn: () => api.post("/api/ai/briefing"),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: keys.briefing });
      toast.success("Briefing je připraven");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const generating = regenerate.isPending;
  const generate = () => regenerate.mutate();
  const b = briefing.data?.briefing;
  const autoRequested = useRef(false);

  useEffect(() => {
    // First visit of the day: generate the briefing automatically (once).
    if (briefing.data && !briefing.data.briefing && !autoRequested.current) {
      autoRequested.current = true;
      regenerate.mutate();
    }
  }, [briefing.data, regenerate]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            AI Briefing <span className="text-gradient-ai">– dnes</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            {formatLongDate(new Date())} · {b ? `aktualizováno ${timeAgo(b.createdAt)}` : "připravuji…"}
            {b?.model === "offline-heuristics" && " · offline režim"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground sm:inline-flex">
            <CalendarDays className="size-3.5" /> {formatLongDate(new Date())}
          </span>
          <Button variant="outline" size="sm" onClick={generate} loading={generating}>
            {!generating && <RefreshCw />} Přegenerovat
          </Button>
        </div>
      </div>

      {b ? (
        <div className="ai-surface rounded-xl border border-ai-border p-5 shadow-card">
          <p className="text-[15px] font-semibold">{b.content.greeting}</p>
          <p className="mt-1.5 max-w-4xl text-[14px] leading-relaxed text-foreground/85">{b.content.summary}</p>
        </div>
      ) : (
        <Skeleton className="h-24 rounded-xl" />
      )}

      <StatsCards stats={board.data?.stats ?? b?.stats} loading={board.isLoading && !b} keys={["critical", "escalated", "waitingMessages"]} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Chat context={chatContext} onClearContext={() => router.replace(pathname)} />
        <Suggestions briefing={b} />
      </div>
    </div>
  );
}
