"use server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { authLimiter, clientIp, hashKey } from "@/lib/security/rate-limit";

export type QuoteState = { status: "idle" | "ok" | "invalid" | "throttled" | "unavailable" };
const SERVICES = ["website", "ecommerce", "crm", "receptionist", "marketing", "automation"];

/**
 * Public quote request. Calls the reviewed anonymous RPC, which only creates a *pending*
 * Lead Hunter prospect for human review (never a lead, client or sale). Throttled per IP
 * here and per e-mail/globally in SQL.
 */
export async function requestQuote(_prev: QuoteState, form: FormData): Promise<QuoteState> {
  const ip = clientIp(await headers());
  if (!authLimiter.hit(hashKey("quote-ip", ip), { limit: 5, windowMs: 60 * 60 * 1000 }).allowed) return { status: "throttled" };
  const text = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const request = {
    company: text("company", 200), name: text("name", 160), email: text("email", 254), phone: text("phone", 40),
    message: text("message", 2000), language: form.get("language") === "en" ? "en" : "es", website_url: text("website_url", 200),
    services: form.getAll("services").map(String).filter(s => SERVICES.includes(s)),
  };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("crm_public_inquiry", { request });
    if (error) return { status: "unavailable" };
    return { status: data === "ok" ? "ok" : data === "throttled" ? "throttled" : data === "invalid" ? "invalid" : "unavailable" };
  } catch { return { status: "unavailable" }; }
}
