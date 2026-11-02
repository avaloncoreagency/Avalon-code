import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripeSandboxReady } from "@/lib/stripe/avalon";
import { verifyStripeSignature } from "@/lib/stripe/signature.cjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

/**
 * Public endpoint BY DESIGN; Stripe doesn't have an Avalon owner session.
 * Authentication is by Stripe's signed raw-body event, never by a query parameter.
 */
export async function POST(request: NextRequest) {
  if (!stripeSandboxReady() || process.env.STRIPE_SANDBOX_ONLY !== "true") {
    return json({ error: "not_configured" }, 503);
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!secret.startsWith("whsec_") || !serviceKey || !supabaseUrl) {
    return json({ error: "not_configured" }, 503);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > 262144) return json({ error: "too_large" }, 413);
  const payload = await request.text();
  if (Buffer.byteLength(payload, "utf8") > 262144) return json({ error: "too_large" }, 413);
  if (!verifyStripeSignature(payload, request.headers.get("stripe-signature"), secret)) {
    return json({ error: "invalid_signature" }, 400);
  }
  let event: { id?: string; type?: string; livemode?: boolean; account?: string };
  try { event = JSON.parse(payload); } catch { return json({ error: "invalid_json" }, 400); }
  if (!event || event.livemode !== false) return json({ error: "live_event_rejected" }, 403);
  const accountId = process.env.STRIPE_ACCOUNT_ID ?? "";
  if (event.account && (!accountId || event.account !== accountId)) return json({ error: "wrong_account" }, 403);
  if (!/^evt_[A-Za-z0-9]+$/.test(event.id ?? "") || !event.type) return json({ error: "invalid_event" }, 400);

  // A service-role key is required only in this server route, never in client code.
  // DB transaction atomically deduplicates event IDs and invoices/payment rows.
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error, data } = await supabase.rpc("crm_stripe_process_event", { p_event: event });
  if (error) {
    // Never expose DB internals, secrets or customer details in webhook responses.
    return json({ error: "reconcile_failed" }, 503); // Stripe retries.
  }
  return json({ received: true, result: data }, 200);
}
