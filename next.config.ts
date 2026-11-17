import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/** Who may embed the app in an iframe. Default: nobody. Example: "'self' https://intranet.example.com". */
const frameAncestors = process.env.CSP_FRAME_ANCESTORS?.trim() || "'none'";

/**
 * Content Security Policy.
 * - No third-party scripts are loaded; all fonts are self-hosted.
 * - 'unsafe-eval' is only needed by React Refresh in development.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  `frame-ancestors ${frameAncestors}`,
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com https://login.microsoftonline.com",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  ...(frameAncestors === "'none'" ? [{ key: "X-Frame-Options", value: "DENY" }] : []),
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  // Packages that load files at runtime (Lua scripts, native bindings) must not be bundled.
  serverExternalPackages: ["bullmq", "ioredis", "pg", "web-push", "nodemailer"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
