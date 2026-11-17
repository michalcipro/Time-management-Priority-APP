"use client";
import { CalendarClock, Gauge, ListPlus, Lightbulb, RefreshCw, Sparkles, Tags, Target } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PriorityBadge } from "@/components/priority/priority";
import { useAnalyzeMessage, useUpdateMessage } from "@/hooks/queries";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AISentiment } from "@/lib/ai-types";
import type { MessageDetail } from "@/lib/dto";
import { useAppUI } from "@/components/layout/app-ui";

const SENTIMENT: Record<AISentiment, { label: string; className: string }> = {
  positive: { label: "Pozitivní", className: "bg-p4-soft text-p4" },
  neutral: { label: "Neutrální", className: "bg-muted text-muted-foreground" },
  concerned: { label: "Obavy", className: "bg-p3-soft text-p3-text" },
  negative: { label: "Nespokojenost", className: "bg-p2-soft text-p2" },
  urgent: { label: "Naléhavé", className: "bg-p1-soft text-p1" },
};

function Row({ icon: Icon, label, children }: { icon: typeof Target; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-ai-soft text-ai">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-foreground">{label}</p>
        <div className="text-[13px] text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export function AIPanel({ message }: { message: MessageDetail }) {
  const analyze = useAnalyzeMessage();
  const update = useUpdateMessage();
  const ui = useAppUI();
  const processing = message.aiStatus === "PENDING" || message.aiStatus === "PROCESSING" || analyze.isPending;
  const offline = message.aiModel === "offline-heuristics";

  if (message.aiStatus === "SKIPPED" && !analyze.isPending) {
    return (
      <div className="ai-surface flex items-center justify-between gap-3 rounded-xl border border-ai-border p-4">
        <p className="text-sm text-muted-foreground">Automatická AI analýza je pro tuto zprávu vypnutá.</p>
        <Button size="sm" variant="ai" onClick={() => analyze.mutate(message.id)}>
          <Sparkles /> Analyzovat
        </Button>
      </div>
    );
  }

  return (
    <section className="ai-surface rounded-xl border border-ai-border p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex size-7 items-center justify-center rounded-lg bg-gradient-ai text-white shadow-sm shadow-ai/30">
          <Sparkles className="size-4" />
        </span>
        <h3 className="text-sm font-semibold">AI shrnutí</h3>
        <span className="rounded-full bg-ai-soft px-2 py-0.5 text-[11px] font-medium text-ai">
          {offline ? "Offline AI (heuristiky)" : message.aiModel ? `Claude · ${message.aiModel.replace("claude-", "")}` : "AI"}
        </span>
        <Button
          size="xs"
          variant="ghost"
          className="ml-auto"
          onClick={() => analyze.mutate(message.id, { onSuccess: () => toast.success("Analýza aktualizována") })}
          disabled={processing}
        >
          <RefreshCw className={cn(processing && "animate-spin")} /> Regenerovat
        </Button>
      </div>

      {processing && !message.aiSummary ? (
        <div className="mt-4 space-y-2.5">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-5/6" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
      ) : (
        <div className="mt-4 space-y-3.5">
          {message.aiSummary && <p className="text-[14px] leading-relaxed text-foreground">{message.aiSummary}</p>}
          <div className="grid gap-3.5 sm:grid-cols-2">
            {message.aiIntent && (
              <Row icon={Target} label="Záměr">
                {message.aiIntent}
              </Row>
            )}
            {message.aiTopics.length > 0 && (
              <Row icon={Tags} label="Klíčová témata">
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {message.aiTopics.map((t) => (
                    <span key={t} className="rounded-md bg-card px-1.5 py-0.5 text-[11.5px] ring-1 ring-border">
                      {t}
                    </span>
                  ))}
                </div>
              </Row>
            )}
            {message.aiSuggestedPriority && (
              <Row icon={Gauge} label="Navržená priorita">
                <div className="flex flex-wrap items-center gap-2">
                  <PriorityBadge priority={message.aiSuggestedPriority} size="sm" />
                  {message.aiSentiment && <span className={cn("rounded-full px-1.5 py-px text-[10.5px] font-medium", SENTIMENT[message.aiSentiment].className)}>{SENTIMENT[message.aiSentiment].label}</span>}
                  {message.permissions.canChangePriority && message.aiSuggestedPriority !== message.basePriority && message.status !== "RESOLVED" && (
                    <button
                      className="text-[11.5px] font-medium text-primary hover:underline"
                      onClick={() => update.mutate({ id: message.id, priority: message.aiSuggestedPriority!, priorityReason: "Přijat návrh AI" })}
                    >
                      Použít
                    </button>
                  )}
                </div>
                {message.aiPriorityReason && <p className="mt-0.5 text-[12px]">{message.aiPriorityReason}</p>}
              </Row>
            )}
            {message.aiDeadlines.length > 0 && (
              <Row icon={CalendarClock} label="Termíny ve zprávě">
                <ul className="space-y-0.5">
                  {message.aiDeadlines.map((d, i) => (
                    <li key={i}>
                      <span className="font-medium text-foreground">{formatDateTime(d.date)}</span> – {d.label}
                    </li>
                  ))}
                </ul>
              </Row>
            )}
          </div>
          {message.aiTasks.length > 0 && (
            <div className="rounded-lg border border-ai-border/70 bg-card/70 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold">
                <Lightbulb className="size-3.5 text-ai" /> Navržené úkoly
              </p>
              <ul className="space-y-2">
                {message.aiTasks.map((t, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <PriorityBadge priority={t.priority ?? 3} showLabel={false} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{t.title}</p>
                      {t.deadline && <p className="text-[11.5px] text-muted-foreground">do {formatDateTime(t.deadline)}</p>}
                    </div>
                    {message.permissions.canAssign && (
                      <Button size="xs" variant="outline" onClick={() => ui.openAssign({ ...message, aiTasks: [t, ...message.aiTasks.filter((_, j) => j !== i)] })}>
                        <ListPlus /> Vytvořit
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
