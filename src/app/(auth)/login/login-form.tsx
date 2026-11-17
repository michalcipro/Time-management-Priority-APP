"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, Flame, Inbox, Lock, Mail, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Logo } from "@/components/layout/logo";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const DEMO = [
  { email: "martin.prochazka@priority-agent.test", name: "Martin Procházka", role: "Ředitel", color: "#2563eb" },
  { email: "anna.novakova@priority-agent.test", name: "Anna Nováková", role: "Poradkyně", color: "#db2777" },
  { email: "jan.novak@priority-agent.test", name: "Jan Novák", role: "Daňový poradce", color: "#7c3aed" },
  { email: "petr.svoboda@priority-agent.test", name: "Petr Svoboda", role: "Hypoteční specialista", color: "#0891b2" },
  { email: "admin@priority-agent.test", name: "Lucie Králová", role: "Administrátor", color: "#059669" },
];

const ERRORS: Record<string, string> = {
  CredentialsSignin: "Neplatný e-mail nebo heslo.",
  rate_limited: "Příliš mnoho pokusů o přihlášení. Zkuste to za několik minut.",
  AccessDenied: "Tento účet nemá přístup. Požádejte administrátora o pozvánku.",
  Configuration: "Přihlášení se nezdařilo. Zkontrolujte konfiguraci serveru.",
};

export function LoginForm({ demo, sso, error, callbackUrl }: { demo: boolean; sso: { google: boolean; microsoft: boolean }; error: string | null; callbackUrl: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(error ? ERRORS[error] ?? "Přihlášení se nezdařilo." : null);

  async function login(e?: React.FormEvent, override?: { email: string; password: string }) {
    e?.preventDefault();
    setBusy(true);
    setMessage(null);
    const creds = override ?? { email, password };
    const res = await signIn("credentials", { ...creds, redirect: false });
    if (!res || res.error) {
      setBusy(false);
      setMessage(ERRORS[res?.code ?? ""] ?? ERRORS[res?.error ?? ""] ?? "Neplatný e-mail nebo heslo.");
      return;
    }
    router.replace(callbackUrl ?? "/");
    router.refresh();
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#0b1b4d] via-[#14307e] to-[#2563eb] p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-[28rem] rounded-full bg-violet-500/25 blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
            <ShieldCheck className="size-5" />
          </span>
          <span className="text-lg font-bold tracking-tight">Priority Agent</span>
        </div>
        <div className="relative mt-auto max-w-lg space-y-8">
          <motion.h2 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="text-4xl font-semibold leading-tight tracking-tight">
            Vše na jednom místě. Jasné priority. Tým, který nic nezapomene.
          </motion.h2>
          <ul className="space-y-4 text-[15px] text-blue-50/90">
            {[
              { icon: Inbox, text: "E-maily, WhatsApp i SMS v jednom inboxu" },
              { icon: Flame, text: "Priority P1–P5, které se samy zvyšují s blížícím se termínem" },
              { icon: Users, text: "Přidělování úkolů poradcům jedním kliknutím" },
              { icon: Sparkles, text: "AI shrnutí, návrhy odpovědí a ranní briefing – nic neodesílá sama" },
            ].map(({ icon: Icon, text }, i) => (
              <motion.li key={text} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.08 }} className="flex items-center gap-3">
                <span className="inline-flex size-8 items-center justify-center rounded-lg bg-white/12 ring-1 ring-white/20">
                  <Icon className="size-4" />
                </span>
                {text}
              </motion.li>
            ))}
          </ul>
        </div>
        <p className="relative mt-10 text-xs text-blue-100/60">© {new Date().getFullYear()} Priority Agent · finanční poradenství</p>
      </div>

      <div className="relative flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="w-full max-w-sm space-y-7">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Přihlášení</h1>
            <p className="text-sm text-muted-foreground">Vítejte zpět. Přihlaste se ke svému pracovnímu účtu.</p>
          </div>

          <form onSubmit={login} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-10 pl-9" placeholder="jmeno@firma.cz" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Heslo</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-10 pl-9" placeholder="••••••••" />
              </div>
            </div>
            {message && <p className="rounded-lg border border-p1-border bg-p1-soft px-3 py-2 text-sm text-p1">{message}</p>}
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              Přihlásit se {!busy && <ArrowRight />}
            </Button>
          </form>

          {(sso.google || sso.microsoft) && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> nebo <span className="h-px flex-1 bg-border" />
              </div>
              <div className="grid gap-2">
                {sso.google && (
                  <Button variant="outline" onClick={() => signIn("google", { callbackUrl: callbackUrl ?? "/" })}>
                    Pokračovat přes Google
                  </Button>
                )}
                {sso.microsoft && (
                  <Button variant="outline" onClick={() => signIn("microsoft-entra-id", { callbackUrl: callbackUrl ?? "/" })}>
                    Pokračovat přes Microsoft 365
                  </Button>
                )}
              </div>
            </div>
          )}

          {demo && (
            <div className="space-y-3 rounded-2xl border border-dashed border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Demo účty</p>
                <p className="text-xs text-muted-foreground">heslo: demo1234</p>
              </div>
              <div className="grid gap-1.5">
                {DEMO.map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEmail(d.email);
                      setPassword("demo1234");
                      void login(undefined, { email: d.email, password: "demo1234" });
                    }}
                    className="flex items-center gap-3 rounded-xl bg-card px-3 py-2 text-left shadow-xs ring-1 ring-border transition hover:ring-primary/40 disabled:opacity-60"
                  >
                    <Avatar name={d.name} color={d.color} size="sm" />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block text-[13px] font-medium">{d.name}</span>
                      <span className="block text-[11.5px] text-muted-foreground">{d.role}</span>
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
