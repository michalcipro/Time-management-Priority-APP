/**
 * Demo seed – Czech financial advisory firm.
 *
 *   npm run db:seed
 *
 * Creates a director, three advisors and an administrator (password `demo1234`),
 * realistic multi-channel client communication with pre-generated AI analyses,
 * tasks across all priority levels, escalation history, comments, notifications,
 * calendar events, a morning briefing and AI usage logs.
 *
 * Runs with the owner connection (DIRECT_URL), so Row-Level Security does not apply.
 * All timestamps are relative to "now" so the demo always looks current.
 */
import "dotenv/config";
import { createHash, randomBytes, createCipheriv } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import type { Channel, MessageStatus, Role, TaskStatus } from "../src/generated/prisma/enums";
import {
  computeMessagePriority,
  computeTaskPriority,
  DEFAULT_PRIORITY_RULES,
  type PriorityLevel,
} from "../src/lib/priority";
import { buildSearchText } from "../src/lib/search-text";
import { resolveDatabaseUrls } from "../src/lib/db-config";
import { dayKey, fromLocalDateTime, addDays } from "../src/lib/format";
import { makePreview } from "../src/lib/utils";
import type { AIReplySuggestion, AITaskSuggestion, BriefingContent, BriefingStats } from "../src/lib/ai-types";

