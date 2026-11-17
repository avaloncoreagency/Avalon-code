import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCommissionRequest, buildInvoiceRequest, coreEngineMessage,
  type ClientLedger, type CommissionStatus,
} from "./core-engine";

/**
 * Server-side calls for the Core Engine RPCs. Every call runs with the signed-in user's Supabase session: the database
 * re-checks owner membership (crm_private.is_owner) and finance access, so these helpers never widen privileges.
 * Results are { ok, message } so server actions can show a truthful outcome without leaking SQL.
 */
export type Outcome<T = undefined> = { ok: true; data: T } | { ok: false; message: string };

async function rpc<T>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<Outcome<T>> {
  try {
    const { data, error } = await db.rpc(fn, args);
    if (error) return { ok: false, message: coreEngineMessage(error) };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, message: coreEngineMessage(null) };
  }
}

export async function recordInvoice(db: SupabaseClient, input: Record<string, unknown>) {
  const built = buildInvoiceRequest(input);
  if (!built.ok) return { ok: false, message: built.error } as const;
  return rpc<{ invoice_id: string; replayed: boolean }>(db, "crm_invoice_record", { request: built.value });
}

export const voidInvoice = (db: SupabaseClient, invoiceId: string, reason: string) =>
  rpc<null>(db, "crm_invoice_void", { p_invoice: invoiceId, p_reason: reason });

export const verifyPayment = (db: SupabaseClient, paymentId: string, evidence: string) =>
  rpc<null>(db, "crm_payment_verify", { p_payment: paymentId, p_evidence: evidence });

export const reversePayment = (db: SupabaseClient, paymentId: string, reason: string) =>
  rpc<null>(db, "crm_payment_reverse", { p_payment: paymentId, p_reason: reason });

export async function agreeCommission(db: SupabaseClient, input: Record<string, unknown>) {
  const built = buildCommissionRequest(input);
  if (!built.ok) return { ok: false, message: built.error } as const;
  return rpc<{ commission_id: string; amount: string; currency: string }>(db, "crm_commission_agree", { request: built.value });
}

export const transitionCommission = (db: SupabaseClient, commissionId: string, to: Exclude<CommissionStatus, "agreed">, note = "") =>
  rpc<null>(db, "crm_commission_transition", { p_commission: commissionId, p_to: to, p_note: note });

/** Full money picture for one client. A database without the Core Engine migration reports "unavailable", never zeros. */
export async function loadClientLedger(db: SupabaseClient, clientId: string): Promise<Outcome<ClientLedger> | { ok: false; message: string; unavailable: true }> {
  const { data, error } = await db.rpc("crm_client_finance_ledger", { p_client: clientId });
  if (error?.code === "PGRST202" || error?.code === "42883")
    return { ok: false, unavailable: true, message: "El libro financiero aún no está instalado en esta base de datos." };
  if (error) return { ok: false, message: coreEngineMessage(error) };
  return { ok: true, data: data as ClientLedger };
}
