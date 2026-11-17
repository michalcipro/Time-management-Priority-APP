# Nasazení na Vercel + Neon

Návod pro nasazení Priority Agenta na trvalou adresu (např. `https://priority-agent.vercel.app`).
Aplikace poběží na [Vercelu](https://vercel.com), data budou v databázi PostgreSQL od [Neonu](https://neon.tech)
v regionu Frankfurt. Vývojářské znalosti nejsou potřeba, jen účet na GitHubu s přístupem k tomuto repozitáři.
Celé nasazení trvá zhruba 15 minut.

Při každém nasazení se automaticky vytvoří a aktualizují tabulky, založí se omezená databázová role
`priority_app`, při prvním nasazení se nahrají demo data a ověří se, že databáze vynucuje oprávnění
na úrovni řádků (Row-Level Security). Když něco z toho nesedí, nasazení se zastaví s vysvětlením
(viz [Řešení problémů](#řešení-problémů)).

> **Tarify.** Na vyzkoušení stačí Vercel **Hobby** a Neon **Free**. Tarif Hobby je podle podmínek Vercelu
> jen pro osobní nekomerční použití, pro provoz ve firmě počítejte s tarifem **Pro**.

## Co budete potřebovat

* Účet na GitHubu, který vidí tento repozitář.
* Blok proměnných prostředí s náhodně vygenerovanými tajnými klíči. Vypadá takto:

  ```
  AUTH_SECRET=…
  ENCRYPTION_KEY=…
  CRON_SECRET=…
  APP_DB_PASSWORD=…
  NEXT_PUBLIC_VAPID_PUBLIC_KEY=…
  VAPID_PRIVATE_KEY=…
  DEMO_MODE=true
  SEED_DEMO_DATA=true
  ```

  Pokud ho nemáte připravený, vygeneruje ho vývojář příkazem `npm run deploy:env`.
  Klíče nikam nezveřejňujte a neukládejte do repozitáře. Uložte si je do správce hesel:
  `ENCRYPTION_KEY` šifruje přístupy k připojeným schránkám a po jeho ztrátě je nepůjde přečíst.

## Postup

### 1. Účet na Vercelu

1. Otevřete [vercel.com/signup](https://vercel.com/signup) a zvolte **Continue with GitHub**.
2. Přihlaste se účtem, který má přístup k repozitáři, a dokončete registraci (tarif Hobby nebo Pro).

### 2. Import projektu

1. Na nástěnce Vercelu klikněte na **Add New… → Project**.
2. V seznamu **Import Git Repository** najděte repozitář **Time-management-Priority-APP** a klikněte na **Import**.
   Pokud ho nevidíte, klikněte na **Adjust GitHub App Permissions** a povolte Vercelu přístup k repozitáři.
3. **Project Name** zvolte např. `priority-agent`. Z názvu vznikne adresa `priority-agent.vercel.app`, pokud je volná.
4. **Framework Preset** se nastaví sám na Next.js. Build a Install příkazy neměňte, řídí je soubor `vercel.json`.

Vercel nasazuje výchozí větev repozitáře (`claude/inspiring-euler-g7k1pl`). Každý další push do ní
spustí nové nasazení.

### 3. Proměnné prostředí

1. Ve stejném formuláři rozbalte **Environment Variables**.
2. Klikněte do prvního pole **Key** a vložte celý připravený blok (Ctrl+V / ⌘V).
   Vercel ho sám rozdělí na jednotlivé proměnné.
3. Zkontrolujte, že je jich osm a žádná nemá prázdnou hodnotu.

### 4. První nasazení

Klikněte na **Deploy**. První build skončí chybou **„Databáze není připojená / No database is connected“**.
To je v pořádku, databázi přidáte v dalším kroku.

### 5. Databáze Neon

1. V projektu otevřete záložku **Storage** a klikněte na **Create Database**.
2. Vyberte **Neon** (Serverless Postgres) a pokračujte tlačítkem **Continue**.
3. Region zvolte **Frankfurt, Germany (eu-central-1)**, tarif Free a databázi pojmenujte např. `priority-agent-db`.
   Funkce aplikace běží ve Frankfurtu také (`vercel.json`), takže databáze bude nejblíž.
4. Po vytvoření databáze ji připojte k projektu (**Connect Project**). Nechte zaškrtnutá všechna prostředí
   a pole **Custom Prefix** nechte **prázdné**. Aplikace hledá proměnné `DATABASE_URL` a `DATABASE_URL_UNPOOLED`
   přesně pod těmito názvy.

### 6. Opakované nasazení

1. Otevřete záložku **Deployments**.
2. U posledního nasazení otevřete nabídku **…** a zvolte **Redeploy** a znovu **Redeploy**.
3. Build trvá 2–4 minuty. V logu uvidíte řádky `[db-setup]`: migrace, založení role `priority_app`,
   nahrání demo dat a nakonec `Row-Level Security enforced on 13 tables ✔`.

### 7. Hotovo

Klikněte na **Visit** nebo otevřete adresu projektu (např. `https://priority-agent.vercel.app`).
Na přihlašovací stránce stačí kliknout na jméno demo účtu. Ručně se přihlásíte e-mailem a heslem `demo1234`:

| Účet | E-mail |
|---|---|
| Ředitel | `martin.prochazka@priority-agent.test` |
| Poradkyně | `anna.novakova@priority-agent.test` |
| Poradci | `jan.novak@priority-agent.test`, `petr.svoboda@priority-agent.test` |
| Administrátorka | `admin@priority-agent.test` |

Demo data se nahrají jen do prázdné databáze. Další nasazení vaše data nepřepíšou.

## Volitelné doplňky

Každá změna proměnných prostředí se projeví až po novém nasazení (**Deployments → … → Redeploy**).

### Plánované úlohy (eskalace priorit, upozornění, briefingy)

Na tarifu Hobby povoluje Vercel naplánované úlohy jen jednou denně. `vercel.json` proto spouští
přepočet priorit v 5:00 UTC a ranní briefing v 6:00 UTC. Briefing se navíc vytvoří při první denní návštěvě stránky AI asistent.

Pro průběžnou eskalaci (každých 30 minut) je v repozitáři připravený workflow GitHub Actions
`.github/workflows/cron.yml`. Zapnete ho takto:

1. Na GitHubu otevřete repozitář → **Settings → Secrets and variables → Actions**.
2. Přidejte **New repository secret** `CRON_SECRET` se stejnou hodnotou jako ve Vercelu.
3. Přidejte secret `APP_URL` s adresou aplikace, např. `https://priority-agent.vercel.app`.
4. V záložce **Actions → Scheduled jobs → Run workflow** ho můžete hned vyzkoušet.

U soukromého repozitáře workflow spotřebuje asi 1 440 minut GitHub Actions měsíčně (bezplatný limit je 2 000).
U veřejného repozitáře je zdarma. Na tarifu Vercel Pro můžete místo toho v `vercel.json` nastavit častější
Vercel Cron, např. `*/15 * * * *`.

### Sdílený Redis (Upstash)

Bez Redisu aplikace funguje: omezení počtu požadavků platí v rámci jedné instance a změny se v prohlížeči
načítají průběžně každých 30–60 sekund. S Redisem je omezení požadavků společné pro všechny instance.

1. **Storage → Create Database → Upstash** (Redis), region Frankfurt, a připojte ji k projektu.
2. V konzoli Upstash zkopírujte adresu ve tvaru `rediss://default:…@….upstash.io:6379` a uložte ji
   do proměnné `REDIS_URL`.

Okamžité doručování událostí přes server-sent events zapnete proměnnou `REALTIME_TRANSPORT=sse` (vyžaduje Redis).
Na Vercelu ale drží otevřená spojení funkce v běhu a na tarifu Hobby rychle vyčerpají limity, proto je
výchozí průběžné načítání (`poll`).

### AI asistent (Claude)

Bez klíče běží AI v offline režimu (pravidla a heuristiky). Pro skutečného asistenta vytvořte klíč na
[console.anthropic.com](https://console.anthropic.com) a uložte ho do `ANTHROPIC_API_KEY`.
Výchozí model můžete změnit proměnnou `AI_DEFAULT_MODEL` (`claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`).

### E-mailová upozornění

Nastavte `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` a `SMTP_FROM` (např. od svého poskytovatele
e-mailu nebo služby jako Postmark či Brevo). Bez nich se e-maily jen zapisují do logu.

### Web push upozornění

Klíče `NEXT_PUBLIC_VAPID_PUBLIC_KEY` a `VAPID_PRIVATE_KEY` jsou už v připraveném bloku.
Volitelně doplňte `VAPID_SUBJECT=mailto:vas@email.cz`.

### Gmail, Outlook a přihlášení přes Google / Microsoft

1. Nastavte `APP_URL` na konečnou adresu aplikace (např. vlastní doménu).
2. V Google Cloud Console a v Microsoft Entra zaregistrujte tyto adresy pro přesměrování:
   * `https://<adresa>/api/integrations/google/callback` a `https://<adresa>/api/auth/callback/google`
   * `https://<adresa>/api/integrations/microsoft/callback` a `https://<adresa>/api/auth/callback/microsoft-entra-id`
3. Doplňte `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`
   a případně `MICROSOFT_TENANT_ID`. Podrobnosti jsou v [README](../README.md#integrace-kanálů).

### Vlastní doména

**Settings → Domains → Add**, zadejte doménu a podle pokynů nastavte DNS u registrátora.
Pak upravte `APP_URL` a adresy pro přesměrování OAuth.

## Přechod do ostrého provozu

1. Přihlaste se jako ředitel nebo administrátor a v **Nastavení → Uživatelé** založte skutečné účty.
2. Demo účtům vypněte přepínač **Aktivní účet** nebo jim změňte heslo. Jinak se do nich dá přihlásit heslem `demo1234`.
3. Ve Vercelu nastavte `DEMO_MODE=false`, smažte proměnnou `SEED_DEMO_DATA` a spusťte Redeploy.
4. Přejděte na tarif Vercel Pro (komerční použití) a zvažte placený tarif Neonu (zálohy, vyšší limity).

Demo zprávy a úkoly v databázi zůstanou. Úplně čistý start (prázdná databáze s jediným účtem ředitele)
zatím vyžaduje vývojáře.

## Řešení problémů

| Hlášení v logu buildu | Co udělat |
|---|---|
| `Databáze není připojená / No database is connected` | Připojte databázi Neon (krok 5) a spusťte Redeploy. V **Settings → Environment Variables** musí být `DATABASE_URL` a `DATABASE_URL_UNPOOLED` bez prefixu. |
| `Row-Level Security would NOT apply…` | Chybí proměnná `APP_DB_PASSWORD`. Doplňte ji (náhodné heslo) a spusťte Redeploy. |
| `Command failed: npx prisma migrate deploy` | Zkontrolujte `DATABASE_URL_UNPOOLED`. Neon po nečinnosti uspává databázi, Redeploy zkuste znovu. |
| `permission denied to create role` | Proměnná `DATABASE_URL` musí patřit vlastníkovi databáze (výchozí role od Neonu). |

Další tipy:

* Chyby za běhu aplikace najdete v projektu na Vercelu v záložce **Logs**.
* Hlášení `Row-Level Security is not enforced…` v Logs znamená, že aplikace běží pod vlastníkem databáze.
  Doplňte `APP_DB_PASSWORD` a spusťte Redeploy.
* Pokud přihlášení hlásí chybu konfigurace, zkontrolujte `AUTH_SECRET`.
* Náhledová nasazení (preview) z jiných větví databázi neupravují. Nastavením `DB_SETUP=always` to změníte.
