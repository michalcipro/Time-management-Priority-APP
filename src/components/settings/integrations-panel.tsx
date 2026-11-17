"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, ExternalLink, Mail, MessageCircle, RefreshCw, Smartphone, TriangleAlert, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldHint } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSessionUser } from "@/components/layout/session-context";
import { keys, useIntegrations } from "@/hooks/queries";
import { api, errorMessage } from "@/lib/api-client";
import { can } from "@/lib/permissions";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { IntegrationDTO } from "@/lib/dto";
import { SettingsSection } from "./settings-nav";

function StatusBadge({ integration }: { integration?: IntegrationDTO }) {
  if (!integration || integration.status === "DISCONNECTED") return <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Nepřipojeno</span>;
  const map = {
    ACTIVE: "bg-p4-soft text-p4",
    PENDING: "bg-p3-soft text-p3-text",
    ERROR: "bg-p1-soft text-p1",
    DISCONNECTED: "bg-muted text-muted-foreground",
  } as const;
  const label = { ACTIVE: "Aktivní", PENDING: "Čeká na dokončení", ERROR: "Chyba", DISCONNECTED: "Nepřipojeno" }[integration.status];
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", map[integration.status])}>{label}</span>;
}

function CopyField({ value, mono = true }: { value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className={cn("text-xs", mono && "font-mono")} />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          toast.success("Zkopírováno");
        }}
        aria-label="Kopírovat"
      >
        <Copy />
      </Button>
    </div>
  );
}

function useIntegrationActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: keys.integrations });
  return {
    refresh,
    sync: async (id: string) => {
      try {
        const res = await api.post<{ created: number; error?: string }>(`/api/integrations/${id}/sync`);
        if (res.error) toast.error(res.error);
        else toast.success(res.created ? `Načteno ${res.created} nových zpráv` : "Žádné nové zprávy");
        await refresh();
        await qc.invalidateQueries({ queryKey: ["messages"] });
      } catch (err) {
        toast.error(errorMessage(err));
      }
    },
    disconnect: async (id: string) => {
      if (!confirm("Opravdu odpojit? Uložené přístupové údaje budou smazány.")) return;
      await api.del(`/api/integrations/${id}`);
      toast.success("Odpojeno");
      await refresh();
    },
  };
}

function MailboxCard({ type, integration, available }: { type: "GOOGLE" | "MICROSOFT"; integration?: IntegrationDTO; available: boolean }) {
  const actions = useIntegrationActions();
  const [busy, setBusy] = useState(false);
  const connected = integration && integration.status !== "DISCONNECTED";
  const name = type === "GOOGLE" ? "Gmail + Google Kalendář" : "Outlook + kalendář (Microsoft 365)";
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border p-4 sm:flex-row sm:items-center">
      <span className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-xl", type === "GOOGLE" ? "bg-red-500/10 text-red-600" : "bg-sky-500/10 text-sky-600")}>
        <Mail className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{name}</p>
          <StatusBadge integration={integration} />
        </div>
        {connected ? (
          <p className="text-sm text-muted-foreground">
            {integration!.displayName} · {integration!.lastSyncAt ? `synchronizováno ${timeAgo(integration!.lastSyncAt)}` : "čeká na první synchronizaci"}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Načítání doručené pošty (OAuth, jen čtení + odesílání schválených odpovědí) a kalendáře.</p>
        )}
        {integration?.lastError && (
          <p className="mt-1 flex items-center gap-1 text-xs text-p1">
            <TriangleAlert className="size-3.5" /> {integration.lastError}
          </p>
        )}
        {!available && <p className="mt-1 text-xs text-muted-foreground">Administrátor musí nastavit {type === "GOOGLE" ? "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" : "MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET"}.</p>}
      </div>
      <div className="flex gap-2">
        {connected ? (
          <>
            <Button size="sm" variant="outline" loading={busy} onClick={async () => { setBusy(true); await actions.sync(integration!.id); setBusy(false); }}>
              {!busy && <RefreshCw />} Synchronizovat
            </Button>
            <Button size="sm" variant="ghost" onClick={() => actions.disconnect(integration!.id)}>
              <Unplug /> Odpojit
            </Button>
          </>
        ) : (
          <Button size="sm" disabled={!available} asChild={available}>
            {available ? <a href={`/api/integrations/${type === "GOOGLE" ? "google" : "microsoft"}/connect`}>Připojit účet</a> : <span>Připojit účet</span>}
          </Button>
        )}
      </div>
    </div>
  );
}

