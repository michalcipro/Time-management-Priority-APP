"use client";
import { useEffect, useState } from "react";
import { BellRing, Copy, KeyRound, RefreshCw, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldHint } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { keys, useProfile, useSaveSettings } from "@/hooks/queries";
import { api, errorMessage } from "@/lib/api-client";
import { ROLE_LABELS } from "@/lib/labels";
import { PRIORITIES } from "@/lib/priority";
import type { NotificationPrefs } from "@/lib/settings";
import type { Role } from "@/generated/prisma/enums";
import { SettingRow, SettingsSection } from "./settings-nav";

export function ProfileForm() {
  const { data } = useProfile();
  const save = useSaveSettings<Record<string, unknown>>("/api/settings/profile", "PATCH", "Profil uložen.");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");

  useEffect(() => {
    if (!data) return;
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate form from loaded profile */
    setName(data.name);
    setTitle(data.title ?? "");
    setPhone(data.phone ?? "");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [data]);

  if (!data) return <Skeleton className="h-80 rounded-xl" />;
  return (
    <>
      <SettingsSection title="Profil" description="Jak vás vidí kolegové v týmu.">
        <div className="mb-5 flex items-center gap-4">
          <Avatar name={data.name} color={data.avatarColor} size="lg" />
          <div>
            <p className="font-semibold">{data.name}</p>
            <p className="text-sm text-muted-foreground">
              {data.email} · {ROLE_LABELS[data.role as Role]}
            </p>
          </div>
        </div>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ name, title: title || null, phone: phone || null });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="p-name">Jméno</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-title">Pozice</Label>
            <Input id="p-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Např. Hypoteční specialista" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-phone">Telefon</Label>
            <Input id="p-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+420 …" />
          </div>
          <div className="flex items-end sm:justify-end">
            <Button type="submit" loading={save.isPending}>
              Uložit profil
            </Button>
          </div>
        </form>
      </SettingsSection>
      <SettingsSection title="Heslo" description="Doporučujeme alespoň 12 znaků a správce hesel.">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ currentPassword, newPassword }, { onSuccess: () => { setCurrent(""); setNew(""); } });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="p-cur">Současné heslo</Label>
            <Input id="p-cur" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-new">Nové heslo</Label>
            <Input id="p-new" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" variant="outline" disabled={!currentPassword || newPassword.length < 8} loading={save.isPending}>
              <KeyRound /> Změnit heslo
            </Button>
          </div>
        </form>
      </SettingsSection>
    </>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function PushControl({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

  async function enable() {
    if (!vapid) return toast.error("Web push není na serveru nakonfigurován (VAPID klíče).");
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Prohlížeč notifikace nepovolil.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid) });
      await api.post("/api/notifications/push", sub.toJSON());
      onChange(true);
      toast.success("Push notifikace zapnuty pro tento prohlížeč");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api.del("/api/notifications/push", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      onChange(false);
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return <span className="text-xs text-muted-foreground">Prohlížeč push nepodporuje</span>;
  return enabled ? (
    <Button size="sm" variant="outline" onClick={disable} loading={busy}>
      Vypnout v tomto prohlížeči
    </Button>
  ) : (
    <Button size="sm" onClick={enable} loading={busy}>
      <BellRing /> Povolit push
    </Button>
  );
}

const EVENT_LABELS: { key: keyof NotificationPrefs["events"]; label: string; description: string }[] = [
  { key: "taskAssigned", label: "Přiřazení úkolu", description: "Někdo vám přidělil úkol nebo zprávu." },
  { key: "comments", label: "Komentáře", description: "Nový komentář u vašeho úkolu." },
  { key: "statusChanges", label: "Změny stavu", description: "Poradce změnil stav úkolu." },
  { key: "escalations", label: "Eskalace priority", description: "Priorita se automaticky zvýšila nebo přišla urgentní zpráva." },
  { key: "deadlines", label: "Termíny", description: "Blížící se a zmeškané termíny." },
  { key: "waitingMessages", label: "Čekající zprávy", description: "Klient čeká na odpověď příliš dlouho." },
];

