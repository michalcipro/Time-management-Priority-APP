import "server-only";

/**
 * Centralised, typed access to environment variables. Optional integrations are
 * feature-flagged by the presence of their credentials.
 */
function read(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v.trim() === "" ? undefined : v.trim();
}

/**
 * Public URL of the app: APP_URL, else the Vercel production domain, else the
 * deployment URL (preview), else localhost.
 */
function resolveAppUrl(): string {
  const explicit = read("APP_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  const vercelHost = read("VERCEL_PROJECT_PRODUCTION_URL") ?? read("VERCEL_URL");
  if (vercelHost) return `https://${vercelHost.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

/**
 * Realtime transport: server-sent events (long-lived connection, needs Redis
 * between instances) or polling (serverless hosting such as Vercel).
 */
export type RealtimeTransport = "sse" | "poll";

function resolveRealtimeTransport(): RealtimeTransport {
  const value = read("REALTIME_TRANSPORT")?.toLowerCase();
  if (value === "sse" || value === "poll") return value;
  return process.env.VERCEL ? "poll" : "sse";
}

export const env = {
  appUrl: resolveAppUrl(),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  demoMode: read("DEMO_MODE") === "true",
  timezone: read("NEXT_PUBLIC_APP_TIMEZONE") ?? "Europe/Prague",

  encryptionKey: read("ENCRYPTION_KEY"),
  redisUrl: read("REDIS_URL"),
  cronSecret: read("CRON_SECRET"),
  realtimeTransport: resolveRealtimeTransport(),

  anthropicApiKey: read("ANTHROPIC_API_KEY") ?? read("ANTHROPIC_AUTH_TOKEN"),
  aiDefaultModel: read("AI_DEFAULT_MODEL") ?? "claude-haiku-5-5",

  smtp: {
    host: read("SMTP_HOST"),
    port: Number(read("SMTP_PORT") ?? 587),
    secure: read("SMTP_SECURE") === "true",
    user: read("SMTP_USER"),
    password: read("SMTP_PASSWORD"),
    from: read("SMTP_FROM") ?? "Priority Agent <noreply@example.com>",
  },

  vapid: {
    publicKey: read("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
    privateKey: read("VAPID_PRIVATE_KEY"),
    subject: read("VAPID_SUBJECT") ?? "mailto:admin@example.com",
  },

  google: {
    clientId: read("GOOGLE_CLIENT_ID"),
    clientSecret: read("GOOGLE_CLIENT_SECRET"),
  },

  microsoft: {
    clientId: read("MICROSOFT_CLIENT_ID"),
    clientSecret: read("MICROSOFT_CLIENT_SECRET"),
    tenantId: read("MICROSOFT_TENANT_ID") ?? "common",
  },

  whatsapp: {
    verifyToken: read("WHATSAPP_VERIFY_TOKEN"),
    appSecret: read("WHATSAPP_APP_SECRET"),
    apiVersion: read("WHATSAPP_API_VERSION") ?? "v23.0",
  },

  twilio: {
    accountSid: read("TWILIO_ACCOUNT_SID"),
    authToken: read("TWILIO_AUTH_TOKEN"),
    fromNumber: read("TWILIO_FROM_NUMBER"),
  },
};

export const features = {
  ai: Boolean(env.anthropicApiKey),
  redis: Boolean(env.redisUrl),
  email: Boolean(env.smtp.host),
  push: Boolean(env.vapid.publicKey && env.vapid.privateKey),
  google: Boolean(env.google.clientId && env.google.clientSecret),
  microsoft: Boolean(env.microsoft.clientId && env.microsoft.clientSecret),
  twilio: Boolean(env.twilio.accountSid && env.twilio.authToken),
};
