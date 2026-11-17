"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Inbox, MailSearch, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/common/empty-state";
import { useSessionUser } from "@/components/layout/session-context";
import { useMessages } from "@/hooks/queries";
import { cn } from "@/lib/utils";
import type { MessageListQuery } from "@/lib/validation";
import { MessageListItemRow } from "./message-list";
import { MessageDetail } from "./message-detail";

type View = MessageListQuery["view"];
type ChannelFilter = MessageListQuery["channel"];

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function InboxView() {
  const user = useSessionUser();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = params.get("message");

  const [view, setView] = useState<View>("all");
  const [channel, setChannel] = useState<ChannelFilter>("ALL");
  const [sort, setSort] = useState<MessageListQuery["sort"]>("newest");
  const [q, setQ] = useState("");
  const query = useDebounced(q);

  const { data, isLoading, isFetching } = useMessages({ view, channel, sort, q: query || undefined, limit: 100 });
  const counts = data?.counts;

  const select = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("message", id);
    else next.delete("message");
    router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false });
  };

  // On desktop, open the first message when nothing is selected.
  useEffect(() => {
    if (!selected && data?.items.length && typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      select(data.items[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.items.length, selected]);

  const chips = useMemo(
    () => [
      { key: "all", label: "Vše", count: counts?.all, onClick: () => { setView("all"); setChannel("ALL"); }, active: view === "all" && channel === "ALL" },
      { key: "high", label: "Vysoká priorita", count: counts?.highPriority, onClick: () => { setView("high"); setChannel("ALL"); }, active: view === "high" },
      { key: "unread", label: "Nepřečtené", count: counts?.unread, onClick: () => { setView("unread"); setChannel("ALL"); }, active: view === "unread" },
      { key: "waiting", label: "Čeká na odpověď", count: counts?.waiting, onClick: () => { setView("waiting"); setChannel("ALL"); }, active: view === "waiting" },
      ...(user.role === "DIRECTOR" ? [{ key: "assigned", label: "Přiřazené", count: counts?.assigned, onClick: () => { setView("assigned"); setChannel("ALL"); }, active: view === "assigned" }] : []),
      { key: "EMAIL", label: "E-mail", count: counts?.byChannel.EMAIL, onClick: () => { setView("all"); setChannel("EMAIL"); }, active: channel === "EMAIL" },
      { key: "WHATSAPP", label: "WhatsApp", count: counts?.byChannel.WHATSAPP, onClick: () => { setView("all"); setChannel("WHATSAPP"); }, active: channel === "WHATSAPP" },
      { key: "SMS", label: "SMS", count: counts?.byChannel.SMS, onClick: () => { setView("all"); setChannel("SMS"); }, active: channel === "SMS" },
      { key: "IMESSAGE", label: "iMessage", count: counts?.byChannel.IMESSAGE, onClick: () => { setView("all"); setChannel("IMESSAGE"); }, active: channel === "IMESSAGE" },
      { key: "resolved", label: "Vyřízené", count: counts?.resolved, onClick: () => { setView("resolved"); setChannel("ALL"); }, active: view === "resolved" },
    ],
    [counts, view, channel, user.role],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <p className="hidden text-sm text-muted-foreground xl:block xl:flex-1">Všechny zprávy klientů na jednom místě. AI shrnuje, prioritizuje a navrhuje odpovědi.</p>
        <div className="flex gap-2">
          <div className="relative flex-1 xl:w-80 xl:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Hledat ve zprávách…" className="pl-9 pr-8" />
            {q && (
              <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Vymazat">
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as MessageListQuery["sort"])}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Nejnovější</SelectItem>
              <SelectItem value="oldest">Nejstarší</SelectItem>
              <SelectItem value="priority">Podle priority</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-thin lg:mx-0 lg:flex-wrap lg:px-0">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={c.onClick}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium transition",
              c.active ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/25" : "border-border bg-card text-foreground/80 hover:bg-muted",
            )}
          >
            {c.label}
            {c.count !== undefined && <span className={cn("text-xs", c.active ? "text-primary-foreground/80" : "text-muted-foreground")}>({c.count})</span>}
          </button>
        ))}
      </div>

      <div className="grid h-[calc(100dvh-14.5rem)] min-h-[520px] gap-4 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        <div className={cn("flex min-h-0 flex-col rounded-2xl border border-border bg-card shadow-card", selected && "hidden lg:flex")}>
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
            <span>{data ? `${data.items.length} zpráv` : "Načítám…"}</span>
            {isFetching && !isLoading && <span className="animate-pulse">aktualizuji…</span>}
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2 scrollbar-thin">
            {isLoading ? (
              Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex gap-3 p-3">
                  <Skeleton className="size-8 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-1/2" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))
            ) : data && data.items.length > 0 ? (
              data.items.map((m) => <MessageListItemRow key={m.id} m={m} active={m.id === selected} onSelect={() => select(m.id)} />)
            ) : (
              <EmptyState icon={q ? MailSearch : Inbox} title={q ? "Nic nenalezeno" : "Žádné zprávy"} description={q ? "Zkuste jiný výraz – hledáme i bez diakritiky." : "V tomto pohledu nejsou žádné zprávy."} />
            )}
          </div>
        </div>

        <div className={cn("min-h-0 overflow-hidden rounded-2xl border border-border bg-card shadow-card", !selected && "hidden lg:block")}>
          {selected ? (
            <MessageDetail key={selected} id={selected} onBack={() => select(null)} />
          ) : (
            <EmptyState icon={Inbox} title="Vyberte zprávu" description="Detail zprávy, AI shrnutí a návrhy odpovědí se zobrazí zde." className="h-full" />
          )}
        </div>
      </div>
    </div>
  );
}
