import "server-only";
import webpush from "web-push";
import { env, features } from "../env";
import { withSystem } from "../db";

let configured = false;
function configure() {
  if (configured || !features.push) return features.push;
  webpush.setVapidDetails(env.vapid.subject, env.vapid.publicKey!, env.vapid.privateKey!);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body?: string | null;
  link?: string | null;
  tag?: string;
}

/** Send a web push to all of the user's subscriptions; prunes expired endpoints. */
export async function sendPush(userId: string, payload: PushPayload): Promise<number> {
  if (!configure()) return 0;
  const subs = await withSystem((db) => db.pushSubscription.findMany({ where: { userId } }));
  let delivered = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: payload.title, body: payload.body ?? "", url: payload.link ?? "/", tag: payload.tag }),
          { TTL: 60 * 60 * 12 },
        );
        delivered++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await withSystem((db) => db.pushSubscription.deleteMany({ where: { id: s.id } }));
        } else {
          console.warn("[push] failed", status, (err as Error).message);
        }
      }
    }),
  );
  return delivered;
}
