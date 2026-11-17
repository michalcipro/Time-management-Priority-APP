"use client";
import { useRouter } from "next/navigation";
import { Bell, BellRing, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PriorityDot } from "@/components/priority/priority";
import { EmptyState } from "@/components/common/empty-state";
import { useMarkNotifications, useNotifications } from "@/hooks/queries";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useNow } from "@/hooks/use-now";

export function NotificationsBell() {
  const router = useRouter();
  const { data } = useNotifications();
  const mark = useMarkNotifications();
  const now = useNow();
  const unread = data?.unread ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Upozornění (${unread} nepřečtených)`} className="relative">
          {unread > 0 ? <BellRing /> : <Bell />}
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-primary ring-2 ring-background" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Upozornění</p>
            <p className="text-xs text-muted-foreground">{unread > 0 ? `${unread} nepřečtených` : "Vše přečteno"}</p>
          </div>
          {unread > 0 && (
            <Button variant="ghost" size="xs" onClick={() => mark.mutate("all")}>
              <CheckCheck /> Označit vše
            </Button>
          )}
        </div>
        <div className="max-h-[26rem] overflow-y-auto scrollbar-thin">
          {!data || data.items.length === 0 ? (
            <EmptyState icon={Bell} title="Žádná upozornění" description="Tady uvidíte přiřazené úkoly, eskalace a komentáře." className="py-10" />
          ) : (
            data.items.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.readAt) mark.mutate([n.id]);
                  if (n.link) router.push(n.link);
                }}
                className={cn("flex w-full gap-3 border-b border-border/60 px-4 py-3 text-left transition hover:bg-muted/50", !n.readAt && "bg-primary/[0.035]")}
              >
                <span className="mt-1.5">{n.priority ? <PriorityDot priority={n.priority} /> : <span className="inline-block size-2 rounded-full bg-muted-foreground/40" />}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[13px] leading-snug", !n.readAt ? "font-semibold" : "font-medium text-foreground/80")}>{n.title}</span>
                  {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
                  <span className="mt-1 block text-[11px] text-muted-foreground/80" suppressHydrationWarning>
                    {timeAgo(n.createdAt, now)}
                  </span>
                </span>
                {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
