"use server";
import { revalidatePath } from "next/cache";
import { back, field, ownerForAction, uuidField } from "@/lib/os/actions";

const PAGE = "/admin/workspace/crm/subscriptions";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// Database error codes we surface; anything else is "failed" (raw messages are never echoed).
const KNOWN = ["crm_forbidden", "subscription_line_not_recurring", "subscription_sale_not_confirmed", "subscription_invalid_transition",
  "subscription_reason_required", "subscription_period_invoiced", "subscription_invoice_invalid", "subscription_usage_invalid", "subscription_invalid"];
const codeOf = (e: { message?: string } | null) => KNOWN.find(k => e?.message?.includes(k)) ?? "failed";

/** Owner operations on recurring products. Every rule (idempotency, transitions, amounts) lives in the database RPCs. */
export async function subscriptionAction(form: FormData) {
  const { supabase } = await ownerForAction();
  const op = field(form, "op"), id = uuidField(form, "subscription_id");
  let r: { error: { message?: string } | null };
  switch (op) {
    case "open": {
      const line = uuidField(form, "sale_line_id"); if (!line) back(PAGE, { error: "invalid" });
      const usage = field(form, "included_usage").trim();
      r = await supabase.rpc("crm_subscription_open", { p_sale_line: line, request: { renewal_mode: field(form, "renewal_mode") || "manual",
        included_usage: /^\d{1,12}(\.\d{1,2})?$/.test(usage) ? usage : "", usage_unit: field(form, "usage_unit").slice(0, 40) } });
      break;
    }
    case "activate": { const d = field(form, "start"); if (!id || !DAY.test(d)) back(PAGE, { error: "invalid" }); r = await supabase.rpc("crm_subscription_activate", { p_sub: id, p_start: d }); break; }
    case "renew": { const d = field(form, "period_end"); if (!id || !DAY.test(d)) back(PAGE, { error: "invalid" }); r = await supabase.rpc("crm_subscription_renew", { p_sub: id, p_expected_period_end: d }); break; }
    case "suspend": if (!id) back(PAGE, { error: "invalid" }); r = await supabase.rpc("crm_subscription_suspend", { p_sub: id, p_reason: field(form, "reason").slice(0, 1000) }); break;
    case "reactivate": if (!id) back(PAGE, { error: "invalid" }); r = await supabase.rpc("crm_subscription_reactivate", { p_sub: id, p_note: field(form, "reason").slice(0, 1000) }); break;
    case "cancel": {
      const mode = field(form, "mode") === "immediate" ? "immediate" : "end_of_period";
      if (!id) back(PAGE, { error: "invalid" });
      r = await supabase.rpc("crm_subscription_cancel", { p_sub: id, p_mode: mode, p_reason: field(form, "reason").slice(0, 1000), p_on: null });
      break;
    }
    case "usage": {
      const units = Number(field(form, "units"));
      if (!id || !Number.isFinite(units) || units <= 0) back(PAGE, { error: "invalid" });
      r = await supabase.rpc("crm_subscription_record_usage", { p_sub: id, p_units: units, p_note: field(form, "note").slice(0, 1000) });
      break;
    }
    case "link_invoice": {
      const period = uuidField(form, "period_id"), invoice = uuidField(form, "invoice_id");
      if (!period || !invoice) back(PAGE, { error: "invalid" });
      r = await supabase.rpc("crm_subscription_link_invoice", { p_period: period, p_invoice: invoice });
      break;
    }
    default: back(PAGE, { error: "invalid" });
  }
  if (r!.error) back(PAGE, { error: codeOf(r!.error) });
  revalidatePath(PAGE);
  back(PAGE, { ok: op });
}