function SmsCard({ integration }: { integration?: IntegrationDTO }) {
  const actions = useIntegrationActions();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shownToken = token ?? integration?.webhookToken ?? null;
  const url = integration?.webhookUrl ?? (typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/sms` : "/api/webhooks/sms");

  async function create() {
    setBusy(true);
    try {
      const res = await api.post<{ token: string }>("/api/integrations/sms");
      setToken(res.token);
      toast.success(integration ? "Token vyměněn – aktualizujte zkratku v telefonu" : "Webhook vytvořen");
      await actions.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600">
          <Smartphone className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">SMS a iMessage (Apple Zkratky)</p>
            <StatusBadge integration={integration} />
          </div>
          <p className="text-sm text-muted-foreground">
            {integration?.lastSyncAt ? `Poslední zpráva ${timeAgo(integration.lastSyncAt)}` : "Přeposílání zpráv z iPhonu přes automatizaci Zkratek, nebo Twilio pro firemní číslo."}
          </p>
        </div>
        <Button size="sm" variant={integration ? "outline" : "default"} onClick={create} loading={busy}>
          {integration ? "Vyměnit token" : "Vytvořit webhook"}
        </Button>
      </div>
      {shownToken && (
        <div className="grid gap-3 rounded-lg bg-muted/40 p-3 lg:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Webhook URL</Label>
            <CopyField value={url} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Token (hlavička Authorization: Bearer …)</Label>
            <CopyField value={shownToken} />
          </div>
          <div className="space-y-2 lg:col-span-2">
            <p className="text-xs font-semibold">Nastavení na iPhonu (Zkratky → Automatizace → Zpráva):</p>
            <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
              <li>Vytvořte osobní automatizaci „Když dostanu zprávu“ (od vybraných kontaktů nebo obsahující text) a zvolte „Spustit okamžitě“.</li>
              <li>Přidejte akci „Získat obsah URL“: metoda POST, URL výše, hlavička Authorization = Bearer + token.</li>
              <li>Tělo požadavku JSON: from = Odesílatel, fromName = jméno kontaktu, text = Obsah zprávy, channel = „imessage“ nebo „sms“.</li>
            </ol>
            <pre className="overflow-x-auto rounded-lg bg-card p-3 text-[11px] leading-relaxed ring-1 ring-border">{`curl -X POST ${url} \\
  -H "Authorization: Bearer ${shownToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"from":"+420777123456","fromName":"Jana Malá","text":"Dobrý den…","channel":"sms"}'`}</pre>
            <FieldHint>Twilio: nastavte webhook „A message comes in“ na {url}?token=… (podpis X-Twilio-Signature se ověřuje pomocí TWILIO_AUTH_TOKEN).</FieldHint>
          </div>
        </div>
      )}
    </div>
  );
}

