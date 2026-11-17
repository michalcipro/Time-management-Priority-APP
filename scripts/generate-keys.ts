/**
 * Generate secrets for `.env`:
 *   npm run vapid        AUTH_SECRET, ENCRYPTION_KEY, CRON_SECRET and a VAPID key pair
 *   npm run deploy:env   the same plus APP_DB_PASSWORD and the demo switches – a block
 *                        to paste into Vercel → Settings → Environment Variables
 */
import { randomBytes } from "node:crypto";
import webpush from "web-push";

const vercel = process.argv.includes("--vercel");
const vapid = webpush.generateVAPIDKeys();
const lines = [
  `AUTH_SECRET=${randomBytes(32).toString("base64")}`,
  `ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`,
  `CRON_SECRET=${randomBytes(24).toString("hex")}`,
  ...(vercel ? [`APP_DB_PASSWORD=${randomBytes(24).toString("base64url")}`] : []),
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapid.publicKey}`,
  `VAPID_PRIVATE_KEY=${vapid.privateKey}`,
  ...(vercel ? ["DEMO_MODE=true", "SEED_DEMO_DATA=true"] : []),
];
console.log(lines.join("\n"));