export function NotificationsForm() {
  const qc = useQueryClient();
  const { data } = useProfile();
  const save = useSaveSettings<Partial<NotificationPrefs>>("/api/settings/notifications", "PUT", "Nastavení notifikací uloženo.");
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate form from loaded profile
    if (data) setPrefs(data.notificationPrefs);
  }, [data]);

  if (!prefs || !data) return <Skeleton className="h-96 rounded-xl" />;
  const set = <K extends keyof NotificationPrefs>(k: K, v: NotificationPrefs[K]) => setPrefs({ ...prefs, [k]: v });
  const icsUrl = data.icsToken ? `${window.location.origin}/api/ics/${data.icsToken}` : null;

  return (
    <>
      <SettingsSection
        title="Kanály"
        description="Kde chcete dostávat upozornění."
        actions={
          <Button size="sm" onClick={() => save.mutate(prefs)} loading={save.isPending}>
            Uložit změny
          </Button>
        }
      >
        <div className="divide-y divide-border">
          <SettingRow title="Vyskakovací upozornění v aplikaci" description="Okamžité toasty při nové události (centrum upozornění funguje vždy).">
            <Switch checked={prefs.inApp} onCheckedChange={(v) => set("inApp", v)} />
          </SettingRow>
          <SettingRow title="E-mail" description="Souhrn důležitých událostí do vaší schránky.">
            <div className="flex items-center gap-3">
              <Select value={String(prefs.emailMinPriority)} onValueChange={(v) => set("emailMinPriority", Number(v))}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.level} value={String(p.level)}>
                      od {p.code} a výš
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Switch checked={prefs.email} onCheckedChange={(v) => set("email", v)} />
            </div>
          </SettingRow>
          <SettingRow title="Web push" description="Notifikace v prohlížeči i když aplikaci nemáte otevřenou.">
            <div className="flex items-center gap-3">
              <Select value={String(prefs.pushMinPriority)} onValueChange={(v) => set("pushMinPriority", Number(v))}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.level} value={String(p.level)}>
                      od {p.code} a výš
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <PushControl
                enabled={prefs.push}
                onChange={(v) => {
                  set("push", v);
                  void qc.invalidateQueries({ queryKey: keys.profile });
                }}
              />
            </div>
          </SettingRow>
          <SettingRow title="Ranní briefing e-mailem" description="AI briefing ve chvíli, kdy je vygenerován.">
            <Switch checked={prefs.dailyBriefingEmail} onCheckedChange={(v) => set("dailyBriefingEmail", v)} />
          </SettingRow>
        </div>
      </SettingsSection>

      <SettingsSection title="Klidové hodiny" description="V tuto dobu se e-maily ani push neposílají – doručí se po skončení klidových hodin.">
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={prefs.quietHoursEnabled} onCheckedChange={(v) => set("quietHoursEnabled", v)} /> Zapnuto
          </label>
          <div className="flex items-center gap-2 text-sm">
            od <Input type="time" value={prefs.quietStart} onChange={(e) => set("quietStart", e.target.value)} className="h-8 w-28 dark:[color-scheme:dark]" disabled={!prefs.quietHoursEnabled} />
            do <Input type="time" value={prefs.quietEnd} onChange={(e) => set("quietEnd", e.target.value)} className="h-8 w-28 dark:[color-scheme:dark]" disabled={!prefs.quietHoursEnabled} />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Události" description="O čem chcete být informováni.">
        <div className="divide-y divide-border">
          {EVENT_LABELS.map((e) => (
            <SettingRow key={e.key} title={e.label} description={e.description}>
              <Switch checked={prefs.events[e.key]} onCheckedChange={(v) => set("events", { ...prefs.events, [e.key]: v })} />
            </SettingRow>
          ))}
        </div>
      </SettingsSection>

      {icsUrl && (
        <SettingsSection title="Kalendář (ICS odběr)" description="Termíny úkolů a události v Apple Kalendáři, Outlooku nebo Google Kalendáři.">
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input readOnly value={icsUrl} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(icsUrl);
                  toast.success("Odkaz zkopírován");
                }}
              >
                <Copy /> Kopírovat
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  await api.post("/api/settings/ics");
                  await qc.invalidateQueries({ queryKey: keys.profile });
                  toast.success("Vygenerován nový odkaz – starý přestal platit");
                }}
              >
                <RefreshCw /> Nový odkaz
              </Button>
            </div>
            <FieldHint className="flex items-center gap-1.5">
              <Smartphone className="size-3.5" /> iPhone: Nastavení → Kalendář → Účty → Přidat účet → Jiný → Přidat odebíraný kalendář.
            </FieldHint>
          </div>
        </SettingsSection>
      )}
    </>
  );
}
