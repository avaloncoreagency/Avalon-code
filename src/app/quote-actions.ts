"use server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createIntakeClient } from "@/lib/supabase/intake";
import { authLimiter, clientIp, hashKey } from "@/lib/security/rate-limit";
import { verifyHumanToken } from "@/lib/security/turnstile";

/** What the visitor typed, echoed back on any failure so nothing has to be retyped. Never contains the token. */
export type QuoteValues = { company: string; name: string; email: string; phone: string; message: string; services: string[] };
export type QuoteState = {
  status: "idle" | "ok" | "invalid" | "throttled" | "unavailable" | "human";
  values?: QuoteValues;
  /** Increments per answered submission so the client re-arms the one-time human check. */
  attempt?: number;
};
const SERVICES = ["website", "ecommerce", "crm", "receptionist", "marketing", "automation"];
const EXTRA_SERVICES: Record<string, { es: string; en: string }> = {
  chatbots: { es: "Chatbots IA", en: "AI chatbots" },
  funnels: { es: "Embudo de ventas", en: "Sales funnels" },
};

/**
 * Public quote request. Calls the reviewed anonymous RPC, which only creates a *pending*
 * Lead Hunter prospect for human review (never a lead, client or sale). Throttled per IP
 * here and per e-mail/globally in SQL.
 */
export async function requestQuote(prev: QuoteState, form: FormData): Promise<QuoteState> {
  const text = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const values: QuoteValues = { company: text("company", 200), name: text("name", 160), email: text("email", 254), phone: text("phone", 40),
    message: text("message", 2000), services: [...new Set(form.getAll("services").map(String))].slice(0, 12) };
  const attempt = (prev.attempt ?? 0) + 1;
  const fail = (status: Exclude<QuoteState["status"], "idle" | "ok">): QuoteState => ({ status, values, attempt });
  const ip = clientIp(await headers());
  if (!authLimiter.hit(hashKey("quote-ip", ip), { limit: 5, windowMs: 60 * 60 * 1000 }).allowed) return fail("throttled");
  // Server-side human check before the database is touched. With no Turnstile keys configured it is "disabled"
  // (documented rollout gap); a partial configuration fails closed.
  const human = await verifyHumanToken(form.get("cf-turnstile-response"), "avalon_quote");
  if (human === "invalid") return fail("human");
  if (human === "unavailable") return fail("unavailable");
  const lang = form.get("language") === "en" ? "en" : "es";
  const requested = form.getAll("services").map(String);
  // Preserve new service interests for the human reviewer without changing the reviewed SQL allowlist.
  const extra = [...new Set(requested.filter(s => Object.hasOwn(EXTRA_SERVICES, s)))].map(s => EXTRA_SERVICES[s][lang]);
  // The public RPC truncates the stored opportunity at 1000 chars; retain extra service interests first.
  const prefix = extra.length ? `${lang === "es" ? "Interés adicional" : "Additional interest"}: ${extra.join(", ")}\n` : "";
  const enrichedMessage = `${prefix}${text("message", 2000)}`.slice(0, 2000);
  const request = {
    company: text("company", 200), name: text("name", 160), email: text("email", 254), phone: text("phone", 40),
    message: enrichedMessage, language: lang, website_url: text("website_url", 200),
    services: [...new Set(requested.filter(s => SERVICES.includes(s)))],
  };
  try {
    // Least-privilege intake role when configured (P0.2); otherwise the current anonymous client.
    const supabase = createIntakeClient() ?? await createClient();
    const { data, error } = await supabase.rpc("crm_public_inquiry", { request });
    if (error) return fail("unavailable");
    if (data === "ok") return { status: "ok", attempt };
    return fail(data === "throttled" ? "throttled" : data === "invalid" ? "invalid" : "unavailable");
  } catch { return fail("unavailable"); }
}
