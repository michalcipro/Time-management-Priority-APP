/**
 * Offline "AI" – deterministic heuristics used when no Anthropic API key is
 * configured or the API is unavailable. Produces the same shape as the Claude
 * analysis so the rest of the app works identically (marked as offline in the UI).
 */
import { addDays, dayKey, fromLocalDateTime, formatDate, formatTime, localMinutes } from "@/lib/format";
import { normalizeForSearch } from "@/lib/search-text";
import { clampPriority, type PriorityLevel } from "@/lib/priority";
import type { MessageAnalysisRaw } from "./schemas";

export const OFFLINE_MODEL = "offline-heuristics";

interface TeamMemberLite {
  id: string;
  name: string;
  role: string;
  title: string | null;
}

interface HeuristicInput {
  channel: string;
  senderName: string | null;
  subject: string | null;
  content: string;
  receivedAt: Date;
  now?: Date;
  team?: TeamMemberLite[];
  signature?: string;
  formal?: boolean;
}

// ─── Keyword dictionaries (diacritics-free, lower-case) ─────────────────────

const P1_WORDS = [
  "urgent", "nalehav", "okamzite", "co nejdriv", "co nejdrive", "hned", "vytopil", "vytopen", "havari", "nehod", "pozar",
  "kradez", "vykradl", "pojistna udalost", "skoda", "exekuc", "insolven", "vypoved", "zrusit smlouvu", "odstoupit", "stiznost",
];
const P2_WORDS = [
  "zitra", "pozitri", "do 48", "vyzva", "lhuta", "financni urad", "datov", "termin", "schuzk", "presunout", "uz je to tyden",
  "uz tyden", "nespokojen", "reklamac", "upominka", "splatnost", "podpis", "do patku", "tento tyden",
];
const P5_WORDS = ["newsletter", "odhlasit", "noreply", "no-reply", "notifikace", "automaticky generovan", "clanky", "webinar", "akce:"];
const THANKS = ["dekuji", "dekujeme", "diky", "dik"];

const TOPICS: { key: string; words: string[]; label: string }[] = [
  // Ordered from most to least specific – the first match drives intent and routing.
  { key: "tax", words: ["dan", "danov", "priznani", "financni urad", "dph", "odpocet"], label: "daně" },
  { key: "insurance", words: ["pojist", "pojisten", "skoda", "likvidac", "vytopil"], label: "pojištění" },
  { key: "mortgage", words: ["hypote", "uver", "fixac", "refinanc", "sazb"], label: "hypotéka" },
  { key: "pension", words: ["penzij", "duchod", "dip", "doplnkov"], label: "penzijní spoření" },
  { key: "investment", words: ["portfol", "fond", "akci", "invest", "dluhopis", "rebalanc", "etf"], label: "investice" },
  { key: "savings", words: ["sporeni", "stavebni sporeni", "sporit"], label: "spoření" },
  { key: "meeting", words: ["schuzk", "sejit", "konzultac", "presunout", "termin"], label: "schůzka" },
  { key: "documents", words: ["dokument", "doklad", "smlouv", "vypis", "report", "potvrzeni", "priloh"], label: "dokumenty" },
];

const NEGATIVE = ["nespokojen", "stiznost", "zklam", "uz je to", "konecne", "porad nic", "nikdo se neozval", "nereagujete"];
const POSITIVE = ["dekuji", "dekujeme", "diky", "skvel", "super", "vyborn", "spokojen"];

