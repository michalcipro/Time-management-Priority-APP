/**
 * Czech date/time formatting with an explicit timezone, so server and client
 * render identical strings.
 */

export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Europe/Prague";
const LOCALE = "cs-CZ";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type DateInput = Date | string | number;

export function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(options: Intl.DateTimeFormatOptions, tz = APP_TIMEZONE): Intl.DateTimeFormat {
  const key = tz + JSON.stringify(options);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(LOCALE, { timeZone: tz, ...options });
    fmtCache.set(key, f);
  }
  return f;
}

/** YYYY-MM-DD of the given instant in the app timezone. */
export function dayKey(value: DateInput, tz = APP_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(toDate(value));
  return parts; // en-CA → 2026-11-17
}

/** Whole calendar days between two instants in the app timezone (b - a). */
export function calendarDaysBetween(a: DateInput, b: DateInput, tz = APP_TIMEZONE): number {
  const ka = Date.parse(dayKey(a, tz) + "T00:00:00Z");
  const kb = Date.parse(dayKey(b, tz) + "T00:00:00Z");
  return Math.round((kb - ka) / DAY);
}

/** Minutes since local midnight (app timezone). */
export function localMinutes(value: DateInput, tz = APP_TIMEZONE): number {
  const parts = fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, tz).formatToParts(toDate(value));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/** Local hour (0–23) in the app timezone. */
export function localHour(value: DateInput, tz = APP_TIMEZONE): number {
  return Math.floor(localMinutes(value, tz) / 60);
}

export function formatDate(value: DateInput): string {
  return fmt({ day: "numeric", month: "numeric", year: "numeric" }).format(toDate(value));
}

export function formatDateShort(value: DateInput): string {
  return fmt({ day: "numeric", month: "numeric" }).format(toDate(value));
}

export function formatTime(value: DateInput): string {
  return fmt({ hour: "2-digit", minute: "2-digit" }).format(toDate(value));
}

export function formatDateTime(value: DateInput): string {
  return `${formatDate(value)} ${formatTime(value)}`;
}

export function formatWeekday(value: DateInput, style: "short" | "long" = "short"): string {
  const w = fmt({ weekday: style }).format(toDate(value));
  return w.charAt(0).toUpperCase() + w.slice(1);
}

export function formatLongDate(value: DateInput): string {
  const s = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(toDate(value));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatMonthYear(value: DateInput): string {
  const s = fmt({ month: "long", year: "numeric" }).format(toDate(value));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Compact timestamp for lists: "14:05", "Včera", "Po", "12. 11." */
export function formatListTime(value: DateInput, now: DateInput = new Date()): string {
  const days = calendarDaysBetween(value, now);
  if (days <= 0) return formatTime(value);
  if (days === 1) return "Včera";
  if (days < 7) return formatWeekday(value);
  return formatDateShort(value);
}

export function timeAgo(value: DateInput, now: DateInput = new Date()): string {
  const diff = toDate(now).getTime() - toDate(value).getTime();
  if (diff < MINUTE) return "právě teď";
  if (diff < HOUR) return `před ${Math.floor(diff / MINUTE)} min`;
  if (diff < DAY) return `před ${Math.floor(diff / HOUR)} h`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return "včera";
  if (days < 30) return `před ${days} dny`;
  return formatDate(value);
}

export type DeadlineTone = "overdue" | "today" | "soon" | "normal";

export interface DeadlineInfo {
  label: string;
  remaining: string;
  tone: DeadlineTone;
  daysLeft: number;
}

/** Deadline chip info: "Dnes 12:00" / "Zítra" / "Pá 23. 5." + "Zbývá 5 dní". */
export function deadlineInfo(deadline: DateInput, now: DateInput = new Date()): DeadlineInfo {
  const d = toDate(deadline);
  const n = toDate(now);
  const days = calendarDaysBetween(n, d);
  const msLeft = d.getTime() - n.getTime();
  const hasTime = localMinutes(d) !== 0 && localMinutes(d) !== 23 * 60 + 59;

  let label: string;
  if (msLeft < 0 && days < 0) label = `Po termínu · ${formatDateShort(d)}`;
  else if (days === 0) label = hasTime ? `Dnes ${formatTime(d)}` : "Dnes";
  else if (days === 1) label = hasTime ? `Zítra ${formatTime(d)}` : "Zítra";
  else if (days < 7) label = `${formatWeekday(d)} ${formatDateShort(d)}`;
  else label = formatDate(d);

  let remaining: string;
  if (msLeft < 0) {
    const overdue = Math.max(1, Math.floor(-msLeft / DAY));
    remaining = msLeft > -DAY ? "Po termínu" : `Po termínu ${overdue} ${overdue === 1 ? "den" : overdue < 5 ? "dny" : "dní"}`;
  } else if (msLeft < DAY) {
    const h = Math.max(1, Math.round(msLeft / HOUR));
    remaining = `Zbývá ${h} h`;
  } else {
    const dl = Math.max(1, days);
    remaining = `Zbývá ${dl} ${dl === 1 ? "den" : dl < 5 ? "dny" : "dní"}`;
  }

  const tone: DeadlineTone = msLeft < 0 ? "overdue" : days <= 0 ? "today" : days <= 2 ? "soon" : "normal";
  return { label, remaining, tone, daysLeft: days };
}

/** Value for <input type="datetime-local"> in the app timezone. */
export function toDateTimeLocalValue(value: DateInput | null | undefined): string {
  if (!value) return "";
  const d = toDate(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Offset (minutes) of the app timezone from UTC at a given instant. */
export function tzOffsetMinutes(at: Date, tz = APP_TIMEZONE): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / MINUTE);
}

/** Parse "YYYY-MM-DDTHH:mm" (app-local wall time) into a UTC Date. */
export function fromLocalDateTime(value: string, tz = APP_TIMEZONE): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00"] = m;
  const guess = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)));
  const offset = tzOffsetMinutes(guess, tz);
  const result = new Date(guess.getTime() - offset * MINUTE);
  // Re-check around DST transitions.
  const offset2 = tzOffsetMinutes(result, tz);
  return offset2 === offset ? result : new Date(guess.getTime() - offset2 * MINUTE);
}

/** Start of the local day (app timezone) containing `value`, as a UTC Date. */
export function startOfLocalDay(value: DateInput, tz = APP_TIMEZONE): Date {
  return fromLocalDateTime(dayKey(value, tz) + "T00:00", tz)!;
}

export function addDays(value: DateInput, days: number): Date {
  return new Date(toDate(value).getTime() + days * DAY);
}

/** End of the local day (23:59) N days from now – convenient default deadline. */
export function endOfLocalDayInDays(days: number, now: DateInput = new Date(), tz = APP_TIMEZONE): Date {
  const key = dayKey(addDays(now, days), tz);
  return fromLocalDateTime(key + "T23:59", tz)!;
}
