"use client";
import { motion } from "motion/react";
import { Paperclip, Star, TrendingUp } from "lucide-react";
import { ChannelIcon } from "@/components/common/channel-icon";
import { PriorityDot } from "@/components/priority/priority";
import { Avatar } from "@/components/ui/avatar";
import { formatListTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MessageListItem } from "@/lib/dto";

export function MessageListItemRow({ m, active, onSelect }: { m: MessageListItem; active: boolean; onSelect: () => void }) {
  const unread = m.status === "UNREAD";
  const resolved = m.status === "RESOLVED";
  return (
    <motion.button
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onSelect}
      className={cn(
        "relative flex w-full gap-3 rounded-xl px-3 py-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        active ? "bg-primary/[0.07] ring-1 ring-primary/20" : "hover:bg-muted/60",
        resolved && !active && "opacity-60",
      )}
    >
      {active && <span className="absolute inset-y-2 right-0 w-1 rounded-l-full bg-primary" />}
      <div className="relative">
        <ChannelIcon channel={m.channel} />
        {unread && <span className="absolute -left-1 -top-1 size-2.5 rounded-full bg-primary ring-2 ring-card" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cn("truncate text-[13.5px]", unread ? "font-semibold" : "font-medium")}>{m.senderName ?? m.senderContact}</span>
          {m.starred && <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" />}
          <span className="ml-auto shrink-0 text-[11.5px] text-muted-foreground" suppressHydrationWarning>
            {formatListTime(m.receivedAt)}
          </span>
        </div>
        {m.subject && <p className={cn("truncate text-[13px]", unread ? "font-medium text-foreground" : "text-foreground/80")}>{m.subject}</p>}
        <p className="line-clamp-1 text-[12.5px] text-muted-foreground">{m.aiSummary ?? m.preview}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <PriorityDot priority={m.priority} pulse={!resolved} />
          <span className="text-[11px] font-medium text-muted-foreground">P{m.priority}</span>
          {m.escalated && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-p2">
              <TrendingUp className="size-3" />
              {m.waitingDays >= 1 ? `čeká ${m.waitingDays} ${m.waitingDays === 1 ? "den" : m.waitingDays < 5 ? "dny" : "dní"}` : "eskalováno"}
            </span>
          )}
          {m.hasAttachments && <Paperclip className="size-3 text-muted-foreground" />}
          {m.aiStatus === "PENDING" || m.aiStatus === "PROCESSING" ? <span className="text-[11px] text-ai">AI analyzuje…</span> : null}
          {m.assignee && (
            <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Avatar name={m.assignee.name} color={m.assignee.avatarColor} size="xs" />
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}