const WEEKDAYS: Record<string, number> = {
  pondel: 1, utery: 2, uter: 2, stred: 3, ctvrt: 4, patek: 5, patku: 5, sobot: 6, nedel: 0,
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const prefixCache = new Map<string, RegExp>();
/** True when any of `words` occurs at the start of a word (prefix match, diacritics-free text). */
const has = (text: string, words: string[]) =>
  words.some((w) => {
    let re = prefixCache.get(w);
    if (!re) {
      re = new RegExp(`(?:^|[^a-z0-9])${escapeRe(w)}`);
      prefixCache.set(w, re);
    }
    return re.test(text);
  });

// ─── Date extraction ────────────────────────────────────────────────────────

function localDay(now: Date, offset: number): string {
  return dayKey(addDays(now, offset));
}

function weekdayIndex(now: Date): number {
  // 0 = Sunday … 6 = Saturday (in app timezone)
  const key = dayKey(now);
  return new Date(key + "T12:00:00Z").getUTCDay();
}

/** Extract dates/times from Czech text ("dnes ve 12", "zítra", "do pátku", "30. 5.", "30.5.2026 v 10:00"). */
export function extractDeadlines(text: string, now: Date = new Date()): { date: Date; label: string }[] {
  const t = normalizeForSearch(text);
  const results: { date: Date; label: string }[] = [];
  const timeMatch = /\b(?:ve?|do|od)\s+(\d{1,2})(?::(\d{2}))?\s*(?:h(?:od)?\b)?/.exec(t);
  const hh = timeMatch ? Math.min(23, Number(timeMatch[1])) : null;
  const mm = timeMatch && timeMatch[2] ? Number(timeMatch[2]) : 0;
  const withTime = (day: string, fallbackHour = 17) =>
    fromLocalDateTime(`${day}T${String(hh ?? fallbackHour).padStart(2, "0")}:${String(hh !== null ? mm : 0).padStart(2, "0")}`)!;

  // "dnes" only counts as a deadline in deadline-like phrases ("ještě dnes", "do dneška", "dnes do 17", "nejpozději dnes").
  if (/\b(jeste dnes|do dneska|do dnesniho|nejpozdeji dnes|dnes do|dnes ve?|dnes potrebuj|potrebuj\w* (to )?dnes|dnes musim|musi(m|me)? dnes)\b/.test(t)) {
    results.push({ date: withTime(localDay(now, 0), 17), label: "Dnes" });
  }
  if (/\bzitra\b/.test(t)) results.push({ date: withTime(localDay(now, 1), 12), label: "Zítra" });
  if (/\bpozitri\b/.test(t)) results.push({ date: withTime(localDay(now, 2), 12), label: "Pozítří" });

  const weekdayRe = /\b(?:do|v|ve|na|pristi)\s+(pondel\w*|uter\w*|stred\w*|ctvrt\w*|patek|patku|sobot\w*|nedel\w*)/;
  const wd = weekdayRe.exec(t);
  if (wd) {
    const stem = Object.keys(WEEKDAYS).find((k) => wd[1].startsWith(k));
    if (stem !== undefined) {
      const target = WEEKDAYS[stem];
      let diff = (target - weekdayIndex(now) + 7) % 7;
      if (diff === 0) diff = 7;
      if (/pristi/.test(wd[0]) && diff < 7) diff += 7;
      results.push({ date: withTime(localDay(now, diff), 17), label: `Do ${wd[1]}` });
    }
  }

  const dateRe = /\b(\d{1,2})\.\s?(\d{1,2})\.(?:\s?(\d{4}))?/g;
  let m: RegExpExecArray | null;
  while ((m = dateRe.exec(t))) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (day < 1 || day > 31 || month < 1 || month > 12) continue;
    let year = m[3] ? Number(m[3]) : Number(dayKey(now).slice(0, 4));
    let candidate = fromLocalDateTime(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hh ?? 17).padStart(2, "0")}:${String(hh !== null ? mm : 0).padStart(2, "0")}`);
    if (!candidate) continue;
    if (!m[3] && candidate.getTime() < now.getTime() - 24 * 3_600_000) {
      year += 1;
      candidate = fromLocalDateTime(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hh ?? 17).padStart(2, "0")}:00`);
    }
    if (candidate) results.push({ date: candidate, label: `${day}. ${month}.` });
  }

  const inDays = /\b(?:do|za)\s+(\d{1,2})\s+(?:dnu|dni|dny)\b/.exec(t);
  if (inDays) results.push({ date: withTime(localDay(now, Number(inDays[1])), 23), label: `Do ${inDays[1]} dnů` });

  // De-duplicate and keep future-ish dates sorted.
  const seen = new Set<number>();
  return results
    .filter((r) => r.date.getTime() > now.getTime() - 12 * 3_600_000)
    .filter((r) => (seen.has(r.date.getTime()) ? false : (seen.add(r.date.getTime()), true)))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ─── Summary ────────────────────────────────────────────────────────────────

const GREETING_RE = /^(dobr[ýy] den|dobr[ýé] (r[áa]no|odpoledne|ve[cč]er)|ahoj|zdrav[ií]m|v[áa]žen[áýy][^,]*)[,!.]?\s*/i;
const SIGNOFF_RE = /\n\s*(s pozdravem|d[ěe]kuji|d[ěe]kujeme|hezk[ýy] den|zdrav[ií]m|s p[řr][áa]n[ií]m)[\s\S]*$/i;

