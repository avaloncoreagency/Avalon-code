import "server-only";
import nodemailer from "nodemailer";

/**
 * Single outbound transport for client e-mails (welcome, invoice copy, document delivery). Agent invitations are NOT
 * sent here: Supabase Auth sends them with its own verified link (see supabaseInviteTemplate).
 *
 * Configuration (server env only, never in Git or the browser):
 *   AVALON_SMTP_HOST (default smtp.gmail.com) · AVALON_SMTP_PORT (default 465, TLS) · AVALON_SMTP_USER · AVALON_SMTP_PASS
 * With Gmail the password is a Google "App Password" of the sending account and From must be that same account.
 * Without configuration nothing is sent: callers record `blocked_no_transport`, never "sent".
 */
export type Attachment = { filename: string; content: Uint8Array; contentType: "application/pdf" };
export type Outgoing = { from: string; fromName: string; to: string; toName: string; replyTo: string; subject: string; html: string; text: string; attachments: Attachment[] };
export type SendResult =
  | { status: "sent"; provider: string; messageId: string }
  | { status: "blocked_no_transport"; reason: "not_configured" | "sender_mismatch" }
  | { status: "failed"; error: string };
type Sender = { sendMail: (m: Record<string, unknown>) => Promise<{ messageId?: string; accepted?: unknown[] }> };

export function smtpConfig() {
  const user = (process.env.AVALON_SMTP_USER ?? "").trim().toLowerCase();
  const pass = process.env.AVALON_SMTP_PASS ?? "";
  const host = (process.env.AVALON_SMTP_HOST ?? "smtp.gmail.com").trim();
  const port = Number(process.env.AVALON_SMTP_PORT ?? 465);
  return { configured: Boolean(user && pass && host && Number.isInteger(port)), user, host, port, pass };
}

const header = (v: string) => v.replace(/[\r\n]+/g, " ").trim();
/** Provider errors are reduced to a short code; message bodies, addresses and credentials are never logged or stored. */
function safeError(e: unknown) {
  const code = (e as { code?: string; responseCode?: number })?.code ?? "";
  const resp = (e as { responseCode?: number })?.responseCode;
  return [code, resp ? `smtp_${resp}` : ""].filter(Boolean).join(" ").slice(0, 120) || "send_failed";
}

export async function sendMail(m: Outgoing, injected?: Sender): Promise<SendResult> {
  const cfg = smtpConfig();
  if (!injected && !cfg.configured) return { status: "blocked_no_transport", reason: "not_configured" };
  // Gmail rewrites or rejects a From that is not the authenticated account: refuse instead of sending a spoofed sender.
  if (!injected && m.from.trim().toLowerCase() !== cfg.user) return { status: "blocked_no_transport", reason: "sender_mismatch" };
  const transport: Sender = injected ?? nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.port === 465, requireTLS: true,
    auth: { user: cfg.user, pass: cfg.pass }, disableFileAccess: true, disableUrlAccess: true, connectionTimeout: 15000, socketTimeout: 20000 });
  try {
    const info = await transport.sendMail({
      from: { name: header(m.fromName), address: m.from }, to: { name: header(m.toName), address: m.to }, replyTo: m.replyTo,
      subject: header(m.subject), html: m.html, text: m.text,
      attachments: m.attachments.map(a => ({ filename: header(a.filename), content: Buffer.from(a.content), contentType: a.contentType })),
    });
    if (!info?.messageId) return { status: "failed", error: "no_message_id" };
    return { status: "sent", provider: injected ? "test" : `smtp:${cfg.host}`, messageId: String(info.messageId).slice(0, 300) };
  } catch (e) {
    return { status: "failed", error: safeError(e) };
  }
}
