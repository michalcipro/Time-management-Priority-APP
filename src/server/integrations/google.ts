import "server-only";
import { env } from "../env";
import { fetchJson, getAccessToken } from "./credentials";
import type { ExternalCalendarEvent, NormalizedMessage, OAuthCredentials } from "./types";

/**
 * Google: Gmail (read inbox, send replies) + Google Calendar (list/create events).
 * Plain REST calls – no heavy SDK needed.
 */

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
];

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const CALENDAR = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export function googleRedirectUri() {
  return `${env.appUrl}/api/integrations/google/callback`;
}

export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.google.clientId ?? "",
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<OAuthCredentials> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.google.clientId ?? "", client_secret: env.google.clientSecret ?? "", ...body }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Google token error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as TokenResponse;
  return { accessToken: json.access_token, refreshToken: json.refresh_token ?? null, expiresAt: Date.now() + json.expires_in * 1000, scope: json.scope };
}

export function exchangeGoogleCode(code: string) {
  return tokenRequest({ code, grant_type: "authorization_code", redirect_uri: googleRedirectUri() });
}

export function refreshGoogleToken(refreshToken: string) {
  return tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
}

export async function googleProfile(accessToken: string): Promise<{ email: string; historyId: string }> {
  const p = await fetchJson<{ emailAddress: string; historyId: string }>(`${GMAIL}/profile`, { token: accessToken });
  return { email: p.emailAddress, historyId: p.historyId };
}

// ─── Gmail ──────────────────────────────────────────────────────────────────

interface GmailHeader {
  name: string;
  value: string;
}
interface GmailPart {
  mimeType: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
}
interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  internalDate: string;
  snippet: string;
  payload: GmailPart;
}

const decodeB64 = (data: string) => Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractBody(part: GmailPart): { text: string | null; html: string | null; attachments: { name: string; size: number; mimeType: string }[] } {
  const out = { text: null as string | null, html: null as string | null, attachments: [] as { name: string; size: number; mimeType: string }[] };
  const walk = (p: GmailPart) => {
    if (p.filename && p.body?.attachmentId) {
      out.attachments.push({ name: p.filename, size: p.body.size ?? 0, mimeType: p.mimeType });
      return;
    }
    if (p.mimeType === "text/plain" && p.body?.data && !out.text) out.text = decodeB64(p.body.data);
    else if (p.mimeType === "text/html" && p.body?.data && !out.html) out.html = decodeB64(p.body.data);
    p.parts?.forEach(walk);
  };
  walk(part);
  return out;
}

/** Strip quoted history ("Dne … napsal:", "On … wrote:", "> …") from a reply body. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  const cut = lines.findIndex(
    (l) => /^(>|-----Original Message-----|-------- Původní zpráva --------)/.test(l.trim()) || /^(On|Dne)\s.+(wrote|napsal\(a\)|napsal|napsala):\s*$/.test(l.trim()),
  );
  return (cut > 0 ? lines.slice(0, cut) : lines).join("\n").trim();
}

function parseAddress(value: string): { name: string | null; email: string } {
  const m = /^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/.exec(value);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
  return { name: null, email: value.trim().toLowerCase() };
}

export function normalizeGmail(msg: GmailMessage, ownAddress: string): NormalizedMessage | null {
  const headers = new Map((msg.payload.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
  const from = parseAddress(headers.get("from") ?? "");
  if (!from.email || from.email === ownAddress.toLowerCase()) return null;
  const body = extractBody(msg.payload);
  const content = stripQuoted(body.text ?? (body.html ? htmlToText(body.html) : msg.snippet)) || msg.snippet;
  return {
    channel: "EMAIL",
    externalId: msg.id,
    threadKey: `gmail:${msg.threadId}`,
    senderName: from.name,
    senderContact: from.email,
    recipient: headers.get("to") ?? ownAddress,
    subject: headers.get("subject") ?? null,
    content: content.slice(0, 50_000),
    receivedAt: new Date(Number(msg.internalDate)),
    attachments: body.attachments,
    metadata: { gmailThreadId: msg.threadId, messageIdHeader: headers.get("message-id") ?? null, labels: msg.labelIds ?? [] },
  };
}

async function getGmailMessage(token: string, id: string): Promise<GmailMessage> {
  return fetchJson<GmailMessage>(`${GMAIL}/messages/${id}?format=full`, { token });
}

/** Fetch new inbox messages since the last historyId (or the last 3 days on first sync). */
export async function fetchNewGmail(
  integration: { id: string; credentials: string | null; syncCursor: string | null; displayName: string | null },
): Promise<{ messages: NormalizedMessage[]; cursor: string }> {
  const token = await getAccessToken(integration, refreshGoogleToken);
  const profile = await googleProfile(token);
  let ids: string[] = [];

  if (integration.syncCursor) {
    try {
      const history = await fetchJson<{ history?: { messagesAdded?: { message: { id: string; labelIds?: string[] } }[] }[] }>(
        `${GMAIL}/history?startHistoryId=${encodeURIComponent(integration.syncCursor)}&historyTypes=messageAdded&labelId=INBOX&maxResults=100`,
        { token },
      );
      ids = (history.history ?? []).flatMap((h) => (h.messagesAdded ?? []).map((a) => a.message.id));
    } catch {
      ids = []; // history expired → fall back to a time-based listing below
      integration.syncCursor = null;
    }
  }
  if (!integration.syncCursor) {
    const list = await fetchJson<{ messages?: { id: string }[] }>(
      `${GMAIL}/messages?q=${encodeURIComponent("in:inbox newer_than:3d -category:promotions -category:social")}&maxResults=50`,
      { token },
    );
    ids = (list.messages ?? []).map((m) => m.id);
  }

  const unique = [...new Set(ids)].slice(0, 100);
  const messages: NormalizedMessage[] = [];
  for (const id of unique) {
    try {
      const full = await getGmailMessage(token, id);
      if (!full.labelIds?.includes("INBOX")) continue;
      const n = normalizeGmail(full, profile.email);
      if (n) messages.push(n);
    } catch (err) {
      console.warn("[gmail] failed to load message", id, (err as Error).message);
    }
  }
  return { messages, cursor: profile.historyId };
}

