import "server-only";
import { env } from "../env";
import { fetchJson, getAccessToken } from "./credentials";
import { stripQuoted } from "./google";
import type { ExternalCalendarEvent, NormalizedMessage, OAuthCredentials } from "./types";

/**
 * Microsoft 365 via Microsoft Graph: Outlook inbox (read + reply) and calendar.
 */

export const MICROSOFT_SCOPES = ["openid", "email", "profile", "offline_access", "User.Read", "Mail.Read", "Mail.Send", "Calendars.ReadWrite"];
const GRAPH = "https://graph.microsoft.com/v1.0";

const authority = () => `https://login.microsoftonline.com/${env.microsoft.tenantId}/oauth2/v2.0`;

export function microsoftRedirectUri() {
  return `${env.appUrl}/api/integrations/microsoft/callback`;
}

export function microsoftAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.microsoft.clientId ?? "",
    response_type: "code",
    redirect_uri: microsoftRedirectUri(),
    response_mode: "query",
    scope: MICROSOFT_SCOPES.join(" "),
    prompt: "select_account",
    state,
  });
  return `${authority()}/authorize?${params}`;
}

async function tokenRequest(body: Record<string, string>): Promise<OAuthCredentials> {
  const res = await fetch(`${authority()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.microsoft.clientId ?? "",
      client_secret: env.microsoft.clientSecret ?? "",
      scope: MICROSOFT_SCOPES.join(" "),
      ...body,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Microsoft token error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
  return { accessToken: json.access_token, refreshToken: json.refresh_token ?? null, expiresAt: Date.now() + json.expires_in * 1000, scope: json.scope };
}

export function exchangeMicrosoftCode(code: string) {
  return tokenRequest({ code, grant_type: "authorization_code", redirect_uri: microsoftRedirectUri() });
}

export function refreshMicrosoftToken(refreshToken: string) {
  return tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
}

export async function microsoftProfile(accessToken: string): Promise<{ email: string; name: string | null }> {
  const me = await fetchJson<{ mail?: string | null; userPrincipalName: string; displayName?: string }>(`${GRAPH}/me?$select=mail,userPrincipalName,displayName`, {
    token: accessToken,
  });
  return { email: (me.mail ?? me.userPrincipalName).toLowerCase(), name: me.displayName ?? null };
}

interface GraphMessage {
  id: string;
  conversationId: string;
  subject: string | null;
  receivedDateTime: string;
  bodyPreview: string;
  body?: { contentType: string; content: string };
  from?: { emailAddress: { name?: string; address: string } };
  toRecipients?: { emailAddress: { address: string } }[];
  hasAttachments?: boolean;
  internetMessageId?: string;
}

export function normalizeGraphMessage(m: GraphMessage, ownAddress: string): NormalizedMessage | null {
  const from = m.from?.emailAddress;
  if (!from?.address || from.address.toLowerCase() === ownAddress.toLowerCase()) return null;
  const content = stripQuoted(m.body?.content ?? m.bodyPreview) || m.bodyPreview;
  return {
    channel: "EMAIL",
    externalId: m.id,
    threadKey: `outlook:${m.conversationId}`,
    senderName: from.name ?? null,
    senderContact: from.address.toLowerCase(),
    recipient: m.toRecipients?.map((r) => r.emailAddress.address).join(", ") ?? ownAddress,
    subject: m.subject,
    content: content.slice(0, 50_000),
    receivedAt: new Date(m.receivedDateTime),
    attachments: m.hasAttachments ? [{ name: "Příloha (Outlook)", size: 0, mimeType: "application/octet-stream" }] : [],
    metadata: { graphId: m.id, conversationId: m.conversationId, internetMessageId: m.internetMessageId ?? null },
  };
}

/** Fetch inbox messages received after the cursor (ISO timestamp); first sync = last 3 days. */
export async function fetchNewOutlook(
  integration: { id: string; credentials: string | null; syncCursor: string | null },
): Promise<{ messages: NormalizedMessage[]; cursor: string }> {
  const token = await getAccessToken(integration, refreshMicrosoftToken);
  const profile = await microsoftProfile(token);
  const since = integration.syncCursor ?? new Date(Date.now() - 3 * 24 * 3_600_000).toISOString();
  const params = new URLSearchParams({
    $top: "50",
    $orderby: "receivedDateTime asc",
    $filter: `receivedDateTime gt ${since}`,
    $select: "id,conversationId,subject,receivedDateTime,bodyPreview,body,from,toRecipients,hasAttachments,internetMessageId",
  });
  const res = await fetchJson<{ value: GraphMessage[] }>(`${GRAPH}/me/mailFolders/inbox/messages?${params}`, {
    token,
    headers: { Prefer: 'outlook.body-content-type="text"' },
  });
  const messages = res.value.map((m) => normalizeGraphMessage(m, profile.email)).filter((m): m is NormalizedMessage => m !== null);
  const last = res.value.at(-1)?.receivedDateTime ?? since;
  return { messages, cursor: last };
}

export async function sendOutlookReply(integration: { id: string; credentials: string | null }, original: { externalId: string | null }, text: string): Promise<string | null> {
  if (!original.externalId) throw new Error("Chybí ID původní zprávy v Outlooku.");
  const token = await getAccessToken(integration, refreshMicrosoftToken);
  await fetchJson(`${GRAPH}/me/messages/${encodeURIComponent(original.externalId)}/reply`, {
    method: "POST",
    token,
    body: JSON.stringify({ comment: text }),
  });
  return null; // Graph's reply endpoint returns 202 without the new message id
}

export async function listOutlookEvents(integration: { id: string; credentials: string | null }, from: Date, to: Date): Promise<ExternalCalendarEvent[]> {
  const token = await getAccessToken(integration, refreshMicrosoftToken);
  const params = new URLSearchParams({ startDateTime: from.toISOString(), endDateTime: to.toISOString(), $top: "250", $orderby: "start/dateTime" });
  const res = await fetchJson<{
    value: { id: string; subject: string; isAllDay: boolean; start: { dateTime: string }; end: { dateTime: string }; location?: { displayName?: string }; bodyPreview?: string }[];
  }>(`${GRAPH}/me/calendarView?${params}`, { token, headers: { Prefer: 'outlook.timezone="UTC"' } });
  return res.value.map((e) => ({
    id: e.id,
    title: e.subject || "(bez názvu)",
    start: new Date(e.start.dateTime + "Z"),
    end: new Date(e.end.dateTime + "Z"),
    allDay: e.isAllDay,
    location: e.location?.displayName || null,
    description: e.bodyPreview || null,
  }));
}

export async function createOutlookEvent(
  integration: { id: string; credentials: string | null },
  event: { title: string; description?: string | null; location?: string | null; startAt: Date; endAt: Date; allDay: boolean },
): Promise<string> {
  const token = await getAccessToken(integration, refreshMicrosoftToken);
  const toGraph = (d: Date) => ({ dateTime: d.toISOString().replace("Z", ""), timeZone: "UTC" });
  const created = await fetchJson<{ id: string }>(`${GRAPH}/me/events`, {
    method: "POST",
    token,
    body: JSON.stringify({
      subject: event.title,
      body: { contentType: "text", content: event.description ?? "" },
      start: toGraph(event.startAt),
      end: toGraph(event.endAt),
      isAllDay: event.allDay,
      location: event.location ? { displayName: event.location } : undefined,
    }),
  });
  return created.id;
}
