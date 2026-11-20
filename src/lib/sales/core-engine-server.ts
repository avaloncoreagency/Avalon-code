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

export type InvoiceRow = { id: string; number: string; amount: string; currency: string; issued_on: string; due_on: string | null; status: "issued" | "void"; void_reason: string };
export type PaymentRow = { id: string; amount: string; currency: string; received_on: string; reference: string; status: "recorded" | "verified" | "reversed"; evidence: string; reversal_reason: string; invoice_id: string | null };
export type CommissionRow = { id: string; kind: string; beneficiary_id: string | null; beneficiary_name: string; amount: string; currency: string; status: CommissionStatus; basis: string; paid_reference: string; cancel_reason: string };

/** Read through the same signed-in adapter. Exact counts make bounded lists explicit. */
export async function loadSaleOperations(db: SupabaseClient, saleId: string) {
  const [invoices, payments, commissions] = await Promise.all([
    db.from("crm_invoices").select("id,number,amount,currency,issued_on,due_on,status,void_reason", {count:"exact"}).eq("sale_id",saleId).order("created_at",{ascending:false}).limit(100),
    db.from("crm_payments").select("id,amount,currency,received_on,reference,status,evidence,reversal_reason,invoice_id", {count:"exact"}).eq("sale_id",saleId).order("received_on",{ascending:false}).limit(100),
    db.from("crm_commissions").select("id,kind,beneficiary_id,beneficiary_name,amount,currency,status,basis,paid_reference,cancel_reason", {count:"exact"}).eq("sale_id",saleId).order("created_at",{ascending:false}).limit(100),
  ]);
  const error = invoices.error ?? payments.error ?? commissions.error;
  if (error) return {ok:false as const,message:coreEngineMessage(error)};
  return {ok:true as const, invoices:invoices.data as InvoiceRow[],payments:payments.data as PaymentRow[],commissions:commissions.data as CommissionRow[],
    counts:{invoices:invoices.count,payments:payments.count,commissions:commissions.count}};
}

/** Operation selection never substitutes for authorization. Every handler passes the same gates below. */
const operations: Record<string, { table: string | null; execute: (db: SupabaseClient, saleId: string, input: Record<string, unknown>) => Promise<Outcome<unknown>> }> = {
  invoice: {table:null,execute:(db,saleId,input)=>recordInvoice(db,{...input,sale_id:saleId})},
  agree: {table:null,execute:(db,saleId,input)=>agreeCommission(db,{...input,sale_id:saleId})},
  void: {table:"crm_invoices",execute:(db,_saleId,input)=>voidInvoice(db,String(input.id),String(input.reason??""))},
  verify: {table:"crm_payments",execute:(db,_saleId,input)=>verifyPayment(db,String(input.id),String(input.evidence??""))},
  reverse: {table:"crm_payments",execute:(db,_saleId,input)=>reversePayment(db,String(input.id),String(input.reason??""))},
  accrued: {table:"crm_commissions",execute:(db,_saleId,input)=>transitionCommission(db,String(input.id),"accrued",String(input.note??""))},
  paid: {table:"crm_commissions",execute:(db,_saleId,input)=>transitionCommission(db,String(input.id),"paid",String(input.note??""))},
  cancelled: {table:"crm_commissions",execute:(db,_saleId,input)=>transitionCommission(db,String(input.id),"cancelled",String(input.note??""))},
};

export async function runSaleOperation(db: SupabaseClient, saleId: string, operation: string, input: Record<string, unknown>): Promise<Outcome<unknown>> {
  if(!Object.hasOwn(operations,operation))return {ok:false,message:coreEngineMessage(null)};
  const handler=operations[operation];
  const sale=await db.from("crm_sales").select("id,client_id").eq("id",saleId).maybeSingle();
  if(sale.error||!sale.data)return {ok:false,message:coreEngineMessage(sale.error)};
  const capability=await loadClientLedger(db,sale.data.client_id);
  if(!capability.ok)return capability;
  const scoped={...input};
  if(handler.table!==null){
    const record=await db.from(handler.table).select("id").eq("id",String(input.id??"")).eq("sale_id",saleId).maybeSingle();
    if(record.error||!record.data)return {ok:false,message:coreEngineMessage(record.error)};
    scoped.id=record.data.id;
  }
  return handler.execute(db,sale.data.id,scoped);
}

/** Contract §A catalog writes reuse the existing table, optimistic version and trigger. */
export async function saveCatalogOffer(db: SupabaseClient, id: string, version: number, input: Record<string, unknown>, approve = false): Promise<Outcome<unknown>> {
  const current = await db.from("crm_service_catalog").select("*").eq("id",id).maybeSingle();
  if (current.error || !current.data || !("offer_status" in current.data)) return {ok:false,message:coreEngineMessage(current.error)};
  let values: Record<string, unknown> = {offer_status:"approved"};
  if (!approve) {
    values = {};
    for (const key of ["monthly_price","direct_cost","target_margin_pct","estimated_days","commission_value"]) {
      const raw = String(input[key] ?? "").trim();
      if (raw && (!/^\d{1,13}(\.\d{1,2})?$/.test(raw) || !Number.isFinite(Number(raw)))) return {ok:false,message:coreEngineMessage(null)};
      values[key] = raw || null;
    }
    for (const key of ["deliverables","exclusions","payment_terms"]) values[key] = String(input[key] ?? "").trim();
    if (!["none","sale_pct","referral_pct","fixed"].includes(String(input.commission_kind))) return {ok:false,message:coreEngineMessage(null)};
    values.commission_kind = input.commission_kind;
    // Basic catalog price/routing remain in the existing form; this form only edits the added contract fields.
  }
  const result = await db.from("crm_service_catalog").update(values).eq("id",id).eq("version",version).select("id").maybeSingle();
  if (result.error || !result.data) return {ok:false,message:result.error ? coreEngineMessage(result.error) : "El registro cambió. Actualiza antes de reintentar."};
  return {ok:true,data:result.data};
}
