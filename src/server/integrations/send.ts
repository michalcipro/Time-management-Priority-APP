import "server-only";
import type { Channel } from "@/generated/prisma/enums";
import { decryptJson } from "../crypto";
import { env, features } from "../env";
import { sendGmailReply } from "./google";
import { sendOutlookReply } from "./microsoft";
import { sendWhatsAppText } from "./whatsapp";
import { sendTwilioSms } from "./sms";

interface ReplyTarget {
  channel: Channel;
  senderContact: string;
  subject: string | null;
  externalId: string | null;
  metadata: unknown;
  integration: { id: string; type: string; status: string; credentials: string | null; displayName: string | null; config: unknown } | null;
}

/**
 * Deliver a human-approved reply through the original channel.
 * Returns `via: "manual"` when the channel cannot send (the reply is still recorded).
 */
export async function sendReplyViaChannel(target: ReplyTarget, text: string): Promise<{ externalId: string | null; via: string }> {
  const integration = target.integration;
  const active = integration?.status === "ACTIVE";

  if (target.channel === "EMAIL" && active && integration?.type === "GOOGLE") {
    return { externalId: await sendGmailReply(integration, target, text), via: "Gmail" };
  }
  if (target.channel === "EMAIL" && active && integration?.type === "MICROSOFT") {
    await sendOutlookReply(integration, target, text);
    return { externalId: null, via: "Outlook" };
  }
  if (target.channel === "WHATSAPP" && active && integration?.type === "WHATSAPP") {
    const creds = decryptJson<{ accessToken?: string }>(integration.credentials);
    const config = (integration.config ?? {}) as { phoneNumberId?: string };
    if (creds?.accessToken && config.phoneNumberId) {
      const id = await sendWhatsAppText({ apiVersion: env.whatsapp.apiVersion, phoneNumberId: config.phoneNumberId, accessToken: creds.accessToken, to: target.senderContact, text });
      return { externalId: id, via: "WhatsApp Business" };
    }
  }
  if (target.channel === "SMS" && features.twilio && env.twilio.fromNumber) {
    const id = await sendTwilioSms({ accountSid: env.twilio.accountSid!, authToken: env.twilio.authToken!, from: env.twilio.fromNumber, to: target.senderContact, text });
    return { externalId: id, via: "SMS (Twilio)" };
  }
  return { externalId: null, via: "manual" };
}

