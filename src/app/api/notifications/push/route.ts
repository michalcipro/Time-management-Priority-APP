import { z } from "zod";
import { apiRoute, parseJson } from "@/server/api";
import { withActor } from "@/server/db";
import { pushSubscriptionSchema } from "@/lib/validation";

/** Register / remove a Web Push subscription for the current browser. */
export const POST = apiRoute(async ({ req, user }) => {
  const sub = await parseJson(req, pushSubscriptionSchema);
  await withActor(user, async (db) => {
    await db.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } });
    await db.pushSubscription.create({
      data: { userId: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: req.headers.get("user-agent")?.slice(0, 300) },
    });
    const current = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { notificationPrefs: true } });
    await db.user.update({ where: { id: user.id }, data: { notificationPrefs: { ...(current.notificationPrefs as object), push: true } } });
  });
  return { ok: true };
});

export const DELETE = apiRoute(async ({ req, user }) => {
  const { endpoint } = await parseJson(req, z.object({ endpoint: z.url() }));
  await withActor(user, (db) => db.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } }));
  return { ok: true };
});
