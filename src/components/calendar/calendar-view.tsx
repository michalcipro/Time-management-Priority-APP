"use client";
import { useMemo, useState } from "react";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Clock, Copy, Link2, ListTodo, MapPin, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PRIORITY_STYLES } from "@/components/priority/priority";
import { useAppUI } from "@/components/layout/app-ui";
import { useSessionUser } from "@/components/layout/session-context";
import { useCalendar, useProfile, useTeamMembers } from "@/hooks/queries";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api-client";
import { dayKey, formatLongDate, formatMonthYear, formatTime, fromLocalDateTime } from "@/lib/format";
import { priorityMeta } from "@/lib/priority";
import { cn } from "@/lib/utils";
import type { CalendarItem } from "@/lib/dto";

const WEEKDAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

function addDaysKey(key: string, days: number): string {
  const d = new Date(key + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthGrid(year: number, month: number): string[] {
  const first = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const weekday = (new Date(first + "T12:00:00Z").getUTCDay() + 6) % 7; // Monday = 0
  const start = addDaysKey(first, -weekday);
  return Array.from({ length: 42 }, (_, i) => addDaysKey(start, i));
}

function itemTone(item: CalendarItem) {
  if (item.kind === "deadline" && item.priority) {
    const s = PRIORITY_STYLES[priorityMeta(item.priority).level];
    return cn(s.soft, s.text, "border-l-2", s.border);
  }
  if (item.kind === "external") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-l-2 border-emerald-500/50";
  return "bg-primary/10 text-primary border-l-2 border-primary/50";
}

function NewEventDialog({ open, onOpenChange, defaultDay, connected }: { open: boolean; onOpenChange: (o: boolean) => void; defaultDay: string; connected: string[] }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(`${defaultDay}T09:00`);
  const [end, setEnd] = useState(`${defaultDay}T10:00`);
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [syncTo, setSyncTo] = useState("LOCAL");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const s = fromLocalDateTime(allDay ? start.slice(0, 10) + "T00:00" : start);
    const en = fromLocalDateTime(allDay ? end.slice(0, 10) + "T23:59" : end);
    if (!title.trim() || !s || !en) return toast.error("Vyplňte název a čas.");
    setBusy(true);
    try {
      await api.post("/api/calendar", { title: title.trim(), startAt: s.toISOString(), endAt: en.toISOString(), allDay, location: location || null, description: description || null, syncTo });
      toast.success("Událost vytvořena");
      await qc.invalidateQueries({ queryKey: ["calendar"] });
      onOpenChange(false);
      setTitle("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Nová událost</DialogTitle>
            <DialogDescription>Schůzka s klientem, porada nebo připomínka.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 p-6">
            <div className="space-y-1.5">
              <Label htmlFor="ev-title">Název</Label>
              <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Např. Schůzka – Karel Novák" autoFocus />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={allDay} onCheckedChange={setAllDay} /> Celodenní
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Začátek</Label>
                <Input type={allDay ? "date" : "datetime-local"} value={allDay ? start.slice(0, 10) : start} onChange={(e) => setStart(allDay ? `${e.target.value}T00:00` : e.target.value)} className="dark:[color-scheme:dark]" />
              </div>
              <div className="space-y-1.5">
                <Label>Konec</Label>
                <Input type={allDay ? "date" : "datetime-local"} value={allDay ? end.slice(0, 10) : end} onChange={(e) => setEnd(allDay ? `${e.target.value}T23:59` : e.target.value)} className="dark:[color-scheme:dark]" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Místo</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Kancelář, online, adresa klienta…" />
            </div>
            <div className="space-y-1.5">
              <Label>Poznámka</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Uložit do kalendáře</Label>
              <Select value={syncTo} onValueChange={setSyncTo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOCAL">Jen Priority Agent</SelectItem>
                  {connected.includes("GOOGLE") && <SelectItem value="GOOGLE">Google Kalendář</SelectItem>}
                  {connected.includes("MICROSOFT") && <SelectItem value="MICROSOFT">Outlook kalendář</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Zrušit
            </Button>
            <Button type="submit" loading={busy}>
              Vytvořit událost
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AgendaItem({ item, onOpenTask, onDelete }: { item: CalendarItem; onOpenTask: (id: string) => void; onDelete?: (id: string) => void }) {
  return (
    <div className={cn("group flex gap-3 rounded-lg px-3 py-2.5", itemTone(item))}>
      <div className="w-12 shrink-0 text-xs font-semibold tabular-nums">{item.allDay ? "celý den" : formatTime(item.start)}</div>
      <div className="min-w-0 flex-1">
        <button onClick={() => item.taskId && onOpenTask(item.taskId)} className={cn("block text-left text-[13px] font-medium text-foreground", item.taskId && "hover:underline")}>
          {item.kind === "deadline" ? <ListTodo className="mr-1 inline size-3.5" /> : null}
          {item.title}
        </button>
        {(item.location || item.owner || item.provider === "GOOGLE" || item.provider === "MICROSOFT") && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted-foreground">
            {item.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" /> {item.location}
              </span>
            )}
            {item.provider === "GOOGLE" && <span>Google</span>}
            {item.provider === "MICROSOFT" && <span>Outlook</span>}
          </p>
        )}
      </div>
      {onDelete && item.kind === "event" && (
        <button onClick={() => onDelete(item.id)} className="self-start rounded p-1 text-muted-foreground opacity-0 transition hover:bg-card group-hover:opacity-100" aria-label="Smazat událost">
          <Trash2 className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function CalendarView() {
  const user = useSessionUser();
  const ui = useAppUI();
  const qc = useQueryClient();
  const today = dayKey(new Date());
  const [cursor, setCursor] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }));
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState<"month" | "agenda">("month");
  const [person, setPerson] = useState<string>("me");
  const [newOpen, setNewOpen] = useState(false);
  const members = useTeamMembers();
  const profile = useProfile();

  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const from = view === "month" ? fromLocalDateTime(grid[0] + "T00:00")! : fromLocalDateTime(today + "T00:00")!;
  const to = view === "month" ? fromLocalDateTime(addDaysKey(grid[41], 1) + "T00:00")! : fromLocalDateTime(addDaysKey(today, 21) + "T00:00")!;
  const cal = useCalendar(from.toISOString(), to.toISOString(), person === "me" ? undefined : person);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of cal.data?.items ?? []) {
      const k = dayKey(item.start);
      map.set(k, [...(map.get(k) ?? []), item]);
    }
    return map;
  }, [cal.data]);

  const move = (delta: number) =>
    setCursor((c) => {
      const m = c.month + delta;
      return { year: c.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });

  const removeEvent = async (id: string) => {
    try {
      await api.del(`/api/calendar/${id}`);
      await qc.invalidateQueries({ queryKey: ["calendar"] });
      toast.success("Událost smazána");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const icsUrl = profile.data?.icsToken ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/ics/${profile.data.icsToken}` : null;
  const selectedItems = byDay.get(selected) ?? [];
  const monthLabel = formatMonthYear(fromLocalDateTime(`${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-15T12:00`)!);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => move(-1)} aria-label="Předchozí měsíc">
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => move(1)} aria-label="Další měsíc">
            <ChevronRight />
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 });
            setSelected(today);
          }}
        >
          Dnes
        </Button>
        <h2 className="ml-2 text-xl font-semibold tracking-tight">{view === "month" ? monthLabel : "Nadcházející 3 týdny"}</h2>
        <div className="flex-1" />
        {user.role === "DIRECTOR" && (
          <Select value={person} onValueChange={setPerson}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="me">Můj kalendář</SelectItem>
              {(members.data ?? [])
                .filter((m) => m.id !== user.id && m.role !== "ADMIN")
                .map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
        <Tabs value={view} onValueChange={(v) => setView(v as "month" | "agenda")}>
          <TabsList>
            <TabsTrigger value="month">Měsíc</TabsTrigger>
            <TabsTrigger value="agenda">Agenda</TabsTrigger>
          </TabsList>
        </Tabs>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus /> Událost
        </Button>
      </div>

      {cal.data?.errors.length ? <p className="rounded-lg border border-p2-border bg-p2-soft px-3 py-2 text-xs text-p2">{cal.data.errors.join(" · ")}</p> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        {view === "month" ? (
          <Card className="overflow-hidden">
            <div className="grid grid-cols-7 border-b border-border bg-muted/30 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {grid.map((key, i) => {
                const items = byDay.get(key) ?? [];
                const inMonth = Number(key.slice(5, 7)) - 1 === cursor.month;
                const isToday = key === today;
                const isSel = key === selected;
                return (
                  <button
                    key={key}
                    onClick={() => setSelected(key)}
                    onDoubleClick={() => {
                      setSelected(key);
                      setNewOpen(true);
                    }}
                    className={cn(
                      "flex min-h-24 flex-col items-stretch justify-start border-b border-r border-border p-1.5 text-left transition-colors sm:min-h-28",
                      (i + 1) % 7 === 0 && "border-r-0",
                      !inMonth && "bg-muted/25 text-muted-foreground",
                      isSel ? "bg-primary/[0.06]" : "hover:bg-muted/40",
                    )}
                  >
                    <span className={cn("mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs font-medium", isToday && "bg-primary font-semibold text-primary-foreground", isSel && !isToday && "ring-1 ring-primary")}>
                      {Number(key.slice(8, 10))}
                    </span>
                    <div className="space-y-0.5">
                      {items.slice(0, 3).map((it) => (
                        <div key={it.id} className={cn("truncate rounded px-1 py-px text-[10.5px] font-medium", itemTone(it))}>
                          {!it.allDay && <span className="mr-1 tabular-nums opacity-75">{formatTime(it.start)}</span>}
                          {it.title.replace(/^Termín: /, "⏱ ")}
                        </div>
                      ))}
                      {items.length > 3 && <div className="px-1 text-[10.5px] font-medium text-muted-foreground">+{items.length - 3} další</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        ) : (
          <Card>
            <CardContent className="space-y-5 py-5">
              {cal.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                Array.from({ length: 21 }, (_, i) => addDaysKey(today, i))
                  .filter((k) => byDay.get(k)?.length)
                  .map((k) => (
                    <div key={k}>
                      <p className="mb-2 text-sm font-semibold">{k === today ? "Dnes" : formatLongDate(fromLocalDateTime(k + "T12:00")!)}</p>
                      <div className="space-y-1.5">
                        {(byDay.get(k) ?? []).map((it) => (
                          <AgendaItem key={it.id} item={it} onOpenTask={ui.openTask} onDelete={removeEvent} />
                        ))}
                      </div>
                    </div>
                  ))
              )}
              {!cal.isLoading && (cal.data?.items.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">V příštích třech týdnech nemáte žádné události.</p>}
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="size-4 text-muted-foreground" />
                {selected === today ? "Dnes" : formatLongDate(fromLocalDateTime(selected + "T12:00")!)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {selectedItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Žádné události ani termíny.</p>
              ) : (
                selectedItems.map((it) => <AgendaItem key={it.id} item={it} onOpenTask={ui.openTask} onDelete={removeEvent} />)
              )}
              <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => setNewOpen(true)}>
                <CalendarPlus /> Přidat událost
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <Link2 className="size-4 text-muted-foreground" /> Propojené kalendáře
              </CardTitle>
              <CardDescription>Události z Google a Outlooku se zobrazují automaticky.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                {["GOOGLE", "MICROSOFT"].map((p) => (
                  <span key={p} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", cal.data?.connected.includes(p) ? "bg-p4-soft text-p4" : "bg-muted text-muted-foreground")}>
                    <span className={cn("size-1.5 rounded-full", cal.data?.connected.includes(p) ? "bg-p4" : "bg-muted-foreground/50")} />
                    {p === "GOOGLE" ? "Google Kalendář" : "Outlook"}
                  </span>
                ))}
              </div>
              {icsUrl && (
                <div className="space-y-1.5 rounded-lg bg-muted/40 p-3">
                  <p className="text-xs font-medium">Apple Kalendář / odběr ICS</p>
                  <p className="text-[11.5px] text-muted-foreground">Přidejte odběr kalendáře s vašimi termíny úkolů (iPhone: Nastavení → Kalendář → Účty → Přidat odebíraný kalendář).</p>
                  <div className="flex gap-1.5">
                    <Input readOnly value={icsUrl} className="h-8 text-[11px]" onFocus={(e) => e.currentTarget.select()} />
                    <Button
                      size="icon-sm"
                      variant="outline"
                      onClick={async () => {
                        await navigator.clipboard.writeText(icsUrl);
                        toast.success("Odkaz zkopírován");
                      }}
                      aria-label="Kopírovat odkaz"
                    >
                      <Copy />
                    </Button>
                  </div>
                </div>
              )}
              <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <Clock className="size-3" /> Termíny úkolů jsou barevně odlišené podle priority.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
      <NewEventDialog key={selected + String(newOpen)} open={newOpen} onOpenChange={setNewOpen} defaultDay={selected} connected={cal.data?.connected ?? []} />
    </div>
  );
}

