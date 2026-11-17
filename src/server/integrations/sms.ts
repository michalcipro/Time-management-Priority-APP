import { z } from "zod";
import { hmacSha1Base64, safeEqual } from "../crypto";
import type { NormalizedMessage } from "./types";

/**
 * SMS / iMessage inbound webhook.
 *
 * 1) Apple Shortcuts / custom forwarders – JSON:
 *    { "from": "+420…", "fromName": "Jana", "text": "…", "receivedAt": "ISO", "channel": "sms"|"imessage", "id": "…" }
 * 2) Twilio (managed SMS API) – application/x-www-form-urlencoded with From, To, Body, MessageSid.
 */

export const shortcutPayloadSchema = z.object({
  from: z.string().trim().min(3).max(64),
  fromName: z.string().trim().max(120).optional().nullable(),
  text: z.string().max(20_000).optional(),
  body: z.string().max(20_000).optional(),
  message: z.string().max(20_000).optional(),
  receivedAt: z.string().optional().nullable(),
  channel: z.enum(["sms", "imessage", "SMS", "IMESSAGE"]).optional(),
  id: z.string().max(200).optional().nullable(),
});

export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase(); // iMessage can use an Apple ID e-mail
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.length === 9) return `+420${digits}`; // Czech local number
  return digits;
}

function fingerprint(parts: string[]): string {
  let h = 0;
  for (const ch of parts.join("|")) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h).toString(36);
}

export function parseShortcutPayload(raw: unknown, now = new Date()): NormalizedMessage {
  const p = shortcutPayloadSchema.parse(raw);
  const text = (p.text ?? p.body ?? p.message ?? "").trim();
  if (!text) throw new Error("Chybí text zprávy (text/body/message).");
  const contact = normalizePhone(p.from);
  const parsedDate = p.receivedAt ? new Date(p.receivedAt) : now;
  const receivedAt = Number.isNaN(parsedDate.getTime()) ? now : parsedDate;
  const channel = p.channel?.toLowerCase() === "imessage" ? "IMESSAGE" : "SMS";
  return {
    channel,
    externalId: p.id?.trim() || `sc-${fingerprint([contact, text, String(Math.floor(receivedAt.getTime() / 60_000))])}`,
    threadKey: `${channel.toLowerCase()}:${contact}`,
    senderName: p.fromName?.trim() || null,
    senderContact: contact,
    content: text,
    receivedAt,
    metadata: { source: "shortcuts" },
  };
}

export function parseTwilioPayload(form: URLSearchParams, now = new Date()): NormalizedMessage {
  const from = form.get("From");
  const body = form.get("Body");
  const sid = form.get("MessageSid") ?? form.get("SmsSid");
  if (!from || body === null || !sid) throw new Error("Neplatný Twilio požadavek.");
  const media = Number(form.get("NumMedia") ?? 0);
  const contact = normalizePhone(from);
  return {
    channel: "SMS",
    externalId: sid,
    threadKey: `sms:${contact}`,
    senderName: null,
    senderContact: contact,
    recipient: form.get("To"),
    content: body + (media > 0 ? `\n[${media} příloh(y) MMS]` : ""),
    receivedAt: now,
    metadata: { source: "twilio" },
  };
}

/** Twilio request validation: base64(HMAC-SHA1(authToken, url + sorted key/value pairs)). */
export function verifyTwilioSignature(url: string, form: URLSearchParams, signature: string | null, authToken: string): boolean {
  if (!signature) return false;
  const keys = [...new Set(form.keys())].sort();
  const data = url + keys.map((k) => k + (form.get(k) ?? "")).join("");
  return safeEqual(hmacSha1Base64(authToken, data), signature);
}

export async function sendTwilioSms(opts: { accountSid: string; authToken: string; from: string; to: string; text: string }): Promise<string | null> {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${opts.accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${opts.accountSid}:${opts.authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: opts.from, To: opts.to, Body: opts.text }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok) throw new Error(`Twilio: ${json.message ?? res.statusText}`);
  return json.sid ?? null;
}