function encodeHeader(value: string): string {
  return /[^\x20-\x7e]/.test(value) ? `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=` : value;
}

/** Send a reply in the same Gmail thread. */
export async function sendGmailReply(
  integration: { id: string; credentials: string | null; displayName: string | null },
  original: { senderContact: string; subject: string | null; metadata: unknown },
  text: string,
): Promise<string> {
  const token = await getAccessToken(integration, refreshGoogleToken);
  const meta = (original.metadata ?? {}) as { gmailThreadId?: string; messageIdHeader?: string | null };
  const subject = original.subject ? (/^re:/i.test(original.subject) ? original.subject : `Re: ${original.subject}`) : "Re:";
  const lines = [
    `To: ${original.senderContact}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    ...(meta.messageIdHeader ? [`In-Reply-To: ${meta.messageIdHeader}`, `References: ${meta.messageIdHeader}`] : []),
    "",
    Buffer.from(text, "utf8").toString("base64"),
  ];
  const raw = Buffer.from(lines.join("\r\n")).toString("base64url");
  const sent = await fetchJson<{ id: string }>(`${GMAIL}/messages/send`, {
    method: "POST",
    token,
    body: JSON.stringify({ raw, ...(meta.gmailThreadId ? { threadId: meta.gmailThreadId } : {}) }),
  });
  return sent.id;
}

// ─── Google Calendar ────────────────────────────────────────────────────────

interface GCalEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

export async function listGoogleEvents(integration: { id: string; credentials: string | null }, from: Date, to: Date): Promise<ExternalCalendarEvent[]> {
  const token = await getAccessToken(integration, refreshGoogleToken);
  const params = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250" });
  const res = await fetchJson<{ items?: GCalEvent[] }>(`${CALENDAR}?${params}`, { token });
  return (res.items ?? []).map((e) => ({
    id: e.id,
    title: e.summary ?? "(bez názvu)",
    start: new Date(e.start.dateTime ?? `${e.start.date}T00:00:00`),
    end: new Date(e.end.dateTime ?? `${e.end.date}T00:00:00`),
    allDay: Boolean(e.start.date),
    location: e.location ?? null,
    description: e.description ?? null,
  }));
}

export async function createGoogleEvent(
  integration: { id: string; credentials: string | null },
  event: { title: string; description?: string | null; location?: string | null; startAt: Date; endAt: Date; allDay: boolean },
  timeZone: string,
): Promise<string> {
  const token = await getAccessToken(integration, refreshGoogleToken);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const body = {
    summary: event.title,
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    start: event.allDay ? { date: day(event.startAt) } : { dateTime: event.startAt.toISOString(), timeZone },
    end: event.allDay ? { date: day(event.endAt) } : { dateTime: event.endAt.toISOString(), timeZone },
  };
  const created = await fetchJson<{ id: string }>(CALENDAR, { method: "POST", token, body: JSON.stringify(body) });
  return created.id;
}
