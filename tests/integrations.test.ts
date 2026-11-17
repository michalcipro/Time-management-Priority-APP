import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { normalizePhone, parseShortcutPayload, parseTwilioPayload, verifyTwilioSignature } from "@/server/integrations/sms";
import { parseWhatsAppPayload, verifyWhatsAppSignature } from "@/server/integrations/whatsapp";
import { stripQuoted } from "@/server/integrations/google";
import { buildIcs } from "@/server/ics";

describe("SMS / iMessage webhook", () => {
  it("normalises Czech phone numbers", () => {
    expect(normalizePhone("777 888 999")).toBe("+420777888999");
    expect(normalizePhone("00420 603 555 210")).toBe("+420603555210");
    expect(normalizePhone("+421 905 123 456")).toBe("+421905123456");
    expect(normalizePhone("Jana@iCloud.com")).toBe("jana@icloud.com");
  });

  it("parses the Apple Shortcuts JSON payload with a stable fallback id", () => {
    const now = new Date("2026-11-17T10:00:00Z");
    const a = parseShortcutPayload({ from: "777888999", fromName: "Tereza", text: "Ahoj", channel: "imessage" }, now);
    const b = parseShortcutPayload({ from: "777888999", fromName: "Tereza", text: "Ahoj", channel: "imessage" }, now);
    expect(a.channel).toBe("IMESSAGE");
    expect(a.senderContact).toBe("+420777888999");
    expect(a.threadKey).toBe("imessage:+420777888999");
    expect(a.externalId).toBe(b.externalId); // duplicates are de-duplicated on ingest
    expect(() => parseShortcutPayload({ from: "777888999" })).toThrow();
  });

  it("parses Twilio form posts and validates their signature", () => {
    const form = new URLSearchParams({ From: "+420777123456", To: "+420800100200", Body: "Dobrý den", MessageSid: "SM123" });
    const msg = parseTwilioPayload(form);
    expect(msg).toMatchObject({ channel: "SMS", externalId: "SM123", senderContact: "+420777123456", content: "Dobrý den" });

    const url = "https://app.example.com/api/webhooks/sms?token=abc";
    const data = url + [...form.keys()].sort().map((k) => k + form.get(k)).join("");
    const signature = createHmac("sha1", "twilio-secret").update(data).digest("base64");
    expect(verifyTwilioSignature(url, form, signature, "twilio-secret")).toBe(true);
    expect(verifyTwilioSignature(url, form, signature, "wrong")).toBe(false);
  });
});

describe("WhatsApp Cloud API webhook", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { display_phone_number: "420602100200", phone_number_id: "PNID" },
              contacts: [{ profile: { name: "Robert Klein" }, wa_id: "420724888301" }],
              messages: [
                { from: "420724888301", id: "wamid.1", timestamp: "1763370000", type: "text", text: { body: "Pošlete mi report" } },
                { from: "420724888301", id: "wamid.2", timestamp: "1763370060", type: "document", document: { filename: "smlouva.pdf", mime_type: "application/pdf" } },
              ],
            },
          },
        ],
      },
    ],
  };

  it("normalises messages grouped by phone number id", () => {
    const [group] = parseWhatsAppPayload(payload);
    expect(group.phoneNumberId).toBe("PNID");
    expect(group.messages[0]).toMatchObject({ channel: "WHATSAPP", senderName: "Robert Klein", senderContact: "+420724888301", content: "Pošlete mi report", threadKey: "whatsapp:+420724888301" });
    expect(group.messages[1].content).toBe("[Dokument: smlouva.pdf]");
    expect(group.messages[1].attachments?.[0].name).toBe("smlouva.pdf");
  });

  it("verifies X-Hub-Signature-256", () => {
    const raw = JSON.stringify(payload);
    const sig = "sha256=" + createHmac("sha256", "app-secret").update(raw).digest("hex");
    expect(verifyWhatsAppSignature(raw, sig, "app-secret")).toBe(true);
    expect(verifyWhatsAppSignature(raw + " ", sig, "app-secret")).toBe(false);
    expect(verifyWhatsAppSignature(raw, null, "app-secret")).toBe(false);
  });
});

describe("e-mail helpers", () => {
  it("strips quoted reply history", () => {
    expect(stripQuoted("Díky, platí.\n\nDne 12. 11. 2026 Martin napsal:\n> Dobrý den")).toBe("Díky, platí.");
    expect(stripQuoted("Odpověď\n> citace")).toBe("Odpověď");
  });
});

describe("ICS feed", () => {
  it("escapes text and folds long lines", () => {
    const ics = buildIcs("Test", [
      { uid: "t1", title: "Schůzka, klient; Novák", start: new Date("2026-11-18T09:00:00Z"), end: new Date("2026-11-18T10:00:00Z"), description: "Řádek 1\nŘádek 2 " + "x".repeat(120) },
    ]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain(String.raw`SUMMARY:Schůzka\, klient\; Novák`);
    expect(ics).toContain("DTSTART:20261118T090000Z");
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
  });
});
