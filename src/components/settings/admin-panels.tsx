"use client";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eraser, Pencil, ShieldAlert, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldHint } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar } from "@/components/ui/avatar";
import { useSessionUser } from "@/components/layout/session-context";
import { keys } from "@/hooks/queries";
import { api, errorMessage } from "@/lib/api-client";
import { formatDateTime, timeAgo } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/labels";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { Role } from "@/generated/prisma/enums";
import { SettingsSection } from "./settings-nav";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string | null;
  phone: string | null;
  capacity: number;
  isActive: boolean;
  avatarColor: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

function UserDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (o: boolean) => void; user: AdminUser | null }) {
  const me = useSessionUser();
  const qc = useQueryClient();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "ADVISOR");
  const [title, setTitle] = useState(user?.title ?? "");
  const [capacity, setCapacity] = useState(user?.capacity ?? 10);
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(user?.isActive ?? true);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (user) {
        await api.patch(`/api/users/${user.id}`, { name, role, title: title || null, capacity, isActive: active, ...(password ? { password } : {}) });
        toast.success("Uživatel upraven");
      } else {
        await api.post("/api/users", { name, email, role, title: title || null, capacity, password });
        toast.success("Uživatel vytvořen", { description: "Předejte mu přihlašovací údaje bezpečnou cestou." });
      }
      await qc.invalidateQueries({ queryKey: keys.users });
      await qc.invalidateQueries({ queryKey: keys.members });
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{user ? "Upravit uživatele" : "Nový uživatel"}</DialogTitle>
            <DialogDescription>{user ? user.email : "Poradce se přihlásí e-mailem a heslem (nebo přes SSO, pokud je zapnuté)."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 p-6 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Jméno</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            {!user && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>E-mail</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADVISOR">Poradce</SelectItem>
                  {me.role === "DIRECTOR" && <SelectItem value="DIRECTOR">Ředitel</SelectItem>}
                  <SelectItem value="ADMIN">Administrátor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Kapacita (úkolů)</Label>
              <Input type="number" min={1} max={100} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Pozice</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Např. Investiční poradce" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{user ? "Nové heslo (nepovinné)" : "Úvodní heslo"}</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={user ? undefined : 8} required={!user} autoComplete="new-password" />
            </div>
            {user && user.id !== me.id && (
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Switch checked={active} onCheckedChange={setActive} /> Aktivní účet {!active && <span className="text-xs text-muted-foreground">(nemůže se přihlásit, data zůstávají)</span>}
              </label>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Zrušit
            </Button>
            <Button type="submit" loading={busy}>
              {user ? "Uložit" : "Vytvořit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UsersAdmin() {
  const users = useQuery({ queryKey: keys.users, queryFn: () => api.get<AdminUser[]>("/api/users") });
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <SettingsSection
      title="Uživatelé týmu"
      description="Role určují přístup: ředitel vidí vše, poradce jen své úkoly a relevantní zprávy, administrátor spravuje systém bez přístupu ke klientské komunikaci."
      actions={
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <UserPlus /> Přidat uživatele
        </Button>
      }
    >
      {users.isLoading || !users.data ? (
        <Skeleton className="h-48" />
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-2.5">Uživatel</th>
                <th className="px-3 py-2.5">Role</th>
                <th className="px-3 py-2.5">Kapacita</th>
                <th className="px-3 py-2.5">Poslední přihlášení</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {users.data.map((u) => (
                <tr key={u.id} className={cn("border-b border-border/70 last:border-0", !u.isActive && "opacity-55")}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} color={u.avatarColor} size="sm" />
                      <div>
                        <p className="font-medium">
                          {u.name} {!u.isActive && <span className="ml-1 rounded bg-muted px-1.5 py-px text-[10px] font-medium">neaktivní</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {u.email}
                          {u.title ? ` · ${u.title}` : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", u.role === "DIRECTOR" ? "bg-primary/10 text-primary" : u.role === "ADMIN" ? "bg-p4-soft text-p4" : "bg-muted text-foreground/80")}>
                      {ROLE_LABELS[u.role]}
                    </span>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{u.capacity}</td>
                  <td className="px-3 py-3 text-muted-foreground">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : "nikdy"}</td>
                  <td className="pr-4">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        setEditing(u);
                        setOpen(true);
                      }}
                      aria-label="Upravit"
                    >
                      <Pencil />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <UserDialog key={editing?.id ?? "new" + String(open)} open={open} onOpenChange={setOpen} user={editing} />
    </SettingsSection>
  );
}

export function PrivacyPanel() {
  const user = useSessionUser();
  const [contact, setContact] = useState("");
  const [preview, setPreview] = useState<{ messages: number; linkedTasks: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState("");

  async function check() {
    setBusy(true);
    try {
      setPreview(await api.post("/api/gdpr/erase-contact", { contact }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function erase() {
    if (!confirm(`Nevratně smazat ${preview?.messages ?? 0} zpráv kontaktu ${contact}?`)) return;
    setBusy(true);
    try {
      const res = await api.post<{ messages: number }>("/api/gdpr/erase-contact", { contact, confirm: true });
      toast.success(`Smazáno ${res.messages} zpráv`);
      setPreview(null);
      setContact("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SettingsSection title="Export mých dat" description="Strojově čitelný export vašich osobních údajů (čl. 15 a 20 GDPR): profil, úkoly, komentáře, notifikace, zprávy a konverzace s AI.">
        <Button variant="outline" asChild>
          <a href="/api/gdpr/export">
            <Download /> Stáhnout export (JSON)
          </a>
        </Button>
      </SettingsSection>

      {can(user.role, "privacy:erase-contact") && (
        <SettingsSection title="Výmaz údajů klienta" description="Právo být zapomenut: odstraní veškerou komunikaci s daným e-mailem nebo telefonním číslem. Navázané úkoly zůstanou bez osobních údajů.">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={contact} onChange={(e) => { setContact(e.target.value); setPreview(null); }} placeholder="klient@email.cz nebo +420…" className="sm:max-w-sm" />
            <Button variant="outline" onClick={check} loading={busy} disabled={contact.trim().length < 5}>
              <Eraser /> Zjistit rozsah
            </Button>
          </div>
          {preview && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-p1-border bg-p1-soft p-3 text-sm">
              <ShieldAlert className="size-4 text-p1" />
              Nalezeno <b>{preview.messages}</b> zpráv a <b>{preview.linkedTasks}</b> navázaných úkolů.
              <Button size="sm" variant="destructive" className="ml-auto" onClick={erase} disabled={preview.messages === 0} loading={busy}>
                Nevratně smazat
              </Button>
            </div>
          )}
          <FieldHint className="mt-2">Akce se zapisuje do audit logu (bez uložení samotného kontaktu).</FieldHint>
        </SettingsSection>
      )}

      <SettingsSection title="Smazat můj účet" description="Osobní údaje budou smazány nebo anonymizovány. Firemní záznamy (úkoly, komunikace s klienty) zůstanou firmě bez vazby na vaši osobu.">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} placeholder='Pro potvrzení napište „SMAZAT“' className="sm:max-w-xs" />
          <Button
            variant="destructive"
            disabled={confirmDelete !== "SMAZAT"}
            onClick={async () => {
              try {
                await api.del("/api/gdpr/account");
                toast.success("Účet byl smazán");
                await signOut({ callbackUrl: "/login" });
              } catch (err) {
                toast.error(errorMessage(err));
              }
            }}
          >
            <Trash2 /> Smazat účet
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title="Jak chráníme data" description="Technická a organizační opatření.">
        <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <li>• Přístupové údaje integrací šifrované AES-256-GCM</li>
          <li>• Řízení přístupu na úrovni databáze (PostgreSQL RLS), API i UI</li>
          <li>• Audit log důležitých akcí, rate limiting, ochrana proti CSRF</li>
          <li>• AI nic neodesílá samo; vstupy do AI jen v rozsahu vašich oprávnění</li>
        </ul>
      </SettingsSection>
    </>
  );
}

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Přihlášení",
  "auth.login_failed": "Neúspěšné přihlášení",
  "auth.password_change": "Změna hesla",
  "task.assign": "Přiřazení úkolu",
  "task.delete": "Smazání úkolu",
  "task.priority.override": "Ruční změna priority",
  "task.escalate_to_director": "Žádost o pomoc",
  "message.reply": "Odpověď klientovi",
  "message.assign": "Přiřazení zprávy",
  "message.priority.override": "Priorita zprávy",
  "integration.connect": "Připojení integrace",
  "integration.disconnect": "Odpojení integrace",
  "user.create": "Nový uživatel",
  "user.update": "Úprava uživatele",
  "settings.priority_rules.update": "Pravidla priorit",
  "settings.ai.update": "Nastavení AI",
  "gdpr.export": "Export dat",
  "gdpr.account_erased": "Smazání účtu",
  "gdpr.contact_erased": "Výmaz údajů klienta",
};

export function AuditLog() {
  const q = useQuery({
    queryKey: keys.audit,
    queryFn: () => api.get<{ items: { id: string; action: string; entityType: string | null; metadata: unknown; ip: string | null; createdAt: string; actor: { name: string; role: Role } | null }[] }>("/api/audit?limit=150"),
  });
  return (
    <SettingsSection title="Audit log" description="Záznam bezpečnostně důležitých akcí (přihlášení, přiřazení, změny priorit, integrace, GDPR).">
      {q.isLoading || !q.data ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-2.5">Čas</th>
                <th className="px-3 py-2.5">Uživatel</th>
                <th className="px-3 py-2.5">Akce</th>
                <th className="px-3 py-2.5">Detail</th>
              </tr>
            </thead>
            <tbody>
              {q.data.items.map((a) => (
                <tr key={a.id} className="border-b border-border/70 last:border-0">
                  <td className="whitespace-nowrap px-5 py-2.5 tabular-nums text-muted-foreground">{formatDateTime(a.createdAt)}</td>
                  <td className="px-3 py-2.5">{a.actor?.name ?? "systém"}</td>
                  <td className="px-3 py-2.5 font-medium">{ACTION_LABELS[a.action] ?? a.action}</td>
                  <td className="max-w-xs truncate px-3 py-2.5 font-mono text-[11px] text-muted-foreground">{a.metadata ? JSON.stringify(a.metadata) : a.entityType ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SettingsSection>
  );
}