const connectionString = resolveDatabaseUrls(process.env).directUrl;
if (!connectionString) throw new Error("DIRECT_URL (or DATABASE_URL_UNPOOLED / DATABASE_URL) must be set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const NOW = new Date();
const MIN = 60_000;
const HOUR = 60 * MIN;

const minutesAgo = (n: number) => new Date(NOW.getTime() - n * MIN);
const hoursAgo = (n: number) => new Date(NOW.getTime() - n * HOUR);
const daysAgo = (n: number, hour = 9, minute = 15) => at(-n, hour, minute);
/** Local (Europe/Prague) wall time `offsetDays` from today. */
function at(offsetDays: number, hour: number, minute = 0): Date {
  const key = dayKey(addDays(NOW, offsetDays));
  return fromLocalDateTime(`${key}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`)!;
}
/** now + h hours, rounded up to the next half hour. */
function inHours(h: number): Date {
  const t = NOW.getTime() + h * HOUR;
  return new Date(Math.ceil(t / (30 * MIN)) * 30 * MIN);
}

function encryptJson(value: unknown): string {
  const raw = process.env.ENCRYPTION_KEY ?? "";
  let key = Buffer.from(raw, "base64");
  if (key.length !== 32) key = createHash("sha256").update(raw).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

const rules = DEFAULT_PRIORITY_RULES;

// ─── People ─────────────────────────────────────────────────────────────────

type PersonKey = "director" | "jan" | "anna" | "petr" | "admin";

const PEOPLE: Record<PersonKey, { name: string; email: string; role: Role; title: string; phone: string; color: string; capacity: number }> = {
  director: {
    name: "Martin Procházka",
    email: "martin.prochazka@priority-agent.test",
    role: "DIRECTOR",
    title: "Ředitel společnosti",
    phone: "+420 602 100 200",
    color: "#2563eb",
    capacity: 20,
  },
  jan: {
    name: "Jan Novák",
    email: "jan.novak@priority-agent.test",
    role: "ADVISOR",
    title: "Senior daňový poradce",
    phone: "+420 603 201 301",
    color: "#7c3aed",
    capacity: 10,
  },
  anna: {
    name: "Anna Nováková",
    email: "anna.novakova@priority-agent.test",
    role: "ADVISOR",
    title: "Finanční poradkyně – investice a pojištění",
    phone: "+420 604 302 402",
    color: "#db2777",
    capacity: 6,
  },
  petr: {
    name: "Petr Svoboda",
    email: "petr.svoboda@priority-agent.test",
    role: "ADVISOR",
    title: "Hypoteční specialista",
    phone: "+420 605 403 503",
    color: "#0891b2",
    capacity: 10,
  },
  admin: {
    name: "Lucie Králová",
    email: "admin@priority-agent.test",
    role: "ADMIN",
    title: "Správa systému",
    phone: "+420 606 504 604",
    color: "#059669",
    capacity: 5,
  },
};

// ─── Messages ───────────────────────────────────────────────────────────────

interface SeedMessage {
  key: string;
  channel: Channel;
  senderName: string;
  senderContact: string;
  subject?: string;
  content: string;
  receivedAt: Date;
  status: MessageStatus;
  base: PriorityLevel;
  owner: PersonKey;
  assignee?: PersonKey;
  starred?: boolean;
  attachments?: { name: string; size: number; mimeType: string }[];
  thread?: { direction: "INBOUND" | "OUTBOUND"; content: string; at: Date; author?: PersonKey }[];
  ai: {
    summary: string;
    intent: string;
    topics: string[];
    sentiment: "positive" | "neutral" | "concerned" | "negative" | "urgent";
    suggestedPriority: PriorityLevel;
    priorityReason: string;
    deadline?: Date | null;
    deadlines?: { date: Date; label: string }[];
    tasks?: { title: string; description?: string; deadline?: Date | null; priority?: PriorityLevel; assignee?: PersonKey }[];
    replies: AIReplySuggestion[];
  };
}

const MESSAGES: SeedMessage[] = [
  {
    key: "novak",
    channel: "EMAIL",
    senderName: "Karel Novák",
    senderContact: "karel.novak@seznam.cz",
    subject: "Hypotéka – podpis smlouvy dnes?",
    content:
      "Dobrý den, pane Procházko,\n\nbanka mi potvrdila, že úvěrová smlouva k hypotéce je připravená k podpisu. Mohl bych se u vás zastavit dnes ve 12:00, abychom ji prošli a podepsali?\n\nJaké doklady mám s sebou přinést? Mám občanský průkaz, potvrzení o příjmu a kupní smlouvu.\n\nA ještě jedna věc – je ještě možné zafixovat sazbu na 5 let místo 3? Četl jsem, že by to teď mohlo být výhodnější.\n\nDěkuji a zdravím\nKarel Novák",
    receivedAt: minutesAgo(95),
    status: "UNREAD",
    base: 1,
    owner: "director",
    starred: true,
    thread: [
      {
        direction: "OUTBOUND",
        author: "director",
        at: daysAgo(2, 16, 40),
        content:
          "Dobrý den, pane Nováku, mám dobrou zprávu – banka Váš hypoteční úvěr schválila. Jakmile bude připravená smlouva, domluvíme termín podpisu. S pozdravem Martin Procházka",
      },
    ],
    ai: {
      summary:
        "Klient chce dnes ve 12:00 podepsat připravenou hypoteční smlouvu a ptá se, jaké doklady přinést. Zvažuje změnu fixace ze 3 na 5 let.",
      intent: "Domluvit podpis hypoteční smlouvy",
      topics: ["hypotéka", "podpis smlouvy", "fixace sazby"],
      sentiment: "positive",
      suggestedPriority: 1,
      priorityReason: "Podpis je navržen na dnešek a klient čeká na potvrzení termínu.",
      deadline: inHours(2.5),
      deadlines: [{ date: inHours(2.5), label: "Navržený podpis smlouvy" }],
      tasks: [
        {
          title: "Potvrdit klientovi podpis smlouvy a seznam dokladů",
          description: "Potvrdit termín, poslat seznam dokladů (OP, potvrzení o příjmu, kupní smlouva).",
          deadline: inHours(1),
          priority: 1,
          assignee: "petr",
        },
        {
          title: "Ověřit u banky možnost fixace na 5 let",
          description: "Zjistit aktuální sazbu pro fixaci 5 let a dopad na splátku.",
          deadline: inHours(2),
          priority: 2,
          assignee: "petr",
        },
      ],
      replies: [
        {
          label: "Potvrdit termín",
          text: "Dobrý den, pane Nováku,\n\npodpis dnes ve 12:00 potvrzuji. Přineste prosím občanský průkaz, potvrzení o příjmu a kupní smlouvu – víc není potřeba. Možnost fixace na 5 let jsem ověřil(a) a projdeme ji spolu před podpisem.\n\nS pozdravem\nMartin Procházka",
        },
        {
          label: "Navrhnout jiný čas",
          text: "Dobrý den, pane Nováku,\n\nděkuji za zprávu. Dnes ve 12:00 bohužel nestihneme, mohu Vám nabídnout 14:30 nebo zítra v 9:00? Doklady stačí OP, potvrzení o příjmu a kupní smlouva.\n\nS pozdravem\nMartin Procházka",
        },
        {
          label: "Stručně",
          text: "Dobrý den, 12:00 platí. Stačí OP, potvrzení o příjmu a kupní smlouva. Fixaci na 5 let probereme na místě. M. Procházka",
        },
      ],
    },
  },
  {
    key: "mala",
    channel: "EMAIL",
    senderName: "Jana Malá",
    senderContact: "jana.mala@gmail.com",
    subject: "Pojistná událost – vytopený byt",
    content:
      "Dobrý den,\n\nv noci nás vytopil soused z horního patra – voda tekla stropem v koupelně a v předsíni. Máme u Vás sjednané pojištění domácnosti i nemovitosti.\n\nCo mám teď dělat? Mám to nahlásit sama na pojišťovnu, nebo to vyřešíte Vy? Potřebuji to vyřešit co nejdřív, zítra má přijít řemeslník.\n\nDěkuji\nJana Malá",
    receivedAt: minutesAgo(42),
    status: "UNREAD",
    base: 1,
    owner: "director",
    ai: {
      summary:
        "Klientku v noci vytopil soused, má u nás pojištění domácnosti i nemovitosti a potřebuje okamžitě pomoci s nahlášením škody.",
      intent: "Nahlášení pojistné události",
      topics: ["pojištění domácnosti", "pojistná událost", "škoda vodou"],
      sentiment: "urgent",
      suggestedPriority: 1,
      priorityReason: "Akutní pojistná událost, klientka potřebuje pokyny ještě dnes (zítra přijde řemeslník).",
      deadline: at(0, 18, 0),
      tasks: [
        {
          title: "Pomoci klientce Malé s nahlášením pojistné události",
          description: "Zavolat klientce, poslat pokyny k fotodokumentaci a nahlásit škodu pojišťovně.",
          deadline: at(0, 18, 0),
          priority: 1,
          assignee: "anna",
        },
      ],
      replies: [
        {
          label: "Okamžité pokyny",
          text: "Dobrý den, paní Malá,\n\nmoc mě to mrzí. Než přijde řemeslník, vše prosím nafoťte (strop, stěny, poškozené věci) a uschovejte případné účtenky. Škodu za Vás dnes nahlásíme pojišťovně – kolegyně Anna Nováková Vám během hodiny zavolá.\n\nS pozdravem\nMartin Procházka",
        },
        {
          label: "Domluvit hovor",
          text: "Dobrý den, paní Malá, v kolik Vám můžeme dnes zavolat? Projdeme spolu, co je potřeba pro nahlášení škody, a vše vyřídíme za Vás.",
        },
      ],
    },
  },
  {
    key: "klein",
    channel: "WHATSAPP",
    senderName: "Robert Klein",
    senderContact: "+420724888301",
    content:
      "Dobrý den, můžete mi prosím poslat ten report za Q2 k mému penzijnímu spoření? Potřebuji ho do banky k žádosti o úvěr. Děkuji, Klein",
    receivedAt: daysAgo(4, 10, 12),
    status: "WAITING_REPLY",
    base: 4,
    owner: "director",
    ai: {
      summary: "Klient žádá o report penzijního spoření za Q2, který potřebuje do banky k žádosti o úvěr.",
      intent: "Žádost o report k penzijnímu spoření",
      topics: ["penzijní spoření", "report", "úvěr"],
      sentiment: "neutral",
      suggestedPriority: 3,
      priorityReason: "Jednoduchý požadavek, ale klient dokument potřebuje pro banku.",
      tasks: [
        {
          title: "Poslat Robertu Kleinovi report penzijního spoření za Q2",
          deadline: daysAgo(1, 17, 0),
          priority: 2,
          assignee: "petr",
        },
      ],
      replies: [
        {
          label: "Poslat report",
          text: "Dobrý den, pane Kleine, omlouvám se za zdržení. Report za Q2 Vám posílám v příloze e-mailem ještě dnes. Kdyby banka potřebovala potvrzení od penzijní společnosti, rád ho zajistím.",
        },
        {
          label: "Upřesnit termín",
          text: "Dobrý den, pane Kleine, report připravujeme. Do kdy ho banka potřebuje? Ozvu se nejpozději zítra.",
        },
      ],
    },
  },
  {
    key: "vacek",
    channel: "SMS",
    senderName: "Ondřej Vacek",
    senderContact: "+420605300300",
    content: "Dobry den, ozvete se mi ohledne te zivotni pojistky? Uz je to tyden. Vacek",
    receivedAt: daysAgo(6, 18, 5),
    status: "WAITING_REPLY",
    base: 3,
    owner: "director",
    assignee: "anna",
    ai: {
      summary: "Klient se po týdnu bez odpovědi dožaduje návrhu životního pojištění a je viditelně netrpělivý.",
      intent: "Urgence – návrh životního pojištění",
      topics: ["životní pojištění", "urgence"],
      sentiment: "negative",
      suggestedPriority: 2,
      priorityReason: "Klient čeká týden a je nespokojený – hrozí ztráta důvěry.",
      tasks: [{ title: "Poslat Ondřeji Vackovi návrh životního pojištění", priority: 2, assignee: "anna" }],
      replies: [
        {
          label: "Omluva + termín",
          text: "Dobrý den, pane Vacku, omlouváme se za zdržení. Návrh životního pojištění Vám kolegyně Anna Nováková pošle do zítřka 12:00 a zavolá Vám, abyste jej mohli projít.",
        },
        {
          label: "Nabídnout schůzku",
          text: "Dobrý den, pane Vacku, omlouvám se. Návrh je téměř hotový – hodila by se Vám krátká schůzka ve čtvrtek odpoledne?",
        },
      ],
    },
  },
  {
    key: "benesova",
    channel: "IMESSAGE",
    senderName: "Klára Benešová",
    senderContact: "+420777909101",
    content: "Ahoj Martine, zítra bohužel nestihnu tu schůzku v 10, šlo by to přesunout na čtvrtek odpoledne? Klára",
    receivedAt: minutesAgo(28),
    status: "UNREAD",
    base: 2,
    owner: "director",
    ai: {
      summary: "Klientka žádá o přesun zítřejší schůzky z 10:00 na čtvrtek odpoledne.",
      intent: "Přesunutí schůzky",
      topics: ["schůzka", "změna termínu"],
      sentiment: "neutral",
      suggestedPriority: 2,
      priorityReason: "Schůzka je naplánována na zítra – je potřeba odpovědět dnes.",
      deadline: at(1, 10, 0),
      replies: [
        { label: "Potvrdit čtvrtek", text: "Ahoj Kláro, žádný problém. Čtvrtek v 15:00 by ti vyhovoval? Martin" },
        { label: "Nabídnout varianty", text: "Ahoj Kláro, jasně. Ve čtvrtek můžu ve 14:00 nebo v 16:30 – co je ti milejší? Martin" },
      ],
    },
  },
  {
    key: "kopecka",
    channel: "EMAIL",
    senderName: "Hana Kopecká (účetní)",
    senderContact: "kopecka@ucetnictvi-kopecka.cz",
    subject: "Interní report cash flow Q3 – prosba o připomínky",
    content:
      "Dobrý den, pane řediteli,\n\nposílám návrh reportu cash flow za Q3. Prosím o kontrolu čísel (hlavně provizí za hypotéky v září) a o připomínky do zítřka do 17:00, ať to stihneme finalizovat před poradou společníků.\n\nDěkuji\nHana Kopecká",
    receivedAt: hoursAgo(5),
    status: "WAITING_REPLY",
    base: 3,
    owner: "director",
    attachments: [{ name: "cashflow_Q3_navrh.xlsx", size: 184_320, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }],
    ai: {
      summary: "Účetní poslala návrh reportu cash flow za Q3 a žádá o kontrolu čísel a připomínky do zítřka 17:00.",
      intent: "Kontrola interního reportu",
      topics: ["cash flow", "Q3", "interní report"],
      sentiment: "neutral",
      suggestedPriority: 2,
      priorityReason: "Termín pro připomínky je zítra 17:00.",
      deadline: at(1, 17, 0),
      deadlines: [{ date: at(1, 17, 0), label: "Připomínky k reportu" }],
      tasks: [{ title: "Interní report – cash flow Q3", description: "Zkontrolovat čísla a poslat připomínky účetní.", deadline: at(1, 17, 0), priority: 2, assignee: "director" }],
      replies: [
        { label: "Potvrdit", text: "Dobrý den, paní Kopecká, děkuji, report projdu a připomínky pošlu zítra do 17:00. Martin Procházka" },
        { label: "Doplňující dotaz", text: "Dobrý den, paní Kopecká, děkuji. Jsou v provizích za září zahrnuty i hypotéky podepsané 30. 9.? Připomínky pošlu do zítřka." },
      ],
    },
  },
  {
    key: "bures",
    channel: "EMAIL",
    senderName: "Ing. Tomáš Bureš",
    senderContact: "bures@bures-stavby.cz",
    subject: "Poptávka na zpracování daňové optimalizace",
    content:
      "Dobrý den,\n\nzajímalo by nás, zda byste nám mohli pomoci s nastavením efektivní daňové strategie pro naši firmu vzhledem k plánované expanzi na Slovensko v příštím roce. V příloze posílám firemní prezentaci.\n\nDěkujeme za info.\n\nIng. Tomáš Bureš\njednatel, Bureš stavby s.r.o.",
    receivedAt: daysAgo(1, 9, 14),
    status: "ASSIGNED",
    base: 3,
    owner: "director",
    assignee: "jan",
    attachments: [{ name: "firemni_prezentace.pdf", size: 2_516_582, mimeType: "application/pdf" }],
    ai: {
      summary: "Firma Bureš stavby poptává nastavení daňové strategie kvůli plánované expanzi na Slovensko.",
      intent: "Poptávka služby – daňová optimalizace",
      topics: ["daňová optimalizace", "firemní klient", "expanze"],
      sentiment: "positive",
      suggestedPriority: 3,
      priorityReason: "Nová obchodní příležitost bez pevného termínu.",
      tasks: [{ title: "Připravit nabídku daňové optimalizace pro Bureš stavby", priority: 3, assignee: "jan" }],
      replies: [
        {
          label: "Navrhnout schůzku",
          text: "Dobrý den, pane inženýre, děkujeme za důvěru. Rádi Vám s daňovou strategií pomůžeme. Navrhuji úvodní schůzku s naším daňovým poradcem Janem Novákem – vyhovoval by Vám příští úterý v 10:00?",
        },
        {
          label: "Vyžádat podklady",
          text: "Dobrý den, děkujeme za poptávku. Pro přípravu návrhu prosím pošlete účetní závěrku za poslední rok a plánovanou strukturu slovenské pobočky.",
        },
      ],
    },
  },
  {
    key: "dvorakova",
    channel: "WHATSAPP",
    senderName: "Lucie Dvořáková",
    senderContact: "+420777123456",
    content:
      "Dobrý den, děkuji za zaslání přehledu portfolia 👍 Jen mi není jasné, proč je výkonnost dluhopisového fondu za poslední rok záporná. Máme s tím něco dělat?",
    receivedAt: hoursAgo(3),
    status: "WAITING_REPLY",
    base: 3,
    owner: "director",
    ai: {
      summary: "Klientka děkuje za přehled portfolia a ptá se na zápornou roční výkonnost dluhopisového fondu.",
      intent: "Dotaz na výkonnost fondu",
      topics: ["portfolio", "dluhopisový fond", "výkonnost"],
      sentiment: "concerned",
      suggestedPriority: 3,
      priorityReason: "Dotaz klientky bez termínu, ale s mírnou obavou.",
      replies: [
        {
          label: "Vysvětlit",
          text: "Dobrý den, paní Dvořáková, záporná výkonnost je způsobená růstem úrokových sazeb, které dočasně snižují ceny dluhopisů. Fond nyní nakupuje dluhopisy s vyšším výnosem, takže očekáváme postupné zlepšení. Doporučuji pozici držet – rád to proberu i telefonicky.",
        },
        { label: "Nabídnout hovor", text: "Dobrý den, děkuji za dotaz. Je to dobré téma k probrání – můžu Vám zítra zavolat a vše vysvětlit?" },
      ],
    },
  },
  {
    key: "riha",
    channel: "SMS",
    senderName: "Michal Říha",
    senderContact: "+420603555210",
    content: "Dobry den, rychly dotaz - kolik zaplatim dan z prodeje akcii, kdyz jsem je drzel 2 roky? Diky Riha",
    receivedAt: daysAgo(1, 19, 40),
    status: "ASSIGNED",
    base: 3,
    owner: "jan",
    assignee: "jan",
    ai: {
      summary: "Klient se ptá na zdanění zisku z prodeje akcií držených 2 roky.",
      intent: "Daňový dotaz – prodej akcií",
      topics: ["daně", "akcie", "časový test"],
      sentiment: "neutral",
      suggestedPriority: 3,
      priorityReason: "Běžný daňový dotaz.",
      tasks: [{ title: "Odpovědět Říhovi – daň z prodeje akcií", priority: 3, assignee: "jan" }],
      replies: [
        {
          label: "Odpověď",
          text: "Dobrý den, pane Řího, u akcií platí časový test 3 roky – při držbě 2 roky je zisk zdanitelný (15 %), pokud příjmy z prodejů cenných papírů za rok přesáhnou 100 000 Kč. Pošlete mi prosím nákupní a prodejní ceny a spočítám přesnou částku.",
        },
      ],
    },
  },
  {
    key: "stastna",
    channel: "EMAIL",
    senderName: "Eva Šťastná",
    senderContact: "eva.stastna@centrum.cz",
    subject: "Spoření pro děti – stavební spoření, nebo DIP?",
    content:
      "Dobrý den, paní Nováková,\n\nnavazuji na naši schůzku. Přemýšlela jsem o variantách spoření pro děti (8 a 11 let) – co je výhodnější, stavební spoření, nebo dlouhodobý investiční produkt (DIP)? Mohla byste mi poslat srovnání?\n\nDěkuji\nEva Šťastná",
    receivedAt: daysAgo(1, 13, 20),
    status: "ASSIGNED",
    base: 3,
    owner: "anna",
    assignee: "anna",
    ai: {
      summary: "Klientka chce srovnání stavebního spoření a DIP pro spoření pro dvě děti.",
      intent: "Žádost o srovnání produktů",
      topics: ["spoření pro děti", "stavební spoření", "DIP"],
      sentiment: "positive",
      suggestedPriority: 3,
      priorityReason: "Navazující obchodní příležitost bez pevného termínu.",
      tasks: [{ title: "Srovnání: stavební spoření vs. DIP pro Šťastnou", priority: 3, assignee: "anna" }],
      replies: [
        {
          label: "Potvrdit přípravu",
          text: "Dobrý den, paní Šťastná, děkuji za zprávu. Srovnání pro obě děti připravím a pošlu do pátku – včetně modelace pro horizont 10 a 15 let.",
        },
      ],
    },
  },
  {
    key: "cerny",
    channel: "WHATSAPP",
    senderName: "David Černý",
    senderContact: "+420608222444",
    content: "Dobrý den, rád bych probral rebalancování portfolia, akcie mi teď tvoří přes 80 %. Kdy byste měla čas?",
    receivedAt: daysAgo(6, 11, 2),
    status: "ASSIGNED",
    base: 4,
    owner: "anna",
    assignee: "anna",
    ai: {
      summary: "Klient chce rebalancovat portfolio, akciová složka přesáhla 80 %.",
      intent: "Rebalancování portfolia",
      topics: ["portfolio", "rebalancování", "akcie"],
      sentiment: "neutral",
      suggestedPriority: 4,
      priorityReason: "Bez akutního termínu.",
      tasks: [{ title: "Rebalancování portfolia – David Černý", priority: 4, assignee: "anna" }],
      replies: [{ label: "Navrhnout termín", text: "Dobrý den, pane Černý, ráda. Hodil by se Vám příští týden úterý v 16:00 online?" }],
    },
  },
  {
    key: "hola",
    channel: "WHATSAPP",
    senderName: "Martina Holá",
    senderContact: "+420739404040",
    content: "Dobrý den, viděla jsem, že ČNB snížila sazby. Vyplatí se mi teď refinancovat hypotéku? Fixace mi končí v březnu.",
    receivedAt: hoursAgo(5.5),
    status: "ASSIGNED",
    base: 4,
    owner: "petr",
    assignee: "petr",
    ai: {
      summary: "Klientce v březnu končí fixace a zajímá ji, zda se po snížení sazeb vyplatí refinancovat.",
      intent: "Refinancování hypotéky",
      topics: ["hypotéka", "refinancování", "fixace"],
      sentiment: "positive",
      suggestedPriority: 4,
      priorityReason: "Fixace končí až v březnu – dostatek času.",
      tasks: [{ title: "Refinancování hypotéky – Martina Holá", priority: 4, assignee: "petr" }],
      replies: [
        { label: "Nabídnout analýzu", text: "Dobrý den, paní Holá, ano, teď je ideální čas začít. Připravím srovnání nabídek bank a do týdne se ozvu." },
      ],
    },
  },
  {
    key: "vltava",
    channel: "EMAIL",
    senderName: "Pojišťovna Vltava – likvidace",
    senderContact: "likvidace@pojistovna-vltava.example",
    subject: "Doplnění podkladů k pojistné události č. 2026-44871",
    content:
      "Vážená paní, vážený pane,\n\npro dokončení šetření pojistné události klienta Josefa Kratochvíla (č. 2026-44871) potřebujeme doplnit fotodokumentaci poškozeného vozidla a odhad škody od autorizovaného servisu.\n\nPodklady prosím zašlete nejpozději do 8 dnů.\n\nS pozdravem\nOddělení likvidace pojistných událostí",
    receivedAt: daysAgo(2, 8, 45),
    status: "ASSIGNED",
    base: 3,
    owner: "director",
    assignee: "anna",
    ai: {
      summary: "Pojišťovna požaduje do 8 dnů doplnit fotodokumentaci a odhad škody k události klienta Kratochvíla.",
      intent: "Doplnění podkladů pojistné události",
      topics: ["pojistná událost", "likvidace", "podklady"],
      sentiment: "neutral",
      suggestedPriority: 3,
      priorityReason: "Pevný termín za 8 dní.",
      deadline: at(6, 23, 59),
      deadlines: [{ date: at(6, 23, 59), label: "Doplnění podkladů pojišťovně" }],
      tasks: [{ title: "Doplnit podklady k pojistné události Kratochvíl", deadline: at(6, 23, 59), priority: 3, assignee: "anna" }],
      replies: [{ label: "Potvrdit přijetí", text: "Dobrý den, děkujeme, podklady od klienta zajistíme a zašleme v požadovaném termínu." }],
    },
  },
  {
    key: "datovka",
    channel: "EMAIL",
    senderName: "Notifikace datové schránky",
    senderContact: "notifikace@datove-schranky.example",
    subject: "Nová zpráva: Výzva k odstranění vad podání",
    content:
      "Do datové schránky byla doručena nová zpráva.\n\nVěc: Výzva k odstranění vad podání – daňové přiznání k dani z příjmů FO (Michal Říha)\nLhůta: 15 dnů od doručení\n\nZprávu si přečtěte v datové schránce.",
    receivedAt: daysAgo(1, 7, 58),
    status: "ASSIGNED",
    base: 3,
    owner: "director",
    assignee: "jan",
    ai: {
      summary: "Finanční úřad vyzývá k odstranění vad daňového přiznání klienta Říhy, lhůta 15 dnů.",
      intent: "Výzva finančního úřadu",
      topics: ["daňové přiznání", "finanční úřad", "lhůta"],
      sentiment: "concerned",
      suggestedPriority: 2,
      priorityReason: "Zákonná lhůta – zmeškání má sankční následky.",
      deadline: at(13, 23, 59),
      deadlines: [{ date: at(13, 23, 59), label: "Lhůta pro odstranění vad" }],
      tasks: [{ title: "Odpovědět na výzvu FÚ – daňové přiznání Říha", deadline: at(13, 23, 59), priority: 2, assignee: "jan" }],
      replies: [{ label: "Interní poznámka", text: "Výzvu přebírá Jan Novák, odpověď připraví do 10 dnů." }],
    },
  },
  {
    key: "banka",
    channel: "EMAIL",
    senderName: "Moravská banka – hypoteční centrum",
    senderContact: "hypoteky@moravska-banka.example",
    subject: "Schválení úvěru – klient Karel Novák",
    content:
      "Dobrý den,\n\ninformujeme Vás, že hypoteční úvěr klienta Karla Nováka byl schválen. Úvěrová smlouva je připravena k podpisu na pobočce nebo u Vás v kanceláři.\n\nS pozdravem\nHypoteční centrum",
    receivedAt: daysAgo(2, 14, 30),
    status: "RESOLVED",
    base: 3,
    owner: "director",
    ai: {
      summary: "Banka potvrdila schválení hypotéky klienta Nováka, smlouva je připravena k podpisu.",
      intent: "Informace o schválení úvěru",
      topics: ["hypotéka", "schválení úvěru"],
      sentiment: "positive",
      suggestedPriority: 3,
      priorityReason: "Informativní zpráva, navazuje podpis smlouvy.",
      replies: [{ label: "Poděkovat", text: "Dobrý den, děkujeme za informaci, podpis s klientem domluvíme." }],
    },
  },
  {
    key: "horak",
    channel: "SMS",
    senderName: "Pavel Horák",
    senderContact: "+420732111908",
    content: "Diky za schuzku, dokumenty jsem odeslal postou. Horak",
    receivedAt: daysAgo(2, 17, 3),
    status: "RESOLVED",
    base: 5,
    owner: "director",
    ai: {
      summary: "Klient děkuje za schůzku a informuje, že dokumenty odeslal poštou.",
      intent: "Poděkování a informace",
      topics: ["dokumenty"],
      sentiment: "positive",
      suggestedPriority: 5,
      priorityReason: "Informativní zpráva bez nutnosti akce.",
      replies: [{ label: "Poděkovat", text: "Děkuji, pane Horáku, jakmile dokumenty dorazí, dám vědět. Procházka" }],
    },
  },
  {
    key: "newsletter",
    channel: "EMAIL",
    senderName: "Finanční noviny",
    senderContact: "redakce@financni-noviny.example",
    subject: "Články k přečtení: time management pro poradce",
    content:
      "Tento týden jsme pro vás vybrali: 1) Jak plánovat týden finančního poradce, 2) Prioritizace klientů podle hodnoty, 3) Automatizace administrativy pomocí AI.",
    receivedAt: daysAgo(3, 6, 30),
    status: "UNREAD",
    base: 5,
    owner: "director",
    ai: {
      summary: "Newsletter s články o time managementu a prioritizaci práce poradce.",
      intent: "Newsletter",
      topics: ["time management", "produktivita"],
      sentiment: "neutral",
      suggestedPriority: 5,
      priorityReason: "Informativní obsah bez nutnosti reakce.",
      replies: [{ label: "Bez odpovědi", text: "(Newsletter – odpověď není potřeba.)" }],
    },
  },
];

// ─── Tasks ──────────────────────────────────────────────────────────────────

interface SeedTask {
  key: string;
  title: string;
  description?: string;
  clientName?: string;
  base: PriorityLevel;
  deadline?: Date | null;
  remindAt?: Date | null;
  status: TaskStatus;
  creator: PersonKey;
  assignees: PersonKey[];
  source?: string;
  completedAt?: Date;
  needsDirectorAttention?: boolean;
  createdAt: Date;
  comments?: { author: PersonKey; body: string; at: Date }[];
  manual?: { from: PriorityLevel; to: PriorityLevel; by: PersonKey; reason: string; at: Date };
}

const TASKS: SeedTask[] = [
  {
    key: "t-novak",
    title: "Klient Novák – smlouva k podpisu",
    description: "Připravit úvěrovou smlouvu, ověřit fixaci na 5 let a potvrdit klientovi termín podpisu včetně seznamu dokladů.",
    clientName: "Karel Novák",
    base: 2,
    deadline: inHours(2.5),
    status: "IN_PROGRESS",
    creator: "director",
    assignees: ["petr"],
    source: "novak",
    createdAt: daysAgo(2, 16, 45),
    comments: [
      { author: "petr", body: "Banka posílá finální verzi smlouvy dopoledne, fixaci na 5 let ověřuji.", at: hoursAgo(1.2) },
    ],
  },
  {
    key: "t-mala",
    title: "Pomoc klientce Malé s pojistnou událostí",
    description: "Zavolat klientce, poslat pokyny k fotodokumentaci a nahlásit škodu (vytopení) pojišťovně.",
    clientName: "Jana Malá",
    base: 1,
    deadline: at(0, 18, 0),
    status: "NEW",
    creator: "director",
    assignees: ["anna"],
    source: "mala",
    createdAt: minutesAgo(30),
  },
  {
    key: "t-klein",
    title: "Report k penzijnímu spoření – Robert Klein",
    description: "Vygenerovat výpis za Q2 z portálu penzijní společnosti a poslat klientovi.",
    clientName: "Robert Klein",
    base: 3,
    deadline: daysAgo(1, 17, 0),
    status: "NEW",
    creator: "director",
    assignees: ["petr"],
    source: "klein",
    createdAt: daysAgo(3, 9, 0),
  },
  {
    key: "t-cashflow",
    title: "Interní report – cash flow Q3",
    description: "Nutno zkontrolovat čísla a připomínky od účetní. Termín pro finalizaci zítra 17:00.",
    base: 3,
    deadline: at(1, 17, 0),
    status: "IN_PROGRESS",
    creator: "director",
    assignees: ["director"],
    source: "kopecka",
    createdAt: hoursAgo(4.5),
  },
  {
    key: "t-vacek",
    title: "Životní pojistka – návrh pro Ondřeje Vacka",
    description: "Připravit 2 varianty životního pojištění (rizikové + investiční) a projít s klientem.",
    clientName: "Ondřej Vacek",
    base: 3,
    deadline: at(1, 12, 0),
    status: "IN_PROGRESS",
    creator: "director",
    assignees: ["anna"],
    source: "vacek",
    needsDirectorAttention: true,
    createdAt: daysAgo(5, 10, 0),
    manual: { from: 3, to: 2, by: "director", reason: "Klient je nespokojený s rychlostí – priorita navýšena.", at: daysAgo(1, 9, 30) },
    comments: [
      { author: "anna", body: "Potřebuji konzultaci k výluce u rizikových sportů – klient jezdí na horském kole závodně.", at: hoursAgo(20) },
      { author: "director", body: "Zavolám ti po obědě, projdeme podmínky u obou pojišťoven.", at: hoursAgo(19) },
    ],
  },
  {
    key: "t-riha",
    title: "Daň z prodeje akcií – odpověď Říhovi",
    description: "Spočítat daňovou povinnost a poslat klientovi odpověď.",
    clientName: "Michal Říha",
    base: 3,
    deadline: at(2, 12, 0),
    status: "IN_PROGRESS",
    creator: "jan",
    assignees: ["jan"],
    source: "riha",
    createdAt: daysAgo(1, 20, 0),
  },
  {
    key: "t-marketing",
    title: "Marketingová kampaň – review",
    description: "Kampaň připravena, čeká na finální schválení kreativ a rozpočtu.",
    base: 3,
    deadline: at(5, 16, 0),
    status: "NEW",
    creator: "director",
    assignees: ["director"],
    createdAt: daysAgo(4, 11, 0),
  },
  {
    key: "t-stastna",
    title: "Srovnání: stavební spoření vs. DIP pro Šťastnou",
    description: "Modelace pro dvě děti (8 a 11 let), horizont 10 a 15 let, včetně státní podpory.",
    clientName: "Eva Šťastná",
    base: 3,
    deadline: at(4, 17, 0),
    status: "IN_PROGRESS",
    creator: "anna",
    assignees: ["anna"],
    source: "stastna",
    createdAt: daysAgo(1, 14, 0),
    comments: [{ author: "anna", body: "Modelace hotová, chybí jen srovnání poplatků.", at: hoursAgo(6) }],
  },
  {
    key: "t-kratochvil",
    title: "Doplnit podklady k pojistné události Kratochvíl",
    description: "Získat od klienta fotky vozidla a odhad škody ze servisu, odeslat pojišťovně.",
    clientName: "Josef Kratochvíl",
    base: 3,
    deadline: at(6, 23, 59),
    status: "WAITING",
    creator: "director",
    assignees: ["anna"],
    source: "vltava",
    createdAt: daysAgo(2, 9, 0),
    comments: [{ author: "anna", body: "Klient pošle odhad ze servisu ve čtvrtek – čekám.", at: daysAgo(1, 15, 10) }],
  },
  {
    key: "t-meeting",
    title: "Týmový meeting – příprava agendy",
    description: "Standardní týdenní meeting. Připravit aktualizace projektů a přehled pipeline.",
    base: 4,
    deadline: at(8, 9, 0),
    status: "NEW",
    creator: "director",
    assignees: ["director"],
    createdAt: daysAgo(2, 8, 0),
  },
  {
    key: "t-bures",
    title: "Daňová optimalizace – Bureš stavby s.r.o.",
    description: "Připravit návrh daňové strategie pro expanzi na Slovensko (struktura, DPH, převodní ceny).",
    clientName: "Bureš stavby s.r.o.",
    base: 3,
    deadline: at(10, 17, 0),
    status: "NEW",
    creator: "director",
    assignees: ["jan"],
    source: "bures",
    createdAt: daysAgo(1, 9, 40),
    comments: [
      { author: "director", body: "Jane, prosím připrav návrh do konce příštího týdne. Klient plánuje expanzi na Slovensko.", at: daysAgo(1, 9, 41) },
    ],
  },
  {
    key: "t-cerny",
    title: "Rebalancování portfolia – David Černý",
    description: "Navrhnout cílovou alokaci 60/40 a plán postupných přesunů.",
    clientName: "David Černý",
    base: 4,
    deadline: at(12, 16, 0),
    status: "WAITING",
    creator: "anna",
    assignees: ["anna"],
    source: "cerny",
    createdAt: daysAgo(5, 12, 0),
  },
  {
    key: "t-fu",
    title: "Odpovědět na výzvu FÚ – daňové přiznání Říha",
    description: "Doplnit chybějící přílohu k přiznání (příjmy z prodeje CP) a podat přes datovou schránku.",
    clientName: "Michal Říha",
    base: 3,
    deadline: at(13, 23, 59),
    status: "NEW",
    creator: "director",
    assignees: ["jan"],
    source: "datovka",
    createdAt: daysAgo(1, 8, 10),
  },
  {
    key: "t-hola",
    title: "Refinancování hypotéky – Martina Holá",
    description: "Porovnat nabídky 4 bank, připravit podklady k refinancování (fixace končí v březnu).",
    clientName: "Martina Holá",
    base: 4,
    deadline: at(20, 17, 0),
    status: "NEW",
    creator: "petr",
    assignees: ["petr"],
    source: "hola",
    createdAt: hoursAgo(5),
  },
  {
    key: "t-revize",
    title: "Roční revize portfolia – rodina Dvořákova",
    description: "Pravidelná roční revize: cíle, rizikový profil, rebalancování, pojištění.",
    clientName: "Lucie Dvořáková",
    base: 4,
    deadline: at(30, 10, 0),
    status: "NEW",
    creator: "director",
    assignees: ["petr", "anna"],
    createdAt: daysAgo(3, 10, 0),
  },
  {
    key: "t-clanky",
    title: "Články k přečtení – time management",
    description: "Užitečné zdroje pro dlouhodobé zlepšení produktivity týmu.",
    base: 5,
    deadline: null,
    remindAt: at(7, 9, 0),
    status: "NEW",
    creator: "director",
    assignees: ["director"],
    source: "newsletter",
    createdAt: daysAgo(3, 7, 0),
  },
  {
    key: "t-mifid",
    title: "Školení MiFID II – přihlásit tým",
    base: 3,
    deadline: daysAgo(2, 17, 0),
    status: "DONE",
    creator: "director",
    assignees: ["jan"],
    completedAt: daysAgo(2, 11, 0),
    createdAt: daysAgo(9, 9, 0),
  },
  {
    key: "t-kvartal",
    title: "Kvartální vyhodnocení týmu",
    base: 3,
    deadline: daysAgo(1, 17, 0),
    status: "DONE",
    creator: "director",
    assignees: ["director"],
    completedAt: daysAgo(1, 15, 30),
    createdAt: daysAgo(8, 9, 0),
  },
];

// ─── Main ───────────────────────────────────────────────────────────────────

async function reset() {
  // Order respects foreign keys (Restrict on Task.creator).
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.aILog.deleteMany(),
    prisma.assistantMessage.deleteMany(),
    prisma.briefing.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.pushSubscription.deleteMany(),
    prisma.priorityHistory.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.calendarEvent.deleteMany(),
    prisma.taskAssignee.deleteMany(),
    prisma.task.deleteMany(),
    prisma.message.deleteMany(),
    prisma.integration.deleteMany(),
    prisma.user.deleteMany(),
    prisma.team.deleteMany(),
  ]);
}