export function summarize(content: string, max = 220): string {
  let text = content.replace(/\r/g, "").trim();
  text = text.replace(SIGNOFF_RE, "").trim();
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length && GREETING_RE.test(lines[0]) && lines[0].length < 60) lines.shift();
  const body = lines.join(" ").replace(GREETING_RE, "").replace(/\s+/g, " ").trim();
  const sentences = body.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [body];
  let summary = "";
  for (const s of sentences) {
    if ((summary + s).length > max && summary) break;
    summary += s;
    if (summary.length > max * 0.6) break;
  }
  summary = summary.trim();
  if (summary.length > max) summary = summary.slice(0, max - 1).trimEnd() + "…";
  return summary.charAt(0).toUpperCase() + summary.slice(1);
}

// ─── Main heuristic analysis ────────────────────────────────────────────────

export function heuristicAnalysis(input: HeuristicInput): MessageAnalysisRaw {
  const now = input.now ?? new Date();
  const raw = `${input.subject ?? ""}\n${input.content}`;
  const t = normalizeForSearch(raw);
  const sender = normalizeForSearch(input.senderName ?? "");

  const topics = TOPICS.filter((topic) => has(t, topic.words));
  const deadlines = extractDeadlines(raw, now);
  const isQuestion = /\?/.test(input.content) || /\b(muzete|mohl|mohla|mohli|prosim|potreb|jak|kolik|kdy|co mam)\b/.test(t);
  const informational = has(t, P5_WORDS) || has(sender, ["noreply", "notifikace", "newsletter"]);
  const shortThanks = has(t, THANKS) && !isQuestion && input.content.length < 220;

  let priority: PriorityLevel = 3;
  let reason = "Běžný požadavek klienta.";
  if (informational || shortThanks) {
    priority = 5;
    reason = "Informativní zpráva bez nutnosti reakce.";
  } else if (has(t, P1_WORDS)) {
    priority = 1;
    reason = "Zpráva obsahuje naléhavý problém, který je potřeba řešit ještě dnes.";
  } else if (has(t, P2_WORDS)) {
    priority = 2;
    reason = "Zpráva zmiňuje blízký termín nebo čekajícího klienta.";
  } else if (!isQuestion) {
    priority = 4;
    reason = "Bez zjevného termínu a bez přímého dotazu.";
  }

  const nearest = deadlines[0];
  if (nearest && priority > 1) {
    const hours = (nearest.date.getTime() - now.getTime()) / 3_600_000;
    if (hours <= 24) {
      priority = 1;
      reason = `Termín ${nearest.label.toLowerCase()} – je potřeba jednat dnes.`;
    } else if (hours <= 48 && priority > 2) {
      priority = 2;
      reason = `Termín ${nearest.label.toLowerCase()} – do 48 hodin.`;
    }
  }

  let sentiment: MessageAnalysisRaw["sentiment"] = "neutral";
  if (priority === 1 && has(t, P1_WORDS)) sentiment = "urgent";
  else if (has(t, NEGATIVE)) sentiment = "negative";
  else if (/\b(nevim|obav|nejasn|bojim|proc)\b/.test(t)) sentiment = "concerned";
  else if (has(t, POSITIVE)) sentiment = "positive";

  const topicLabels = topics.map((x) => x.label).slice(0, 4);
  const mainTopic = topics[0]?.label ?? null;
  const intent = informational
    ? "Informační zpráva"
    : has(t, ["presunout", "zmenit termin"])
      ? "Změna termínu schůzky"
      : has(t, ["pojistna udalost", "skoda", "vytopil", "nehod"])
        ? "Nahlášení pojistné události"
        : isQuestion
          ? `Dotaz${mainTopic ? ` – ${mainTopic}` : ""}`
          : `Informace${mainTopic ? ` – ${mainTopic}` : ""}`;

  const summary = summarize(input.content);
  const needsReply = !informational && !shortThanks;

  const assignee = pickAssignee(topics.map((x) => x.key), input.team ?? []);
  const futureDeadline = deadlines.find((d) => d.date.getTime() > now.getTime() + 30 * 60_000)?.date ?? null;
  const endOfToday = fromLocalDateTime(`${dayKey(now)}T17:00`)!;
  const taskDeadline =
    futureDeadline ??
    (priority <= 1
      ? endOfToday.getTime() > now.getTime() + 60 * 60_000
        ? endOfToday
        : new Date(Math.ceil((now.getTime() + 2 * 3_600_000) / 1_800_000) * 1_800_000)
      : priority === 2
        ? fromLocalDateTime(`${dayKey(addDays(now, 2))}T12:00`)
        : null);
  const who = input.senderName ?? "klientovi";
  const tasks: MessageAnalysisRaw["tasks"] = needsReply
    ? [
        {
          title: `Odpovědět: ${input.subject ? input.subject.slice(0, 80) : `${intent} (${who})`}`,
          description: summary,
          deadline: taskDeadline ? taskDeadline.toISOString() : null,
          priority,
          suggestedAssigneeId: assignee,
        },
      ]
    : [];

  return {
    summary,
    intent,
    topics: topicLabels.length ? topicLabels : ["obecné"],
    sentiment,
    suggestedPriority: clampPriority(priority),
    priorityReason: reason,
    deadline: nearest ? nearest.date.toISOString() : null,
    deadlines: deadlines.slice(0, 5).map((d) => ({ date: d.date.toISOString(), label: d.label })),
    tasks,
    replies: buildReplies({ ...input, intent, needsReply, nearest: nearest?.date ?? null, topic: topics[0]?.key ?? null }),
    needsReply,
    clientName: input.senderName,
  };
}

