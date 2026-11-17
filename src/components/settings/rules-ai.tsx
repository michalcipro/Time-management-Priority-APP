"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Coins, Cpu, Gauge, Timer, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, FieldHint } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EscalationTimeline } from "@/components/priority/escalation-timeline";
import { PriorityBadge, PRIORITY_STYLES } from "@/components/priority/priority";
import { useSaveSettings, useTeamSettings, keys } from "@/hooks/queries";
import { useNow } from "@/hooks/use-now";
import { api } from "@/lib/api-client";
import { AI_MODELS, type AISettings } from "@/lib/settings";
import { PRIORITY_RULE_PRESETS, type PriorityRules, PRIORITIES } from "@/lib/priority";
import { cn } from "@/lib/utils";
import { SettingRow, SettingsSection } from "./settings-nav";

function HoursInput({ value, onChange, unit }: { value: number; onChange: (v: number) => void; unit: "h" | "d" }) {
  const display = unit === "d" ? Math.round((value / 24) * 10) / 10 : value;
  return (
    <div className="flex items-center gap-2">
      <Input type="number" min={1} step={unit === "d" ? 0.5 : 1} value={display} onChange={(e) => onChange(Math.max(1, Math.round(Number(e.target.value) * (unit === "d" ? 24 : 1))))} className="h-9 w-24" />
      <span className="text-sm text-muted-foreground">{unit === "d" ? "dní" : "hodin"}</span>
    </div>
  );
}