function WhatsAppCard({ integration, canManage, verifyTokenSet }: { integration?: IntegrationDTO; canManage: boolean; verifyTokenSet: boolean }) {
  const actions = useIntegrationActions();
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [displayPhone, setDisplayPhone] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [busy, setBusy] = useState(false);
  const url = integration?.webhookUrl ?? (typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/whatsapp` : "");

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate form from loaded integration */
    setPhoneNumberId(String(integration?.config.phoneNumberId ?? ""));
    setDisplayPhone(integration?.displayName ?? "");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [integration]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put("/api/integrations/whatsapp", { phoneNumberId, displayPhone, accessToken: accessToken || undefined });
      setAccessToken("");
      toast.success("WhatsApp uložen");
      await actions.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
          <MessageCircle className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">WhatsApp Business (Cloud API)</p>
            <StatusBadge integration={integration} />
          </div>
          <p className="text-sm text-muted-foreground">Příchozí zprávy přes webhook Meta, odpovědi přes WhatsApp Business API (v rámci 24h okna).</p>
        </div>
      </div>
      <div className="grid gap-3 rounded-lg bg-muted/40 p-3 lg:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Callback URL pro Meta</Label>
          <CopyField value={url} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Verify token</Label>
          <p className={cn("flex h-9 items-center gap-1.5 text-xs", verifyTokenSet ? "text-p4" : "text-p2")}>
            {verifyTokenSet ? <CheckCircle2 className="size-4" /> : <TriangleAlert className="size-4" />}
            {verifyTokenSet ? "Nastaven v proměnné WHATSAPP_VERIFY_TOKEN" : "Nastavte WHATSAPP_VERIFY_TOKEN a WHATSAPP_APP_SECRET"}
          </p>
        </div>
      </div>
      {canManage && (
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Phone number ID</Label>
            <Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="1234567890" required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Číslo (zobrazení)</Label>
            <Input value={displayPhone} onChange={(e) => setDisplayPhone(e.target.value)} placeholder="+420 …" required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Access token {integration?.status === "ACTIVE" && "(uložen)"}</Label>
            <Input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder={integration?.status === "ACTIVE" ? "••••••••  ponechat" : "EAAG…"} />
          </div>
          <div className="flex items-center justify-between sm:col-span-3">
            <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Průvodce WhatsApp Cloud API <ExternalLink className="size-3" />
            </a>
            <Button size="sm" type="submit" loading={busy}>
              Uložit
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function IntegrationsPanel() {
  const user = useSessionUser();
  const params = useSearchParams();
  const { data, isLoading } = useIntegrations();

  useEffect(() => {
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) toast.success(connected === "google" ? "Google účet připojen – stahuji zprávy" : "Microsoft účet připojen – stahuji zprávy");
    if (error) toast.error(`Připojení se nezdařilo (${error})`);
  }, [params]);

  if (isLoading || !data) return <Skeleton className="h-96 rounded-xl" />;
  const mine = (type: string) => data.integrations.find((i) => i.type === type && i.owner?.id === user.id);
  const team = (type: string) => data.integrations.find((i) => i.type === type);

  return (
    <>
      <SettingsSection title="E-mail a kalendář" description="Připojte svou schránku – zprávy se sjednotí v Inboxu a AI je zpracuje. Nic se neodesílá bez vašeho schválení.">
        <div className="space-y-3">
          <MailboxCard type="GOOGLE" integration={mine("GOOGLE")} available={data.available.google} />
          <MailboxCard type="MICROSOFT" integration={mine("MICROSOFT")} available={data.available.microsoft} />
        </div>
      </SettingsSection>
      <SettingsSection title="Zprávy z telefonu" description="WhatsApp, SMS a iMessage se normalizují do stejného formátu jako e-maily.">
        <div className="space-y-3">
          <WhatsAppCard integration={team("WHATSAPP")} canManage={can(user.role, "integrations:manage:team")} verifyTokenSet={data.whatsappVerifyTokenSet} />
          <SmsCard integration={mine("SMS")} />
        </div>
      </SettingsSection>
      {can(user.role, "integrations:manage:team") && data.integrations.some((i) => i.owner && i.owner.id !== user.id) && (
        <SettingsSection title="Integrace týmu" description="Přehled připojených účtů všech členů týmu.">
          <ul className="divide-y divide-border">
            {data.integrations
              .filter((i) => i.owner && i.owner.id !== user.id)
              .map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span>
                    <span className="font-medium">{i.owner?.name}</span> · {i.type} {i.displayName ? `· ${i.displayName}` : ""}
                  </span>
                  <StatusBadge integration={i} />
                </li>
              ))}
          </ul>
        </SettingsSection>
      )}
    </>
  );
}
