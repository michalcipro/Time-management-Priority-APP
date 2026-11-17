import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { env } from "@/server/env";
import { withSystem } from "@/server/db";
import { sha256 } from "@/server/crypto";
import { rateLimit, clientIp } from "@/server/rate-limit";
import { parseShortcutPayload, parseTwilioPayload, verifyTwilioSignature } from "@/server/integrations/sms";
import { ingestMessages } from "@/server/integrations/ingest";

export const dynamic = "force-dynamic";

/**
 * SMS / iMessage inbound webhook.
 *  - Apple Shortcuts: POST JSON with `Authorization: Bearer <token>`
 *  - Twilio:          POST form data to `/api/webhooks/sms?token=<token>`
 */
export async function POST(req: NextRequest) {
  const rl = await rateLimit(`webhook:sms:${clientIp(req.headers)}`, 120, 60);
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const token = bearer || req.nextUrl.searchParams.get("token") || "";
  if (token.length < 16) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const integration = await withSystem((db) =>
    db.integration.findFirst({ where: { webhookTokenHash: sha256(token), type: "SMS", status: "ACTIVE" }, select: { id: true, teamId: true, userId: true } }),
  );
  if (!integration) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const contentType = req.headers.get("content-type") ?? "";
  const isTwilio = contentType.includes("application/x-www-form-urlencoded");
  try {
    let message;
    if (isTwilio) {
      const raw = await req.text();
      const form = new URLSearchParams(raw);
      if (env.twilio.authToken) {
        const url = `${env.appUrl}${req.nextUrl.pathname}${req.nextUrl.search}`;
        if (!verifyTwilioSignature(url, form, req.headers.get("x-twilio-signature"), env.twilio.authToken)) {
          return new Response("Invalid signature", { status: 401 });
        }
      }
      message = parseTwilioPayload(form);
    } else {
      message = parseShortcutPayload(await req.json());
    }
    const result = await ingestMessages(integration, [message]);
    await withSystem((db) => db.integration.update({ where: { id: integration.id }, data: { lastSyncAt: new Date(), lastError: null } }));
    if (isTwilio) return new Response("<Response/>", { headers: { "Content-Type": "text/xml" } });
    return NextResponse.json({ ok: true, created: result.created.length, duplicate: result.created.length === 0 });
  } catch (err) {
    const message = err instanceof ZodError ? "Neplatný formát: očekáváno { from, text }" : (err as Error).message;
    return NextResponse.json({ error: "bad_request", message }, { status: 400 });
  }
}
