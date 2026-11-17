import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { withSystem } from "@/server/db";
import { rateLimit, clientIp } from "@/server/rate-limit";
import { parseWhatsAppPayload, verifyWhatsAppSignature, type WhatsAppWebhookPayload } from "@/server/integrations/whatsapp";
import { ingestMessages } from "@/server/integrations/ingest";
import { safeEqual } from "@/server/crypto";

export const dynamic = "force-dynamic";

/** Meta webhook verification handshake. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const token = p.get("hub.verify_token") ?? "";
  if (p.get("hub.mode") === "subscribe" && env.whatsapp.verifyToken && safeEqual(token, env.whatsapp.verifyToken)) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Inbound WhatsApp Business messages → unified inbox. */
export async function POST(req: NextRequest) {
  const rl = await rateLimit(`webhook:whatsapp:${clientIp(req.headers)}`, 600, 60);
  if (!rl.ok) return new Response("Too Many Requests", { status: 429 });

  const raw = await req.text();
  if (env.whatsapp.appSecret) {
    if (!verifyWhatsAppSignature(raw, req.headers.get("x-hub-signature-256"), env.whatsapp.appSecret)) {
      return new Response("Invalid signature", { status: 401 });
    }
  } else if (env.isProduction) {
    return new Response("WHATSAPP_APP_SECRET is not configured", { status: 503 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(raw) as WhatsAppWebhookPayload;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  let created = 0;
  for (const group of parseWhatsAppPayload(payload)) {
    const integration = await withSystem((db) =>
      db.integration.findFirst({
        where: { type: "WHATSAPP", status: { in: ["ACTIVE", "PENDING"] }, config: { path: ["phoneNumberId"], equals: group.phoneNumberId } },
        select: { id: true, teamId: true, userId: true },
      }),
    );
    if (!integration) {
      console.warn(`[whatsapp] no integration for phone_number_id ${group.phoneNumberId} – ${group.messages.length} message(s) ignored`);
      continue;
    }
    const result = await ingestMessages(integration, group.messages);
    created += result.created.length;
    await withSystem((db) => db.integration.update({ where: { id: integration.id }, data: { lastSyncAt: new Date() } }));
  }
  // Always 200 so Meta does not retry already-processed deliveries.
  return NextResponse.json({ ok: true, created });
}
