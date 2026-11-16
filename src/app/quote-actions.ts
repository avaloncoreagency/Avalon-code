"use server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { authLimiter, clientIp, hashKey } from "@/lib/security/rate-limit";

export type QuoteState = { status: "idle" | "ok" | "invalid" | "throttled" | "unavailable" };
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
export async function requestQuote(_prev: QuoteState, form: FormData): Promise<QuoteState> {
  const ip = clientIp(await headers());
  if (!authLimiter.hit(hashKey("quote-ip", ip), { limit: 5, windowMs: 60 * 60 * 1000 }).allowed) return { status: "throttled" };
  const text = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const lang = form.get("language") === "en" ? "en" : "es";
  const requested = form.getAll("services").map(String);
  // Preserve new service interests for the human reviewer without changing the reviewed SQL allowlist.
  const extra = [...new Set(requested.filter(s => Object.hasOwn(EXTRA_SERVICES, s)))].map(s => EXTRA_SERVICES[s][lang]);
  const message = text("message", 2000);
  const enrichedMessage = extra.length ? `${message.slice(0, 1700)}\
Services of interest: ${extra.join(", ")}`.slice(0, 2000) : message;
  const request = {
    company: text("company", 200), name: text("name", 160), email: text("email", 254), phone: text("phone", 40),
    message: enrichedMessage, language: lang, website_url: text("website_url", 200),
    services: [...new Set(requested.filter(s => SERVICES.includes(s)))],
  };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("crm_public_inquiry", { request });
    if (error) return { status: "unavailable" };
    return { status: data === "ok" ? "ok" : data === "throttled" ? "throttled" : data === "invalid" ? "invalid" : "unavailable" };
  } catch { return { status: "unavailable" }; }
}
