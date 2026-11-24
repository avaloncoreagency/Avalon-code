import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InstallmentRow, Receivable } from "./schedule";

export type RefundRow = { id: string; payment_id: string; kind: "refund" | "chargeback"; amount: string; occurred_on: string; reason: string;
  reference: string; resolution: "open" | "won" | "lost" | null; resolution_note: string; created_at: string };
export type SaleSchedule =
  | { state: "ready"; installments: InstallmentRow[]; refunds: RefundRow[]; receivable: Receivable | null }
  | { state: "schema_pending" | "unavailable" };

const MISSING = new Set(["42P01", "PGRST205", "PGRST202", "42883", "42703"]);

/** Reads the schedule, refunds and receivables of one sale. RLS keeps all three finance-only. */
export async function loadSaleSchedule(db: SupabaseClient, saleId: string): Promise<SaleSchedule> {
  const [ins, ref, rec] = await Promise.all([
    db.from("crm_sale_installments").select("id,seq,kind,label,due_on,amount,status").eq("sale_id", saleId).order("seq").limit(500),
    db.from("crm_payment_refunds").select("id,payment_id,kind,amount,occurred_on,reason,reference,resolution,resolution_note,created_at").eq("sale_id", saleId).order("created_at").limit(500),
    db.from("crm_sale_receivables").select("total,recorded,verified,refunded,net_collected,balance,overdue,next_due,installments,open_chargebacks").eq("sale_id", saleId).maybeSingle(),
  ]);
  const errors = [ins.error, ref.error, rec.error].filter(Boolean);
  if (errors.some(e => MISSING.has(e!.code ?? ""))) return { state: "schema_pending" };
  if (errors.length) return { state: "unavailable" };
  return { state: "ready", installments: (ins.data ?? []) as InstallmentRow[], refunds: (ref.data ?? []) as RefundRow[], receivable: (rec.data ?? null) as Receivable | null };
}

/** Receivables for many sales (list and KPIs). Returns null when the migration is not installed yet. */
export async function loadReceivables(db: SupabaseClient, saleIds: string[]): Promise<Map<string, Receivable & { sale_id: string }> | null> {
  if (!saleIds.length) return new Map();
  const { data, error } = await db.from("crm_sale_receivables")
    .select("sale_id,total,recorded,verified,refunded,net_collected,balance,overdue,next_due,installments,open_chargebacks").in("sale_id", saleIds.slice(0, 500));
  if (error) return null;
  return new Map(((data ?? []) as (Receivable & { sale_id: string })[]).map(r => [r.sale_id, r]));
}
