"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { useTheme } from "next-themes";
import { ArrowRight, CalendarDays, ClipboardList, Inbox, LayoutGrid, ListChecks, Moon, Plus, Search, Settings, Sparkles, Users } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ChannelIcon } from "@/components/common/channel-icon";
import { PriorityBadge } from "@/components/priority/priority";
import { useSearch } from "@/hooks/queries";
import { can } from "@/lib/permissions";
import { formatListTime } from "@/lib/format";
import { useSessionUser } from "./session-context";
import { useAppUI } from "./app-ui";

function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const itemClass =
  "flex cursor-default select-none items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none data-[selected=true]:bg-muted [&_svg]:size-4 [&_svg]:text-muted-foreground";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const user = useSessionUser();
  const ui = useAppUI();
  const { setTheme, resolvedTheme } = useTheme();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query);
  const search = useSearch(debounced);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const go = (href: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  };

  const nav = useMemo(() => {
    const all = [
      { href: "/board", label: "Priority Board", icon: LayoutGrid, show: can(user.role, "board:view") },
      { href: "/inbox", label: "Inbox – sjednocené zprávy", icon: Inbox, show: user.role !== "ADMIN" },
      { href: "/tasks", label: "Úkoly týmu", icon: ClipboardList, show: can(user.role, "tasks:read:all") },
      { href: "/my-tasks", label: "Moje úkoly", icon: ListChecks, show: user.role !== "ADMIN" },
      { href: "/team", label: "Tým a vytížení", icon: Users, show: can(user.role, "team:view") },
      { href: "/calendar", label: "Kalendář", icon: CalendarDays, show: user.role !== "ADMIN" },
      { href: "/assistant", label: "AI Asistent a briefing", icon: Sparkles, show: can(user.role, "ai:use") },
      { href: "/settings", label: "Nastavení", icon: Settings, show: true },
    ];
    const q = query.trim().toLowerCase();
    return all.filter((n) => n.show && (!q || n.label.toLowerCase().includes(q)));
  }, [user.role, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl overflow-hidden p-0" hideClose>
        <DialogTitle className="sr-only">Hledání a příkazy</DialogTitle>
        <Command shouldFilter={false} className="flex flex-col" loop>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-4 text-muted-foreground" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Hledat úkoly, klienty, zprávy…"
              className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            />
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">ESC</kbd>
          </div>
          <Command.List className="max-h-[60vh] overflow-y-auto p-2 scrollbar-thin">
            <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
              {debounced.trim().length >= 2 && search.isFetching ? "Hledám…" : "Nic jsme nenašli."}
            </Command.Empty>

            {search.data && search.data.tasks.length > 0 && (
              <Command.Group heading="Úkoly" className="px-1 py-1 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                {search.data.tasks.map((t) => (
                  <Command.Item key={t.id} value={`task-${t.id}`} onSelect={() => go(`${user.role === "DIRECTOR" ? "/tasks" : "/my-tasks"}?task=${t.id}`)} className={itemClass}>
                    <PriorityBadge priority={t.priority} showLabel={false} size="sm" />
                    <span className="flex-1 truncate text-foreground">{t.title}</span>
                    {t.clientName && <span className="truncate text-xs text-muted-foreground">{t.clientName}</span>}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {search.data && search.data.messages.length > 0 && (
              <Command.Group heading="Zprávy" className="px-1 py-1 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                {search.data.messages.map((m) => (
                  <Command.Item key={m.id} value={`msg-${m.id}`} onSelect={() => go(`/inbox?message=${m.id}`)} className={itemClass}>
                    <ChannelIcon channel={m.channel} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-foreground">{m.senderName ?? m.senderContact}</span>
                      <span className="block truncate text-xs text-muted-foreground">{m.subject ?? m.preview}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{formatListTime(m.receivedAt)}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {nav.length > 0 && (
              <Command.Group heading="Přejít na" className="px-1 py-1 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                {nav.map((n) => (
                  <Command.Item key={n.href} value={n.href} onSelect={() => go(n.href)} className={itemClass}>
                    <n.icon />
                    <span className="flex-1 text-foreground">{n.label}</span>
                    <ArrowRight className="opacity-40" />
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {!query && (
              <Command.Group heading="Akce" className="px-1 py-1 text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                {can(user.role, "tasks:create") && (
                  <Command.Item
                    value="new-task"
                    onSelect={() => {
                      onOpenChange(false);
                      ui.openCreateTask();
                    }}
                    className={itemClass}
                  >
                    <Plus /> <span className="text-foreground">Nový úkol</span>
                  </Command.Item>
                )}
                <Command.Item value="theme" onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} className={itemClass}>
                  <Moon /> <span className="text-foreground">Přepnout světlý / tmavý režim</span>
                </Command.Item>
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