async function main() {
  console.log("🌱 Seeding Priority Agent demo data…");
  await reset();

  const team = await prisma.team.create({
    data: {
      name: "Procházka & Partneři",
      slug: "prochazka-partneri",
      settings: {
        timezone: "Europe/Prague",
        priorityRules: { ...DEFAULT_PRIORITY_RULES },
        ai: {
          analysisModel: "claude-haiku-5-5",
          assistantModel: "claude-haiku-5-5",
          autoAnalyze: true,
          briefingEnabled: true,
          briefingHour: 7,
          replyTone: "formal",
          signature: "S pozdravem\nMartin Procházka\nProcházka & Partneři – finanční poradenství",
          firmContext:
            "Jsme nezávislá finanční poradenská firma z Brna (ředitel + 3 poradci). Pomáháme klientům s hypotékami, investicemi, pojištěním, penzijním spořením a daňovou optimalizací. S klienty komunikujeme vstřícně a profesionálně, vykáme (kromě dlouholetých klientů, se kterými si tykáme).",
        },
      },
    },
  });

  const passwordHash = await bcrypt.hash("demo1234", 10);
  const users = {} as Record<PersonKey, { id: string; name: string }>;
  for (const key of ["director", "jan", "anna", "petr", "admin"] as PersonKey[]) {
    const p = PEOPLE[key];
    const u = await prisma.user.create({
      data: {
        email: p.email,
        name: p.name,
        passwordHash,
        role: p.role,
        title: p.title,
        phone: p.phone,
        avatarColor: p.color,
        capacity: p.capacity,
        teamId: team.id,
        managerId: key === "director" || key === "admin" ? null : users.director?.id,
        icsToken: randomBytes(18).toString("base64url"),
        lastLoginAt: key === "director" ? hoursAgo(1) : daysAgo(1, 8, 30),
        notificationPrefs:
          key === "director"
            ? { email: true, push: true, emailMinPriority: 2, pushMinPriority: 1, quietHoursEnabled: true, quietStart: "20:00", quietEnd: "07:00" }
            : { email: true, push: false, emailMinPriority: 2, pushMinPriority: 1 },
      },
    });
    users[key] = { id: u.id, name: u.name };
  }

  // Integrations (demo): SMS/iMessage webhook for the director, WhatsApp number for the team.
  const smsToken = "demo-sms-token-" + randomBytes(8).toString("hex");
  await prisma.integration.create({
    data: {
      teamId: team.id,
      userId: users.director.id,
      type: "SMS",
      status: "ACTIVE",
      displayName: "iPhone – Martin Procházka",
      credentials: encryptJson({ webhookToken: smsToken }),
      webhookTokenHash: createHash("sha256").update(smsToken).digest("hex"),
      config: { source: "apple-shortcuts" },
      lastSyncAt: minutesAgo(28),
    },
  });
  const whatsapp = await prisma.integration.create({
    data: {
      teamId: team.id,
      userId: users.director.id,
      type: "WHATSAPP",
      status: "PENDING",
      displayName: "+420 602 100 200",
      credentials: null,
      config: { phoneNumberId: "", businessAccountId: "" },
    },
  });

  // Messages
  const messageIds: Record<string, string> = {};
  for (const m of MESSAGES) {
    const ai = m.ai;
    const aiTasks: AITaskSuggestion[] = (ai.tasks ?? []).map((t) => ({
      title: t.title,
      description: t.description ?? null,
      deadline: t.deadline ? t.deadline.toISOString() : null,
      priority: t.priority ?? m.base,
      suggestedAssigneeId: t.assignee ? users[t.assignee].id : null,
    }));
    const computed = computeMessagePriority(
      { basePriority: m.base, receivedAt: m.receivedAt, status: m.status, autoEscalate: true, aiDeadline: ai.deadline ?? null },
      NOW,
      rules,
    );
    const threadKey = `${m.channel.toLowerCase()}:${m.senderContact.toLowerCase()}`;
    const created = await prisma.message.create({
      data: {
        teamId: team.id,
        ownerId: users[m.owner].id,
        assigneeId: m.assignee ? users[m.assignee].id : null,
        integrationId: m.channel === "WHATSAPP" ? whatsapp.id : null,
        channel: m.channel,
        direction: "INBOUND",
        externalId: `seed-${m.key}`,
        threadKey,
        senderName: m.senderName,
        senderContact: m.senderContact,
        recipient: PEOPLE[m.owner].email,
        subject: m.subject ?? null,
        content: m.content,
        preview: makePreview(m.content),
        attachments: m.attachments ?? undefined,
        receivedAt: m.receivedAt,
        status: m.status,
        basePriority: m.base,
        priority: computed.priority,
        starred: m.starred ?? false,
        readAt: m.status === "UNREAD" ? null : new Date(m.receivedAt.getTime() + 20 * MIN),
        resolvedAt: m.status === "RESOLVED" ? new Date(m.receivedAt.getTime() + 2 * HOUR) : null,
        repliedAt: m.status === "RESOLVED" ? new Date(m.receivedAt.getTime() + 2 * HOUR) : null,
        aiStatus: "DONE",
        aiSummary: ai.summary,
        aiIntent: ai.intent,
        aiTopics: ai.topics,
        aiSentiment: ai.sentiment,
        aiSuggestedPriority: ai.suggestedPriority,
        aiPriorityReason: ai.priorityReason,
        aiDeadline: ai.deadline ?? null,
        aiDeadlines: (ai.deadlines ?? []).map((d) => ({ date: d.date.toISOString(), label: d.label })),
        aiTasks: aiTasks as unknown as Prisma.InputJsonValue,
        aiReplies: ai.replies as unknown as Prisma.InputJsonValue,
        aiModel: "claude-haiku-5-5",
        aiProcessedAt: new Date(m.receivedAt.getTime() + 15_000),
        searchText: buildSearchText(m.senderName, m.senderContact, m.subject, m.content, ai.summary, ai.topics),
        createdAt: m.receivedAt,
      },
    });
    messageIds[m.key] = created.id;

    if (ai.suggestedPriority !== m.base) {
      // AI suggestion recorded for transparency (base priority already reflects human choice).
    }
    await prisma.priorityHistory.create({
      data: {
        teamId: team.id,
        messageId: created.id,
        oldPriority: null,
        newPriority: m.base,
        reason: `AI navrhla ${"P" + ai.suggestedPriority}: ${ai.priorityReason}`,
        source: "AI",
        createdAt: new Date(m.receivedAt.getTime() + 15_000),
      },
    });
    if (computed.priority < m.base && computed.reason) {
      // Reconstruct step-by-step escalation history for waiting messages.
      let level = m.base;
      let step = 1;
      while (level > computed.priority) {
        const when = new Date(m.receivedAt.getTime() + step * rules.messageWaitDays * 24 * HOUR);
        await prisma.priorityHistory.create({
          data: {
            teamId: team.id,
            messageId: created.id,
            oldPriority: level,
            newPriority: level - 1,
            reason: `Zpráva čeká na odpověď ${step * rules.messageWaitDays} dny`,
            source: "AUTO",
            createdAt: when > NOW ? NOW : when,
          },
        });
        level -= 1;
        step += 1;
      }
      await prisma.message.update({ where: { id: created.id }, data: { lastEscalatedAt: hoursAgo(2) } });
    }

    // Conversation history (outbound replies)
    for (const t of m.thread ?? []) {
      await prisma.message.create({
        data: {
          teamId: team.id,
          ownerId: users[t.author ?? m.owner].id,
          channel: m.channel,
          direction: t.direction,
          externalId: `seed-${m.key}-${t.at.getTime()}`,
          threadKey,
          senderName: t.direction === "OUTBOUND" ? users[t.author ?? m.owner].name : m.senderName,
          senderContact: t.direction === "OUTBOUND" ? PEOPLE[t.author ?? m.owner].email : m.senderContact,
          recipient: t.direction === "OUTBOUND" ? m.senderContact : PEOPLE[m.owner].email,
          subject: m.subject ? `Re: ${m.subject}` : null,
          content: t.content,
          preview: makePreview(t.content),
          receivedAt: t.at,
          status: "RESOLVED",
          basePriority: 5,
          priority: 5,
          aiStatus: "SKIPPED",
          readAt: t.at,
          resolvedAt: t.at,
          searchText: buildSearchText(t.content),
          createdAt: t.at,
        },
      });
    }
  }

  // Tasks
  const taskIds: Record<string, string> = {};
  for (const t of TASKS) {
    const computed = computeTaskPriority(
      { basePriority: t.manual ? t.manual.to : t.base, deadline: t.deadline ?? null, remindAt: t.remindAt ?? null, autoEscalate: true, status: t.status },
      NOW,
      rules,
    );
    const base = t.manual ? t.manual.to : t.base;
    const isOverdue = t.deadline && t.deadline < NOW && t.status !== "DONE";
    const task = await prisma.task.create({
      data: {
        teamId: team.id,
        title: t.title,
        description: t.description ?? null,
        clientName: t.clientName ?? null,
        status: t.status,
        basePriority: base,
        priority: t.status === "DONE" ? base : computed.priority,
        deadline: t.deadline ?? null,
        remindAt: t.remindAt ?? null,
        creatorId: users[t.creator].id,
        sourceMessageId: t.source ? messageIds[t.source] : null,
        needsDirectorAttention: t.needsDirectorAttention ?? false,
        completedAt: t.completedAt ?? null,
        lastEscalatedAt: computed.priority < base ? hoursAgo(1) : null,
        overdueNotifiedAt: isOverdue ? hoursAgo(14) : null,
        searchText: buildSearchText(t.title, t.description, t.clientName),
        createdAt: t.createdAt,
        assignees: {
          create: t.assignees.map((a) => ({
            userId: users[a].id,
            assignedById: users[t.creator].id,
            assignedAt: t.createdAt,
          })),
        },
      },
    });
    taskIds[t.key] = task.id;

    await prisma.priorityHistory.create({
      data: {
        teamId: team.id,
        taskId: task.id,
        oldPriority: null,
        newPriority: t.base,
        reason: "Úkol vytvořen",
        source: "MANUAL",
        changedById: users[t.creator].id,
        createdAt: t.createdAt,
      },
    });
    if (t.manual) {
      await prisma.priorityHistory.create({
        data: {
          teamId: team.id,
          taskId: task.id,
          oldPriority: t.manual.from,
          newPriority: t.manual.to,
          reason: t.manual.reason,
          source: "MANUAL",
          changedById: users[t.manual.by].id,
          createdAt: t.manual.at,
        },
      });
    }
    if (t.status !== "DONE" && computed.priority < base && computed.reason) {
      await prisma.priorityHistory.create({
        data: {
          teamId: team.id,
          taskId: task.id,
          oldPriority: base,
          newPriority: computed.priority,
          reason: computed.reason,
          source: "AUTO",
          createdAt: hoursAgo(1),
        },
      });
    }
    for (const c of t.comments ?? []) {
      await prisma.comment.create({
        data: { teamId: team.id, taskId: task.id, authorId: users[c.author].id, body: c.body, createdAt: c.at },
      });
    }
  }

  // Notifications
  const notif = (user: PersonKey, data: Omit<Prisma.NotificationUncheckedCreateInput, "teamId" | "userId">) =>
    prisma.notification.create({ data: { teamId: team.id, userId: users[user].id, ...data } });

  await notif("director", {
    type: "MESSAGE_WAITING",
    title: "Zpráva od Roberta Kleina čeká 4 dny",
    body: "Priorita automaticky zvýšena na P2. Klient potřebuje report do banky.",
    link: `/inbox?message=${messageIds.klein}`,
    priority: 2,
    messageId: messageIds.klein,
    createdAt: hoursAgo(2),
  });
  await notif("director", {
    type: "TASK_OVERDUE",
    title: "Úkol po termínu: Report k penzijnímu spoření – Robert Klein",
    body: "Řeší Petr Svoboda. Termín vypršel včera v 17:00.",
    link: `/tasks?task=${taskIds["t-klein"]}`,
    priority: 1,
    taskId: taskIds["t-klein"],
    createdAt: hoursAgo(14),
  });
  await notif("director", {
    type: "ESCALATED_TO_DIRECTOR",
    title: "Anna Nováková žádá o konzultaci",
    body: "Životní pojistka – návrh pro Ondřeje Vacka: výluka u rizikových sportů.",
    link: `/tasks?task=${taskIds["t-vacek"]}`,
    priority: 2,
    taskId: taskIds["t-vacek"],
    createdAt: hoursAgo(20),
    readAt: hoursAgo(19),
  });
  await notif("director", {
    type: "BRIEFING_READY",
    title: "Ranní AI briefing je připraven",
    body: "3 kritické položky, 2 eskalované úkoly, 5 zpráv čeká na odpověď.",
    link: "/assistant",
    createdAt: at(0, 7, 0) < NOW ? at(0, 7, 0) : minutesAgo(5),
  });
  await notif("director", {
    type: "PRIORITY_ESCALATED",
    title: "Klient Novák – smlouva k podpisu: P2 → P1",
    body: "Blíží se termín podpisu.",
    link: `/tasks?task=${taskIds["t-novak"]}`,
    priority: 1,
    taskId: taskIds["t-novak"],
    createdAt: hoursAgo(1),
  });
  await notif("anna", {
    type: "TASK_ASSIGNED",
    title: "Nový úkol: Pomoc klientce Malé s pojistnou událostí",
    body: "Přiřadil Martin Procházka · P1 · termín dnes 18:00",
    link: `/my-tasks?task=${taskIds["t-mala"]}`,
    priority: 1,
    taskId: taskIds["t-mala"],
    createdAt: minutesAgo(30),
  });
  await notif("anna", {
    type: "TASK_COMMENT",
    title: "Martin Procházka okomentoval úkol",
    body: "Zavolám ti po obědě, projdeme podmínky u obou pojišťoven.",
    link: `/my-tasks?task=${taskIds["t-vacek"]}`,
    taskId: taskIds["t-vacek"],
    createdAt: hoursAgo(19),
  });
  await notif("jan", {
    type: "TASK_ASSIGNED",
    title: "Nový úkol: Daňová optimalizace – Bureš stavby s.r.o.",
    body: "Přiřadil Martin Procházka · P3",
    link: `/my-tasks?task=${taskIds["t-bures"]}`,
    priority: 3,
    taskId: taskIds["t-bures"],
    createdAt: daysAgo(1, 9, 41),
  });
  await notif("petr", {
    type: "TASK_OVERDUE",
    title: "Úkol po termínu: Report k penzijnímu spoření – Robert Klein",
    body: "Termín vypršel včera v 17:00.",
    link: `/my-tasks?task=${taskIds["t-klein"]}`,
    priority: 1,
    taskId: taskIds["t-klein"],
    createdAt: hoursAgo(14),
  });

  // Calendar
  const event = (user: PersonKey, data: Omit<Prisma.CalendarEventUncheckedCreateInput, "teamId" | "userId">) =>
    prisma.calendarEvent.create({ data: { teamId: team.id, userId: users[user].id, ...data } });
  await event("director", { title: "Podpis hypotéky – Karel Novák", location: "Kancelář, zasedačka 1", startAt: inHours(2.5), endAt: inHours(3.5), taskId: taskIds["t-novak"] });
  await event("director", { title: "Schůzka – Klára Benešová", startAt: at(1, 10, 0), endAt: at(1, 11, 0), description: "Klientka žádá o přesun na čtvrtek." });
  await event("director", { title: "Porada společníků", startAt: at(2, 9, 0), endAt: at(2, 10, 30), location: "Online (Teams)" });
  await event("director", { title: "Týmový meeting", startAt: at(8, 9, 0), endAt: at(8, 10, 0) });
  await event("anna", { title: "Konzultace – Eva Šťastná", startAt: at(3, 15, 0), endAt: at(3, 16, 0), location: "Kancelář" });
  await event("anna", { title: "Hovor – Jana Malá (pojistná událost)", startAt: inHours(1), endAt: inHours(1.5) });
  await event("petr", { title: "Moravská banka – hypoteční centrum", startAt: at(1, 13, 0), endAt: at(1, 14, 0), location: "Pobočka Brno-střed" });
  await event("jan", { title: "Úvodní schůzka – Bureš stavby", startAt: at(5, 10, 0), endAt: at(5, 11, 30), location: "Sídlo klienta" });

  // Morning briefing for the director
  const stats: BriefingStats = { critical: 3, escalated: 2, waitingMessages: 5, overdue: 1, dueToday: 2, openTasks: 15 };
  const briefing: BriefingContent = {
    greeting: "Dobré ráno, Martine!",
    summary:
      "Dnes hoří tři věci: podpis hypotéky s panem Novákem, pojistná událost paní Malé a report pro pana Kleina, který je po termínu. Pět klientských zpráv čeká na odpověď – nejdéle pan Vacek (6 dní).",
    focus: [
      { title: "Klient Novák – smlouva k podpisu", reason: "Podpis je naplánován na dnešek, Petr ověřuje fixaci na 5 let.", priority: 1, itemType: "task", itemId: taskIds["t-novak"] },
      { title: "Pojistná událost – Jana Malá", reason: "Akutní škoda, klientka potřebuje pokyny ještě dnes.", priority: 1, itemType: "message", itemId: messageIds.mala },
      { title: "Report k penzijnímu spoření – Robert Klein", reason: "Úkol je po termínu a klient čeká 4 dny.", priority: 1, itemType: "task", itemId: taskIds["t-klein"] },
    ],
    risks: [
      { title: "Ondřej Vacek čeká 6 dní", detail: "Klient je nespokojený, Anna potřebuje konzultaci k výluce.", itemType: "task", itemId: taskIds["t-vacek"] },
      { title: "Anna je přetížená", detail: "Má 6 otevřených úkolů při kapacitě 6 – zvaž přerozdělení.", itemType: null, itemId: null },
    ],
    teamNotes: [
      "Anna Nováková: 100 % kapacity, 2 úkoly s vysokou prioritou.",
      "Petr Svoboda: 1 úkol po termínu (Klein).",
      "Jan Novák: volná kapacita – vhodný pro nové daňové dotazy.",
    ],
    suggestedAssignments: [
      { title: "Dotaz na refinancování – Martina Holá", reason: "Hypoteční agenda – Petr Svoboda.", priority: 4, itemType: "message", itemId: messageIds.hola, assigneeId: users.petr.id, assigneeName: users.petr.name },
      { title: "Výkonnost dluhopisového fondu – Lucie Dvořáková", reason: "Investiční dotaz – Jan má volnou kapacitu, Anna je přetížená.", priority: 3, itemType: "message", itemId: messageIds.dvorakova, assigneeId: users.jan.id, assigneeName: users.jan.name },
    ],
    suggestedReplies: [
      { messageId: messageIds.novak, label: "Potvrdit podpis – Novák", text: "Dobrý den, pane Nováku, podpis dnes potvrzuji. Přineste prosím OP, potvrzení o příjmu a kupní smlouvu." },
      { messageId: messageIds.benesova, label: "Přesun schůzky – Benešová", text: "Ahoj Kláro, žádný problém. Čtvrtek v 15:00 by ti vyhovoval? Martin" },
      { messageId: messageIds.klein, label: "Omluva – Klein", text: "Dobrý den, pane Kleine, omlouvám se za zdržení, report Vám posíláme ještě dnes." },
    ],
  };
  await prisma.briefing.create({
    data: { teamId: team.id, userId: users.director.id, day: dayKey(NOW), content: briefing as unknown as Prisma.InputJsonValue, stats: stats as unknown as Prisma.InputJsonValue, model: "claude-haiku-5-5", createdAt: at(0, 7, 0) < NOW ? at(0, 7, 0) : minutesAgo(5) },
  });

  await prisma.assistantMessage.createMany({
    data: [
      { teamId: team.id, userId: users.director.id, role: "ASSISTANT", content: `${briefing.greeting} ${briefing.summary} S čím vám mám pomoct?`, model: "claude-haiku-5-5", createdAt: at(0, 7, 0) < NOW ? at(0, 7, 0) : minutesAgo(5) },
    ],
  });

  // AI usage logs over the last 14 days (cost dashboard)
  const logs: Prisma.AILogCreateManyInput[] = [];
  for (let d = 13; d >= 0; d--) {
    const perDay = 6 + ((d * 7) % 9);
    for (let i = 0; i < perDay; i++) {
      const input = 900 + ((d * 31 + i * 17) % 700);
      const output = 280 + ((d * 13 + i * 29) % 260);
      const created = new Date(daysAgo(d, 7 + (i % 11), (i * 7) % 60).getTime());
      if (created > NOW) continue;
      logs.push({
        teamId: team.id,
        kind: i === 0 ? "BRIEFING" : i % 5 === 0 ? "CHAT" : "MESSAGE_ANALYSIS",
        model: "claude-haiku-5-5",
        status: "SUCCESS",
        inputTokens: input,
        outputTokens: output,
        cacheReadTokens: i % 3 === 0 ? 1200 : 0,
        costUsd: Math.round(((input / 1e6) * 0.1 + (output / 1e6) * 0.5) * 1e6) / 1e6,
        latencyMs: 900 + ((i * 113) % 1400),
        userId: i % 5 === 0 ? users.director.id : null,
        createdAt: created,
      });
    }
  }
  await prisma.aILog.createMany({ data: logs });

  // Audit trail
  await prisma.auditLog.createMany({
    data: [
      { teamId: team.id, actorId: users.director.id, action: "auth.login", createdAt: hoursAgo(1), ip: "127.0.0.1" },
      { teamId: team.id, actorId: users.director.id, action: "task.assign", entityType: "Task", entityId: taskIds["t-mala"], metadata: { assignees: [users.anna.name] }, createdAt: minutesAgo(30) },
      { teamId: team.id, actorId: users.director.id, action: "task.priority.override", entityType: "Task", entityId: taskIds["t-vacek"], metadata: { from: 3, to: 2 }, createdAt: daysAgo(1, 9, 30) },
      { teamId: team.id, actorId: users.admin.id, action: "integration.connect", entityType: "Integration", metadata: { type: "SMS" }, createdAt: daysAgo(5, 10, 0) },
      { teamId: team.id, actorId: users.director.id, action: "settings.priority_rules.update", metadata: { preset: "standard" }, createdAt: daysAgo(6, 16, 0) },
    ],
  });

  console.log("✅ Done.");
  console.log("");
  console.log("   Demo accounts (password: demo1234)");
  for (const key of Object.keys(PEOPLE) as PersonKey[]) {
    console.log(`   • ${PEOPLE[key].role.padEnd(8)} ${PEOPLE[key].email}`);
  }
  console.log("");
  console.log(`   SMS / iMessage webhook token (director): ${smsToken}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
