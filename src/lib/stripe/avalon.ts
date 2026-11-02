import "server-only";

/**
 * Sandbox-only Stripe Invoicing gateway.
 * Never place API keys in NEXT_PUBLIC_* or source control.
 * We deliberately refuse live credentials until end-to-end reconciliation is reviewed.
 */
const API = "https://api.stripe.com/v1";
const VERSION = "2026-09-30.endive";

export function stripeSandboxReady(): boolean {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  // Never mutate Avalon production CRM with test-mode Stripe, even during
  // local development. Vercel also blocks the mismatched Preview at build time.
  const usingProductionDatabase = supabaseUrl.includes("ltbwzcrxeuczdhhtbqgm");
  return /^(rk_test_|sk_test_)/.test(key) &&
    process.env.STRIPE_SANDBOX_ONLY === "true" &&
    process.env.VERCEL_ENV !== "production" &&
    !!supabaseUrl && !usingProductionDatabase;
}

export const STRIPE_RESERVATION_RETRY_MAX_AGE_MS = 20 * 60 * 60_000;

/**
 * Refuse retries of orphaned Stripe invoice reservations as we approach
 * Stripe's minimum 24-hour API v1 idempotency-key retention boundary.
 * The record stays visible in CRM for owner reconciliation; it is not
 * silently deleted or retried with a new key.
 */
export function stripeReservationRetryable(createdAt: string, now = Date.now()): boolean {
  const age = now - Date.parse(createdAt);
  return Number.isFinite(age) && age >= -5 * 60_000 && age < STRIPE_RESERVATION_RETRY_MAX_AGE_MS;
}

export class StripeSetupError extends Error {
  constructor() { super("Stripe sandbox unavailable: configure restricted test credentials on Vercel Preview."); }
}

export async function stripeRequest<T>(path: string, method: "GET" | "POST" = "GET", data?: URLSearchParams, idempotencyKey?: string): Promise<T> {
  if (!stripeSandboxReady()) throw new StripeSetupError();
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid Stripe path");
  const key = process.env.STRIPE_SECRET_KEY!;
  const response = await fetch(API + path, {
    method, cache: "no-store",
    headers: {
      Authorization: `Bearer ${key}`,
      "Stripe-Version": VERSION,
      ...(data ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: data?.toString(),
  });
  if (!response.ok) {
    // Avoid relaying raw Stripe error content or metadata to the UI/logs.
    throw new Error(`Stripe API request failed (${response.status})`);
  }
  return await response.json() as T;
}

export type StripeInvoice = {
  id: string; status: string; customer: string; currency: string;
  amount_due: number; total: number; livemode: boolean; automatic_tax: { enabled: boolean } | null; hosted_invoice_url: string | null;
  invoice_pdf: string | null; metadata: Record<string,string>;
};

export function dollarsToMinorUnits(amount: string): number | null {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(amount)) return null;
  const [whole, cents = ""] = amount.split(".");
  const value = Number(whole) * 100 + Number(cents.padEnd(2, "0"));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
