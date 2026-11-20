"use server";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { intakeCall } from "@/lib/supabase/intake";
import { authLimiter, clientIp, hashKey } from "@/lib/security/rate-limit";
import { validSlug } from "@/lib/growth/funnel";
import { verifyHumanToken } from "@/lib/security/turnstile";

/** Typed values echoed on failure so nothing is retyped. Never contains the human-check token. */
export type FunnelValues = { company: string; name: string; email: string; phone: string; message: string };
export type FunnelSubmitState = {
  status: "idle" | "ok" | "invalid" | "throttled" | "unavailable" | "human";
  values?: FunnelValues;
  /** Increments per answered submission so the client re-arms the one-time human check. */
  attempt?: number;
};

/**
 * Voluntary inbound request, no automatic email, calls, advertisements or
 * appointments. The anonymous, SQL-throttled RPC is the ONLY write capability.
 * Never use privileged database credentials in Next.js.
 */
export async function submitFunnel(previous: FunnelSubmitState, form: FormData): Promise<FunnelSubmitState> {
  const field = (name: string, limit: number) => String(form.get(name) ?? "").trim().slice(0, limit + 1);
  const values: FunnelValues = { company: field("company", 200), name: field("name", 160), email: field("email", 254),
    phone: field("phone", 40), message: field("message", 2000) };
  const attempt = (previous.attempt ?? 0) + 1;
  const fail = (status: Exclude<FunnelSubmitState["status"], "idle" | "ok">): FunnelSubmitState => ({ status, values, attempt });
  const slug = String(form.get("slug") ?? "").trim();
  if (!validSlug(slug)) return fail("invalid");
  const requestHeaders = await headers();
  const incomingIp = clientIp(requestHeaders);
  const request = {
    slug,
    company: field("company", 200),
    name: field("name", 160),
    email: field("email", 254),
    phone: field("phone", 40),
    message: field("message", 2000),
    consent: form.get("consent") === "yes",
    website_url: field("website_url", 160),
    // Consent text version the visitor saw (rendered by the page from crm_growth_funnel_view); the RPC rejects a stale one.
    consent_version: field("consent_version", 40),
    referrer_host: referrerHost(requestHeaders.get("referer")),
    // Durable per-device limit in PostgreSQL: a keyed hash of the IP, never the IP. Without a server secret no
    // fingerprint is sent (an unkeyed IPv4 hash could be reversed), and only the per-e-mail/per-funnel limits apply.
    fingerprint: deviceFingerprint(incomingIp),
  };
  // Local validation first (Codex #295): no consent or oversized fields never reach Cloudflare, the limiter or the DB.
  if (!request.consent || request.company.length > 200 || request.name.length > 160 ||
      request.email.length > 254 || request.phone.length > 40 || request.message.length > 2000)
    return fail("invalid");
  if (!authLimiter.hit(hashKey("growth-funnel:" + slug, incomingIp), { limit: 5, windowMs: 60 * 60 * 1000 }).allowed)
    return fail("throttled");
  // FV-001: server-side human check BEFORE any database client or RPC. Funnel-specific action, so a login or quote
  // token is never accepted here. Disabled (no keys) is the documented rollout gap; partial configuration fails closed.
  const human = await verifyHumanToken(form.get("cf-turnstile-response"), "avalon_funnel");
  if (human === "invalid") return fail("human");
  if (human === "unavailable") return fail("unavailable");
  try {
    const supabase = await createClient();
    const call = intakeCall("funnel", request);
    const { data, error } = await supabase.rpc(call.fn, call.args);
    if (error) return fail("unavailable");
    if (data === "ok") return { status: "ok", attempt };
    return fail(data === "invalid" ? "invalid" : data === "throttled" ? "throttled" : "unavailable");
  } catch {
    return fail("unavailable");
  }
}

function referrerHost(referer: string | null): string {
  try { return referer ? new URL(referer).hostname.toLowerCase().slice(0, 253) : ""; } catch { return ""; }
}

function deviceFingerprint(ip: string): string {
  const secret = process.env.AUTH_FLOW_SECRET;
  if (!secret || secret.length < 32 || ip === "unknown") return "";
  return createHmac("sha256", secret).update("growth-funnel-device\u0000" + ip).digest("hex");
}
