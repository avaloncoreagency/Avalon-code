import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emptyLoaded, loadAllRows, summarizeClientFinance, summaryFromAggregate,
  type FinanceAggregate, type FinanceCost, type FinanceSale, type FinanceSummary,
} from "./client-finance";

/**
 * Capabilities of the signed-in user, read from PostgreSQL (crm_my_capabilities: agency_memberships +
 * crm_private.finance_access). Never derived from an e-mail address. Fails closed: any error → no capability.
 */
export type CrmCapabilities = { owner: boolean; financeView: boolean; commissionApprove: boolean; source: "database" | "unavailable" };

export async function getCrmCapabilities(db: SupabaseClient): Promise<CrmCapabilities> {
  try {
    const { data, error } = await db.rpc("crm_my_capabilities");
    if (error || !data || typeof data !== "object") return { owner: false, financeView: false, commissionApprove: false, source: "unavailable" };
    const d = data as Record<string, unknown>;
    return { owner: d.owner === true, financeView: d.finance_view === true, commissionApprove: d.commission_approve === true, source: "database" };
  } catch {
    return { owner: false, financeView: false, commissionApprove: false, source: "unavailable" };
  }
}

export type ClientFinanceResult =
  | { allowed: false; reason: "no_capability" | "unavailable" }
  | { allowed: true; summary: FinanceSummary; source: "sql_aggregate" | "paged_rows" };

const SALE_FINANCE_COLUMNS = "id,currency,total,recurring_monthly,status,contract_status,crm_payments(amount)";

/**
 * Client 360° finance for one client. Authorization is the database capability (finance_view); the database also
 * enforces it (the RPC raises finance_forbidden and crm_client_costs has RLS). Prefers the exact SQL aggregate; on a
 * database without migration 20261112090000 it falls back to reading every page (loadAllRows), which reports partial
 * data as partial.
 */
export async function loadClientFinance(db: SupabaseClient, clientId: string, caps?: CrmCapabilities): Promise<ClientFinanceResult> {
  const capabilities = caps ?? await getCrmCapabilities(db);
  if (capabilities.source === "unavailable") return { allowed: false, reason: "unavailable" };
  if (!capabilities.financeView) return { allowed: false, reason: "no_capability" };
  const { data, error } = await db.rpc("crm_client_finance_summary", { p_client: clientId });
  if (!error && data) return { allowed: true, summary: summaryFromAggregate(data as FinanceAggregate), source: "sql_aggregate" };
  if (error && error.code !== "PGRST202" && error.code !== "42883") {
    if (error.code === "42501") return { allowed: false, reason: "no_capability" };
    // Any other failure: report both sources as failed (never zero, never a guess).
    return { allowed: true, source: "paged_rows",
      summary: summarizeClientFinance({ sales: { ...emptyLoaded<FinanceSale>(), complete: false, failed: true, total: null },
        costs: { ...emptyLoaded<FinanceCost>(), complete: false, failed: true, total: null } }) };
  }
  const [sales, costs] = await Promise.all([
    loadAllRows<FinanceSale>((from, to) => db.from("crm_sales").select(SALE_FINANCE_COLUMNS, { count: "exact" })
      .eq("client_id", clientId).order("sold_on", { ascending: false }).order("id").range(from, to)),
    loadAllRows<FinanceCost>((from, to) => db.from("crm_client_costs").select("id,amount,currency", { count: "exact" })
      .eq("client_id", clientId).order("incurred_on", { ascending: false }).order("id").range(from, to)),
  ]);
  return { allowed: true, summary: summarizeClientFinance({ sales, costs }), source: "paged_rows" };
}
