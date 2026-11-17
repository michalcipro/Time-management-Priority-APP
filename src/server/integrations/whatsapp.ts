import { hmacSha256, safeEqual } from "../crypto";
import type { NormalizedMessage } from "./types";

/**
 * WhatsApp Business Cloud API: webhook verification, signature check, payload
 * normalisation and sending text replies.
 */

export interface WhatsAppWebhookPayload {
  object?: string;
  entry?: {
    id?: string;
    changes?: {
      field?: string;
      value?: {
        metadata?: { display_phone_number?: string; phone_number_id?: string };
        contacts?: { profile?: { name?: string }; wa_id?: string }[];
        messages?: {
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body?: string };
          image?: { caption?: string; mime_type?: string };
          document?: { filename?: string; caption?: string; mime_type?: string };
          audio?: { mime_type?: string };
          video?: { caption?: string; mime_type?: string };
          location?: { latitude?: number; longitude?: number; name?: string; address?: string };
          button?: { text?: string };
          interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
        }[];
      };
    }[];
  }[];
}

/** Validate `X-Hub-Signature-256: sha256=<hex>` against the raw body. */
export function verifyWhatsAppSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = hmacSha256(appSecret, rawBody, "hex");
  return safeEqual(header.slice(7), expected);
}

type WAValue = NonNullable<NonNullable<NonNullable<WhatsAppWebhookPayload["entry"]>[number]["changes"]>[number]["value"]>;
type WAMessage = NonNullable<WAValue["messages"]>[number];

function describeNonText(m: WAMessage): string {
  switch (m.type) {
    case "image":
      return `[Obrázek]${m.image?.caption ? ` ${m.image.caption}` : ""}`;
    case "document":
      return `[Dokument${m.document?.filename ? `: ${m.document.filename}` : ""}]${m.document?.caption ? ` ${m.document.caption}` : ""}`;
    case "audio":
      return "[Hlasová zpráva]";
    case "video":
      return `[Video]${m.video?.caption ? ` ${m.video.caption}` : ""}`;
    case "location":
      return `[Poloha] ${m.location?.name ?? ""} ${m.location?.address ?? ""}`.trim();
    case "button":
      return m.button?.text ?? "[Tlačítko]";
    case "interactive":
      return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "[Interaktivní odpověď]";
    default:
      return `[${m.type}]`;
  }
}

/** Group inbound messages by the receiving phone number id. */
export function parseWhatsAppPayload(payload: WhatsAppWebhookPayload): { phoneNumberId: string; messages: NormalizedMessage[] }[] {
  const out = new Map<string, NormalizedMessage[]>();
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages" || !change.value?.messages?.length) continue;
      const phoneNumberId = change.value.metadata?.phone_number_id ?? "unknown";
      const names = new Map((change.value.contacts ?? []).map((c) => [c.wa_id ?? "", c.profile?.name ?? null]));
      const list = out.get(phoneNumberId) ?? [];
      for (const m of change.value.messages) {
        const contact = m.from.startsWith("+") ? m.from : `+${m.from}`;
        const attachments = m.type === "document" || m.type === "image" ? [{ name: m.document?.filename ?? `${m.type}`, size: 0, mimeType: m.document?.mime_type ?? m.image?.mime_type ?? "application/octet-stream" }] : [];
        list.push({
          channel: "WHATSAPP",
          externalId: m.id,
          threadKey: `whatsapp:${contact}`,
          senderName: names.get(m.from) ?? null,
          senderContact: contact,
          recipient: change.value.metadata?.display_phone_number ?? null,
          content: m.type === "text" ? m.text?.body ?? "" : describeNonText(m),
          receivedAt: new Date(Number(m.timestamp) * 1000),
          attachments,
          metadata: { waType: m.type, phoneNumberId },
        });
      }
      out.set(phoneNumberId, list);
    }
  }
  return [...out.entries()].map(([phoneNumberId, messages]) => ({ phoneNumberId, messages }));
}

export async function sendWhatsAppText(opts: { apiVersion: string; phoneNumberId: string; accessToken: string; to: string; text: string }): Promise<string | null> {
  const res = await fetch(`https://graph.facebook.com/${opts.apiVersion}/${opts.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: opts.to.replace(/^\+/, ""), type: "text", text: { preview_url: false, body: opts.text } }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
  if (!res.ok) {
    const hint = json.error?.code === 131047 ? " (mimo 24hodinové okno – je potřeba schválená šablona)" : "";
    throw new Error(`WhatsApp API: ${json.error?.message ?? res.statusText}${hint}`);
  }
  return json.messages?.[0]?.id ?? null;
}