function pickAssignee(topicKeys: string[], team: TeamMemberLite[]): string | null {
  const advisors = team.filter((m) => m.role === "ADVISOR");
  const match = (re: RegExp) => advisors.find((a) => re.test(normalizeForSearch(a.title ?? "")));
  for (const key of topicKeys) {
    const found =
      key === "tax"
        ? match(/dan/)
        : key === "mortgage"
          ? match(/hypote|uver/)
          : key === "insurance" || key === "investment" || key === "pension" || key === "savings"
            ? match(/pojist|invest|financni/)
            : undefined;
    if (found) return found.id;
  }
  return null;
}

function buildReplies(input: HeuristicInput & { intent: string; needsReply: boolean; nearest: Date | null; topic: string | null }) {
  if (!input.needsReply) return [{ label: "Bez odpovědi", text: "Na tuto zprávu není potřeba odpovídat." }];
  const isEmail = input.channel === "EMAIL";
  const signature = input.signature?.trim() || "S pozdravem";
  const hello = isEmail ? "Dobrý den,\n\n" : "Dobrý den, ";
  const bye = isEmail ? `\n\n${signature}` : "";
  const when = input.nearest
    ? `${formatDate(input.nearest)}${localMinutes(input.nearest) ? ` v ${formatTime(input.nearest)}` : ""}`
    : null;
  const topicLine: Record<string, string> = {
    mortgage: "Vaši žádost ohledně hypotéky jsme převzali a připravíme podklady.",
    insurance: "Vaši záležitost s pojištěním řešíme přednostně a ozveme se s dalším postupem.",
    investment: "Na Váš dotaz k investicím se podíváme a pošleme Vám vysvětlení.",
    tax: "Daňovou otázku prověří náš daňový poradce.",
    pension: "Podklady k penzijnímu spoření připravíme.",
    savings: "Připravíme Vám srovnání vhodných variant spoření.",
    meeting: when ? `Termín ${when} potvrzujeme.` : "Rádi se s Vámi sejdeme – navrhněte prosím termín, který Vám vyhovuje.",
    documents: "Požadované dokumenty připravíme a pošleme.",
  };
  const line = (input.topic && topicLine[input.topic]) || "Děkujeme za zprávu, budeme se jí věnovat.";
  return [
    { label: "Potvrdit přijetí", text: `${hello}děkujeme za Vaši zprávu. ${line}${isEmail ? "" : " Ozveme se co nejdříve."}${bye}` },
    {
      label: "Navrhnout hovor",
      text: `${hello}děkujeme za zprávu. Bylo by možné si krátce zavolat? Navrhuji ${formatDate(addDays(new Date(), 1))} dopoledne – vyhovovalo by Vám to?${bye}`,
    },
    { label: "Stručně", text: isEmail ? `Dobrý den,\n\nzprávu jsme přijali a ozveme se do 24 hodin.\n\n${signature}` : "Dobrý den, děkujeme, ozveme se do 24 hodin." },
  ];
}

/** Rewrite a draft offline (used by "Upravit návrh" when AI is unavailable). */
export function heuristicDraft(original: { channel: string; content: string; senderName: string | null }, instruction?: string, signature?: string): string {
  const isEmail = original.channel === "EMAIL";
  const ask = instruction?.trim() ? ` (${instruction.trim()})` : "";
  return isEmail
    ? `Dobrý den,\n\nděkujeme za Vaši zprávu. Vaší záležitosti se věnujeme a ozveme se s dalším postupem${ask}.\n\n${signature?.trim() || "S pozdravem"}`
    : `Dobrý den, děkujeme za zprávu, ozveme se co nejdříve${ask}.`;
}
