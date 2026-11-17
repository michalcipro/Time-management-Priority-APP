/**
 * Generate secrets for `.env`:
 *   npm run vapid
 * Prints AUTH_SECRET, ENCRYPTION_KEY, CRON_SECRET and a VAPID key pair for web push.
 */
import { randomBytes } from "node:crypto";
import webpush from "web-push";

const vapid = webpush.generateVAPIDKeys();
console.log(`AUTH_SECRET=${randomBytes(32).toString("base64")}`);
console.log(`ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`);
console.log(`CRON_SECRET=${randomBytes(24).toString("hex")}`);
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapid.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapid.privateKey}`);
