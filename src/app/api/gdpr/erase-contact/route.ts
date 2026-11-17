import { apiRoute, parseJson } from "@/server/api";
import { withActor } from "@/server/db";
import { eraseContactData } from "@/server/services/gdpr";
import { eraseContactSchema } from "@/lib/validation";
import { audit } from "@/server/audit";
import { publish } from "@/server/realtime";

/** Erase all communication from a client (preview first, then confirm). */
export const POST = apiRoute(
  async ({ req, user }) => {
    const { contact, confirm } = await parseJson(req, eraseContactSchema);
    const result = await withActor(user, (db) => eraseContactData(db, user, contact, Boolean(confirm)));
    if (result.erased) {
      await audit({ actor: user, action: "gdpr.contact_erased", metadata: { contactHash: contact.trim().toLowerCase().replace(/.(?=.{4})/g, "•"), messages: result.messages }, headers: req.headers });
      await publish({ type: "messages.changed", teamId: user.teamId, messageIds: [] });
    }
    return result;
  },
  { permission: "privacy:erase-contact", limit: 10, limitKey: "gdpr" },
);
