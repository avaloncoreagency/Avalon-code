"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ownerForAction, back, field, uuidField } from "@/lib/os/actions";
import { PAYMENT_METHODS, WORK_ORDER_STATUSES, SaleInputError, parseSaleForm, readConfirmResult, saleErrorCode, type SaleErrorCode } from "@/lib/sales/domain";

export type SaleFormState = { error: SaleErrorCode | null; values: Record<string, string>; existingClientId?: string };

const keep = (form: FormData) => Object.fromEntries([...form.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$")).map(([k, v]) => [k, String(v).slice(0, 4000)]));

/**
 * Confirm a sale. The idempotency key is issued when the form is rendered and is
 * kept across retries, so a double click or a retry after a lost response
 * returns the original sale instead of creating a second one.
 */
export async function confirmSale(_prev: SaleFormState, form: FormData): Promise<SaleFormState> {
  const { supabase } = await ownerForAction();
  const values = keep(form);
  let request;
  try { request = parseSaleForm(form); }
  catch (e) { return { error: e instanceof SaleInputError ? e.code : "sale_invalid", values }; }

  const { data, error } = await supabase.rpc("crm_confirm_sale", { request });
  const result = error ? null : readConfirmResult(data);
  if (!result) {
    const code = error ? saleErrorCode(error) : "unavailable";
    if (code !== "schema_pending" && code !== "crm_forbidden") {
      // Diagnosable trail of the failed attempt; the operation itself rolled back.
      await supabase.rpc("crm_record_sale_failure", { idempotency_key: request.idempotency_key, code }).then(() => undefined, () => undefined);
    }
    const detail = (error as { details?: string } | null)?.details;
    return { error: code, values, existingClientId: code === "sale_client_exists" && detail && /^[0-9a-f-]{36}$/i.test(detail) ? detail : undefined };
  }
  for (const path of ["/admin/workspace/crm/sales", "/admin/workspace/crm/tasks", "/admin/workspace/crm/clients", "/admin/dashboard"]) revalidatePath(path);
  redirect(`/admin/workspace/crm/sales/${result.sale_id}?ok=${result.replayed ? "replayed" : "confirmed"}`);
}

export async function recordPayment(form: FormData) {
  const { supabase } = await ownerForAction();
  const saleId = uuidField(form, "sale_id");
  if (!saleId) back("/admin/workspace/crm/sales", { error: "sale_invalid" });
  const path = `/admin/workspace/crm/sales/${saleId}`;
  const amount = field(form, "amount").trim();
  const received_on = field(form, "received_on").trim();
  const method = field(form, "method");
  const reference = field(form, "reference").trim();
  if (!/^[0-9]{1,13}(\.[0-9]{1,2})?$/.test(amount) || Number(amount) <= 0) back(path, { error: "sale_invalid_amount" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(received_on)) back(path, { error: "sale_invalid_date" });
  if (!(PAYMENT_METHODS as readonly string[]).includes(method) || reference.length > 120) back(path, { error: "sale_invalid" });
  const sale = await supabase.from("crm_sales").select("currency").eq("id", saleId).maybeSingle();
  if (sale.error || !sale.data) back(path, { error: sale.error ? saleErrorCode(sale.error) : "sale_invalid" });
  const { error } = await supabase.from("crm_payments").insert({ sale_id: saleId, amount, currency: sale.data.currency, received_on, method, reference });
  if (error) back(path, { error: saleErrorCode(error) });
  revalidatePath(path);
  revalidatePath("/admin/workspace/crm/sales");
  back(path, { ok: "payment" });
}

export async function updateWorkOrder(form: FormData) {
  const { supabase } = await ownerForAction();
  const id = uuidField(form, "work_order_id");
  const saleId = uuidField(form, "sale_id");
  if (!id || !saleId) back("/admin/workspace/crm/sales", { error: "sale_invalid" });
  const path = `/admin/workspace/crm/sales/${saleId}`;
  const status = field(form, "status");
  const assignee = uuidField(form, "assignee_id");
  if (!(WORK_ORDER_STATUSES as readonly string[]).includes(status) || !assignee) back(path, { error: "sale_invalid" });
  const { data, error } = await supabase.from("crm_work_orders").update({ status, assignee_id: assignee }).eq("id", id).eq("sale_id", saleId).select("id").maybeSingle();
  if (error || !data) back(path, { error: error ? saleErrorCode(error) : "sale_invalid" });
  revalidatePath(path);
  back(path, { ok: "saved" });
}

export async function updateContract(form: FormData) {
  const { supabase } = await ownerForAction();
  const saleId = uuidField(form, "sale_id");
  if (!saleId) back("/admin/workspace/crm/sales", { error: "sale_invalid" });
  const path = `/admin/workspace/crm/sales/${saleId}`;
  const contract_status = field(form, "contract_status");
  if (!["pending_signature", "signed", "cancelled"].includes(contract_status)) back(path, { error: "sale_invalid" });
  const { data, error } = await supabase.from("crm_sales").update({ contract_status }).eq("id", saleId).select("id").maybeSingle();
  if (error || !data) back(path, { error: error ? saleErrorCode(error) : "sale_invalid" });
  revalidatePath(path);
  back(path, { ok: "saved" });
}