export function RulesForm() {
  const { data } = useTeamSettings();
  const [rules, setRules] = useState<PriorityRules | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate form from loaded settings
    if (data) setRules(data.settings.priorityRules as PriorityRules);
  }, [data]);

  const now = useNow(3_600_000);
  const sampleDeadline = useMemo(() => new Date(now.getTime() + 30 * 24 * 3_600_000), [now]);
  if (!rules) return <Skeleton className="h-[32rem] rounded-xl" />;
  const set = <K extends keyof PriorityRules>(k: K, v: PriorityRules[K]) => setRules({ ...rules, [k]: v });
  const valid = rules.p1Hours < rules.p2Hours && rules.p2Hours < rules.p3Hours && rules.p3Hours < rules.p4Hours;

  async function save() {
    setSaving(true);
    try {
      const res = await api.put<{ recalculated: { tasks: number; messages: number } }>("/api/settings/rules", rules);
      toast.success("Pravidla uložena", { description: `Přepočítáno ${res.recalculated.tasks} úkolů a ${res.recalculated.messages} zpráv.` });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <SettingsSection
        title="Dynamické zvyšování priority"
        description="Úkoly s termínem začínají nízko a s blížícím se termínem automaticky stoupají. Ruční změny mají vždy přednost a zapisují se do historie."
        actions={
          <Button onClick={save} loading={saving} disabled={!valid}>
            Uložit a přepočítat
          </Button>
        }
      >
        <div className="mb-5 grid gap-2 sm:grid-cols-3">
          {PRIORITY_RULE_PRESETS.map((p) => {
            const active = p.rules.p1Hours === rules.p1Hours && p.rules.p2Hours === rules.p2Hours && p.rules.p3Hours === rules.p3Hours && p.rules.p4Hours === rules.p4Hours;
            return (
              <button key={p.id} onClick={() => setRules({ ...rules, ...p.rules })} className={cn("rounded-xl border p-3 text-left transition", active ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:bg-muted/50")}>
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  {active && <Check className="size-4 text-primary" />} {p.name}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>
              </button>
            );
          })}
        </div>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {(
            [
              ["p1Hours", 1, "h"],
              ["p2Hours", 2, "h"],
              ["p3Hours", 3, "d"],
              ["p4Hours", 4, "d"],
            ] as const
          ).map(([key, level, unit]) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <PriorityBadge priority={level} />
                <span className="text-sm text-muted-foreground">když do termínu zbývá</span>
              </div>
              <HoursInput value={rules[key]} onChange={(v) => set(key, v)} unit={unit} />
            </div>
          ))}
        </div>
        {!valid && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-destructive">
            <TriangleAlert className="size-4" /> Prahy musí být vzestupné (P1 &lt; P2 &lt; P3 &lt; P4).
          </p>
        )}
        <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4">
          <p className="mb-1 text-sm font-semibold">Náhled: úkol s termínem za 30 dní (výchozí P5)</p>
          <p className="mb-3 text-xs text-muted-foreground">Úkol se posouvá po časové ose a jeho priorita stoupá: P5 → P4 → P3 → P2 → P1.</p>
          {valid && <EscalationTimeline deadline={sampleDeadline} basePriority={5} rules={rules} />}
          <div className="mt-4 grid grid-cols-5 gap-2">
            {PRIORITIES.map((p) => (
              <div key={p.level} className={cn("rounded-lg border px-2 py-2 text-center", PRIORITY_STYLES[p.level].border, PRIORITY_STYLES[p.level].soft)}>
                <p className={cn("text-xs font-bold", PRIORITY_STYLES[p.level].text)}>{p.code}</p>
                <p className="text-[11px] text-muted-foreground">{p.description}</p>
              </div>
            ))}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Čekající zprávy a připomínky" description="Proaktivní upozornění typu „Zpráva čeká 4 dny, priorita se zvýšila“.">
        <div className="divide-y divide-border">
          <SettingRow title="Zvýšit prioritu nezodpovězené zprávy" description="O jeden stupeň za každých N dní čekání na odpověď.">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">každé</span>
              <Input type="number" min={0.5} step={0.5} value={rules.messageWaitDays} onChange={(e) => set("messageWaitDays", Math.max(0.5, Number(e.target.value)))} className="h-9 w-20" />
              <span className="text-sm text-muted-foreground">dny</span>
            </div>
          </SettingRow>
          <SettingRow title="Maximální automatická priorita zprávy" description="Čekání samo nikdy nepřekročí tuto úroveň (termín ve zprávě ano).">
            <Select value={String(rules.messageMaxAutoPriority)} onValueChange={(v) => set("messageMaxAutoPriority", Number(v) as PriorityRules["messageMaxAutoPriority"])}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.slice(0, 4).map((p) => (
                  <SelectItem key={p.level} value={String(p.level)}>
                    {p.code} {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow title="Priorita po připomenutí" description="„Připomenout za X dní“ – úkol se po uplynutí vrátí s touto prioritou.">
            <Select value={String(rules.remindPriority)} onValueChange={(v) => set("remindPriority", Number(v) as PriorityRules["remindPriority"])}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p.level} value={String(p.level)}>
                    {p.code} {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow title="Upozornit při eskalaci na" description="Lidé dostanou notifikaci, když položka vystoupá na tuto prioritu nebo výš.">
            <Select value={String(rules.notifyAtOrAbove)} onValueChange={(v) => set("notifyAtOrAbove", Number(v) as PriorityRules["notifyAtOrAbove"])}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p.level} value={String(p.level)}>
                    {p.code} a výš
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
        </div>
      </SettingsSection>
    </>
  );
}

interface AIUsage {
  totals: { calls: number; costUsd: number; inputTokens: number; outputTokens: number; errors: number; avgLatencyMs: number };
  byDay: { day: string; calls: number; cost: number }[];
  byKind: { kind: string; calls: number; cost: number }[];
  recent: { id: string; kind: string; model: string; status: string; inputTokens: number; outputTokens: number; costUsd: number; latencyMs: number; error: string | null; createdAt: string }[];
}

const KIND_LABELS: Record<string, string> = { MESSAGE_ANALYSIS: "Analýza zpráv", BRIEFING: "Briefingy", CHAT: "Chat s asistentem", REPLY_DRAFT: "Návrhy odpovědí" };

export function AISettingsForm() {
  const { data } = useTeamSettings();
  const usage = useQuery({ queryKey: keys.aiUsage, queryFn: () => api.get<AIUsage>("/api/settings/ai-usage") });
  const save = useSaveSettings<Partial<AISettings>>("/api/settings/ai", "PUT", "Nastavení AI uloženo.");
  const [ai, setAi] = useState<AISettings | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate form from loaded settings
    if (data) setAi(data.settings.ai);
  }, [data]);

  if (!ai || !data) return <Skeleton className="h-[32rem] rounded-xl" />;
  const set = <K extends keyof AISettings>(k: K, v: AISettings[K]) => setAi({ ...ai, [k]: v });
  const maxCost = Math.max(0.000001, ...(usage.data?.byDay.map((d) => d.cost) ?? [0]));
  const monthly = usage.data ? usage.data.totals.costUsd : 0;
  const aiOnline = data.features.ai === true;

  return (
    <>
      {!aiOnline && (
        <div className="flex items-start gap-3 rounded-xl border border-p3-border bg-p3-soft p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-p3-text" />
          <p>
            <span className="font-semibold">AI běží v offline režimu.</span> Pro plnohodnotné shrnutí, návrhy a briefingy nastavte proměnnou <code className="rounded bg-card px-1">ANTHROPIC_API_KEY</code>. Do té doby používáme deterministické heuristiky.
          </p>
        </div>
      )}
      <SettingsSection
        title="Model Claude"
        description="Pro běžný provoz plně stačí nejmenší model – náklady jsou v jednotkách dolarů měsíčně."
        actions={
          <Button onClick={() => save.mutate(ai)} loading={save.isPending}>
            Uložit
          </Button>
        }
      >
        <div className="space-y-5">
          {(
            [
              ["analysisModel", "Analýza příchozích zpráv", "Shrnutí, priorita, termíny, úkoly a návrhy odpovědí – běží u každé zprávy."],
              ["assistantModel", "Briefingy a asistent", "Ranní briefing a chat s asistentem."],
            ] as const
          ).map(([key, title, desc]) => (
            <div key={key}>
              <p className="text-sm font-medium">{title}</p>
              <p className="mb-2 text-xs text-muted-foreground">{desc}</p>
              <div className="grid gap-2 md:grid-cols-3">
                {AI_MODELS.map((m) => {
                  const active = ai[key] === m.id;
                  return (
                    <button key={m.id} onClick={() => set(key, m.id)} className={cn("rounded-xl border p-3 text-left transition", active ? "border-ai bg-ai-soft ring-2 ring-ai/20" : "border-border hover:bg-muted/50")}>
                      <p className="flex items-center gap-1.5 text-sm font-semibold">
                        {active && <Check className="size-4 text-ai" />} {m.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{m.description}</p>
                      <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">
                        ${m.inputPerMTok} / ${m.outputPerMTok} za 1M tokenů
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Chování asistenta" description="AI vždy jen navrhuje – nikdy nic neodesílá samo.">
        <div className="divide-y divide-border">
          <SettingRow title="Automaticky analyzovat nové zprávy" description="Vypnuto = analýza jen na vyžádání tlačítkem.">
            <Switch checked={ai.autoAnalyze} onCheckedChange={(v) => set("autoAnalyze", v)} />
          </SettingRow>
          <SettingRow title="Ranní briefing pro ředitele" description="Vygeneruje se automaticky v nastavenou hodinu.">
            <div className="flex items-center gap-3">
              <Select value={String(ai.briefingHour)} onValueChange={(v) => set("briefingHour", Number(v))}>
                <SelectTrigger className="h-8 w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 5).map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {h}:00
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Switch checked={ai.briefingEnabled} onCheckedChange={(v) => set("briefingEnabled", v)} />
            </div>
          </SettingRow>
          <SettingRow title="Tón odpovědí" description="Jak mají znít návrhy odpovědí klientům.">
            <Select value={ai.replyTone} onValueChange={(v) => set("replyTone", v as AISettings["replyTone"])}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="formal">Formální (vykání)</SelectItem>
                <SelectItem value="friendly">Přátelský</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Podpis e-mailů</Label>
            <Textarea value={ai.signature} onChange={(e) => set("signature", e.target.value)} rows={4} placeholder={"S pozdravem\nJméno Příjmení"} />
          </div>
          <div className="space-y-1.5">
            <Label>Kontext firmy pro AI</Label>
            <Textarea value={ai.firmContext} onChange={(e) => set("firmContext", e.target.value)} rows={4} placeholder="Čím se firma zabývá, jak komunikujeme s klienty, co neslibujeme…" />
            <FieldHint>Pomáhá AI lépe prioritizovat a psát odpovědi ve vašem stylu.</FieldHint>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Využití a náklady (30 dní)" description="Každé volání AI se zaznamenává pro audit a kontrolu nákladů.">
        {usage.isLoading || !usage.data ? (
          <Skeleton className="h-48" />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { icon: Coins, label: "Náklady", value: `$${monthly.toFixed(3)}` },
                { icon: Cpu, label: "Volání", value: usage.data.totals.calls.toLocaleString("cs-CZ") },
                { icon: Gauge, label: "Tokeny (vstup / výstup)", value: `${Math.round(usage.data.totals.inputTokens / 1000)}k / ${Math.round(usage.data.totals.outputTokens / 1000)}k` },
                { icon: Timer, label: "Průměrná odezva", value: `${(usage.data.totals.avgLatencyMs / 1000).toFixed(1)} s` },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-border p-3">
                  <s.icon className="size-4 text-muted-foreground" />
                  <p className="mt-2 text-lg font-semibold tabular-nums">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Denní náklady</p>
              <div className="flex h-28 items-end gap-1">
                {usage.data.byDay.map((d) => (
                  <div key={d.day} className="group relative flex-1">
                    <div className="rounded-t bg-gradient-ai opacity-80 transition group-hover:opacity-100" style={{ height: `${Math.max(4, (d.cost / maxCost) * 100)}px` }} />
                    <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] text-background group-hover:block">
                      {d.day.slice(5)} · {d.calls}× · ${d.cost.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Podle typu</p>
                <ul className="space-y-1.5 text-sm">
                  {usage.data.byKind.map((k) => (
                    <li key={k.kind} className="flex justify-between">
                      <span>{KIND_LABELS[k.kind] ?? k.kind}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {k.calls}× · ${k.cost.toFixed(4)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Orientační měsíční náklady (menší model)</p>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border">
                    {[
                      ["Lehký provoz (50–80 zpráv/den)", "2–8 USD"],
                      ["Střední (100–150 zpráv/den + briefingy)", "8–20 USD"],
                      ["Intenzivní (velký objem + tým)", "15–40 USD"],
                    ].map(([a, b]) => (
                      <tr key={a}>
                        <td className="py-1.5 text-muted-foreground">{a}</td>
                        <td className="py-1.5 text-right font-medium">{b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </SettingsSection>
    </>
  );
}
