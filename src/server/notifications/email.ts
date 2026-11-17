import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env, features } from "../env";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!features.email) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
    });
  }
  return transporter;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const PRIORITY_COLORS: Record<number, string> = { 1: "#dc2626", 2: "#ea580c", 3: "#ca8a04", 4: "#16a34a", 5: "#6b7280" };

export function renderEmail(opts: { title: string; body?: string | null; link?: string | null; priority?: number | null; footer?: string }): string {
  const url = opts.link ? (opts.link.startsWith("http") ? opts.link : `${env.appUrl}${opts.link}`) : env.appUrl;
  const badge = opts.priority
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${PRIORITY_COLORS[opts.priority]};color:#fff;font-size:12px;font-weight:600;margin-bottom:12px">P${opts.priority}</span>`
    : "";
  const body = opts.body ? `<p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.6;white-space:pre-line">${escapeHtml(opts.body)}</p>` : "";
  return `<!doctype html><html lang="cs"><body style="margin:0;background:#f1f5f9;font-family:Inter,Segoe UI,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:28px;border:1px solid #e2e8f0">
  <tr><td>
    <div style="font-weight:700;color:#1e3a8a;font-size:14px;letter-spacing:.02em;margin-bottom:20px">◆ Priority Agent</div>
    ${badge}
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.35;color:#0f172a">${escapeHtml(opts.title)}</h1>
    ${body}
    <a href="${escapeHtml(url)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;font-size:14px">Otevřít v Priority Agent</a>
    <p style="margin:28px 0 0;color:#94a3b8;font-size:12px">${escapeHtml(opts.footer ?? "Toto upozornění můžete upravit v Nastavení → Notifikace.")}</p>
  </td></tr></table></td></tr></table></body></html>`;
}

export async function sendEmail(to: string, subject: string, html: string, text?: string): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    if (!env.isProduction) console.info(`[email:dev] → ${to}: ${subject}`);
    return false;
  }
  await t.sendMail({ from: env.smtp.from, to, subject, html, text: text ?? subject });
  return true;
}
