"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ownerForAction, back, field, uuidField } from "@/lib/os/actions";
import { PAYMENT_METHODS, WORK_ORDER_STATUSES, SaleInputError, parseSaleForm, readConfirmResult, saleErrorCode, type SaleErrorCode } from "@/lib/sales/domain";
import { attachSalePaymentTerms, readSalePaymentTerms, validateSalePaymentTerms, paymentChannelToStoredMethod, SALE_PAYMENT_METHODS, type SalePaymentMethod } from "@/lib/sales/payment-terms";
import { saleMatchesAcceptedQuote } from "@/lib/sales/quote-acceptance";
import { isQuoteContent } from "@/lib/quotes/model";

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

  // Never silently use a catalog default that has not been explicitly
  // reviewed on this sale. The catalog controls suggestions, not acceptance.
  if (request.lines.some(line => line.unit_price === undefined)) {
    return { error: "sale_missing_price", values };
  }

  // Optional versioned payment AGREEMENT. It is not a payment, credit agreement
  // or change to the atomic crm_confirm_sale RPC. Stored in its existing private
  // notes field until a separate, reviewed migration normalizes this metadata.
  const rawPaymentTerms = form.get("payment_terms_json");
  if (rawPaymentTerms !== null) {
    try {
      if (typeof rawPaymentTerms !== "string" || rawPaymentTerms.length > 1600) throw Error("invalid");
      const terms = validateSalePaymentTerms(JSON.parse(rawPaymentTerms));
      if (terms.schedule === "installments" || terms.schedule === "subscription") {
        // Do not finance subscriptions as one-off installments or record a
        // fictitious monthly arrangement on a sale without monthly services.
        const catalog = await supabase.from("crm_service_catalog").select("code,billing_type")
          .in("code", request.lines.map(line => line.service_code)).eq("active", true);
        if (catalog.error) return { error: saleErrorCode(catalog.error), values };
        const kinds = new Map((catalog.data ?? []).map(row => [row.code, row.billing_type]));
        if ((terms.schedule === "installments" && request.lines.some(line => kinds.get(line.service_code) !== "one_time"))
          || (terms.schedule === "subscription" && !request.lines.some(line => kinds.get(line.service_code) === "monthly"))) {
          return { error: "sale_invalid_payment_terms", values };
        }
      }
      if ((terms.schedule === "installments" && request.billing_mode !== "installments")
        || (terms.schedule === "subscription" && !["monthly", "mixed"].includes(request.billing_mode))) throw Error("invalid");
      request.notes = attachSalePaymentTerms(request.notes ?? "", terms);
    } catch {
      return { error: "sale_invalid_payment_terms", values };
    }
  }

  // Confirmed sales belong to the selected company. Never mark an unrelated
  // opportunity as won just because its ID was present in a different form.
  if (request.client_id) {
    const linked = await supabase.from("crm_clients").select("id,origin_lead_id")
      .eq("id", request.client_id).neq("status", "archived").maybeSingle();
    if (linked.error || !linked.data) {
      return { error: linked.error ? saleErrorCode(linked.error) : "sale_client_missing", values };
    }
    const canonicalLead = linked.data.origin_lead_id as string | null;
    if (request.lead_id && request.lead_id !== canonicalLead) {
      return { error: "sale_lead_other_client", values };
    }
    if (!request.lead_id && canonicalLead) request.lead_id = canonicalLead;
  }

  // Link an accepted quote by authenticated database evidence, never by a
  // browser-provided number or an unchecked lead. Existing sales remain valid.
  if (form.has("source_quote_id")) {
    const quoteId = uuidField(form, "source_quote_id");
    if (!quoteId) return { error: "sale_invalid_quote", values };
    const { data: quote, error: quoteError } = await supabase.from("crm_quotes")
      .select("id,quote_number,lead_id,client_id,status,current_version").eq("id", quoteId).maybeSingle();
    if (quoteError || !quote || quote.status !== "accepted" || quote.lead_id !== request.lead_id || (quote.client_id && quote.client_id !== request.client_id) || request.currency !== "USD") {
      return { error: "sale_invalid_quote", values };
    }
    // An accepted quote is versioned evidence: do not claim it is the source
    // of a sale if any service, scope, quantity, price, discount or tax changed.
    // A modified deal needs a revised accepted quote and signed agreement.
    const [versionR, catalogR] = await Promise.all([
      supabase.from("crm_quote_versions").select("content")
        .eq("quote_id", quote.id).eq("version_no", quote.current_version).maybeSingle(),
      supabase.from("crm_service_catalog").select("code,billing_type")
        .in("code", request.lines.map(line => line.service_code)).eq("active", true),
    ]);
    if (versionR.error || catalogR.error || !versionR.data || !isQuoteContent(versionR.data.content)
      || versionR.data.content.commission !== null
      || !saleMatchesAcceptedQuote(request.lines, versionR.data.content.lines, catalogR.data ?? [], request.discount, request.tax_rate)) {
      return { error: "sale_invalid_quote", values };
    }
    const prior = readSalePaymentTerms(request.notes);
    const combined = [prior.notes, `Cotización aceptada: ${quote.quote_number} (ID: ${quote.id}). Verificar importes y contrato firmado.`]
      .filter(Boolean).join("\n\n");
    try {
      request.notes = prior.terms ? attachSalePaymentTerms(combined, prior.terms) : combined;
      if (request.notes.length > 4000) throw Error("too_long");
    } catch {
      return { error: "sale_too_long", values };
    }
  }

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
  // A confirmed sale affects commercial lifecycle, not just the Sales table.
  for (const path of [
    "/admin/workspace/crm/sales", "/admin/workspace/crm/quotes",
    "/admin/workspace/crm/tasks", "/admin/workspace/crm/clients",
    "/admin/workspace/crm/leads", "/admin/workspace/crm/activity",
    "/admin/workspace/crm/overview", "/admin/dashboard",
  ]) revalidatePath(path);
  if (request.client_id) revalidatePath(`/admin/workspace/crm/clients/${request.client_id}`);
  if (request.lead_id) revalidatePath(`/admin/workspace/crm/lead/${request.lead_id}`);
  redirect(`/admin/workspace/crm/sales/${result.sale_id}?ok=${result.replayed ? "replayed" : "confirmed"}`);
}

export async function recordPayment(form: FormData) {
  const { supabase } = await ownerForAction();
  const saleId = uuidField(form, "sale_id");
  if (!saleId) back("/admin/workspace/crm/sales", { error: "sale_invalid" });
  const path = `/admin/workspace/crm/sales/${saleId}`;
  const amount = field(form, "amount").trim();
  const received_on = field(form, "received_on").trim();
  const channel = field(form, "channel").trim();
  const directMethod = field(form, "method");
  const method = channel ? paymentChannelToStoredMethod(channel as SalePaymentMethod) : directMethod;
  // The DB enum now stores the real manual channel (20261123150000): no "[channel]" prefix in the reference any more.
  // Recording a receipt documents money received; it never charges anyone or talks to a processor.
  const reference = field(form, "reference").trim();
  const installmentId = uuidField(form, "installment_id");
  if (!/^[0-9]{1,13}(\.[0-9]{1,2})?$/.test(amount) || Number(amount) <= 0) back(path, { error: "sale_invalid_amount" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(received_on)) back(path, { error: "sale_invalid_date" });
  if ((channel && !(SALE_PAYMENT_METHODS as readonly string[]).includes(channel)) || !(PAYMENT_METHODS as readonly string[]).includes(method) || reference.length > 120) back(path, { error: "sale_invalid" });
  const sale = await supabase.from("crm_sales").select("currency,client_id").eq("id", saleId).maybeSingle();
  if (sale.error || !sale.data) back(path, { error: sale.error ? saleErrorCode(sale.error) : "sale_invalid" });
  const { error } = await supabase.from("crm_payments").insert({ sale_id: saleId, amount, currency: sale.data.currency, received_on, method, reference, installment_id: installmentId });
  if (error) back(path, { error: saleErrorCode(error) });
  // Recorded receipts change client finance and agency KPIs, not the contract total.
  for (const affected of [
    path, "/admin/workspace/crm/sales", "/admin/workspace/crm/clients",
    "/admin/workspace/crm/overview", "/admin/workspace/crm/activity", "/admin/dashboard",
  ]) revalidatePath(affected);
  if (sale.data.client_id) revalidatePath(`/admin/workspace/crm/clients/${sale.data.client_id}`);
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

const SALE_MONEY_PATHS = ["/admin/workspace/crm/sales", "/admin/workspace/crm/clients", "/admin/workspace/crm/overview", "/admin/workspace/crm/activity", "/admin/dashboard"];
function refreshSaleMoney(saleId: string, clientId?: string | null) {
  for (const path of [`/admin/workspace/crm/sales/${saleId}`, ...SALE_MONEY_PATHS]) revalidatePath(path);
  if (clientId) revalidatePath(`/admin/workspace/crm/clients/${clientId}`);
}

/** Replace the live payment schedule (database enforces exact total, funded rows kept, optimistic version). */
export async function setSaleSchedule(form: FormData) {
  const { supabase } = await ownerForAction();
  const saleId = uuidField(form, "sale_id");
  if (!saleId) back("/admin/workspace/crm/sales", { error: "sale_invalid" });
  const path = `/admin/workspace/crm/sales/${saleId}`;
  const version = Number(field(form, "schedule_version"));
  let items: unknown;
  try { items = JSON.parse(field(form, "items") || "[]"); } catch { back(path, { error: "schedule_invalid" }); }
  if (!Number.isInteger(version) || version < 0 || !Array.isArray(items) || items.length > 60
    || items.some(i => !i || typeof i !== "object" || Array.isArray(i) || Object.keys(i).some(k => !["kind", "due_on", "amount", "label"].includes(k))))
    back(path, { error: "schedule_invalid" });
  const { error } = await supabase.rpc("crm_sale_schedule_set", {
    p_sale: saleId, p_items: items, p_expected_version: version, p_reason: field(form, "reason").trim().slice(0, 500) || null,
  });
  if (error) back(path, { error: saleErrorCode(error) });
  refreshSaleMoney(saleId);
  back(path, { ok: "schedule" });
}

/** Record a refund or chargeback against a verified receipt. The idempotency key is rendered with the form. */
export async function refundPayment(form: FormData) {
  const { supabase } = await ownerForAction();
  const saleId = uuidField(form, "sale_id"), paymentId = uuidField(form, "payment_id"), key = uuidField(form, "idempotency_key");
  if (!saleId) back("/admin/workspace/crm/sales", { error: "sale_invalid" });
  const path = `/admin/workspace/crm/sales/${saleId}`;
  const kind = field(form, "kind"), amount = field(form, "amount").trim(), occurred = field(form, "occurred_on").trim();
  if (!paymentId || !key || !["refund", "chargeback"].includes(kind)) back(path, { error: "refund_invalid" });
  if (!/^[0-9]{1,13}(\.[0-9]{1,2})?$/.test(amount) || Number(amount) <= 0) back(path, { error: "refund_invalid_amount" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurred)) back(path, { error: "refund_invalid" });
  const { error } = await supabase.rpc("crm_payment_refund", { request: {
    idempotency_key: key, payment_id: paymentId, kind, amount, occurred_on: occurred,
    reason: field(form, "reason").trim().slice(0, 500), reference: field(form, "reference").trim().slice(0, 120),
  } });
  if (error) back(path, { error: saleErrorCode(error) });
  refreshSaleMoney(saleId);
  back(path, { ok: "refund" });
}

export async function resolveChargeback(form: FormData) {
  const { supabase } = await ownerForAction();
  const saleId = uuidField(form, "sale_id"), refundId = uuidField(form, "refund_id");
  if (!saleId) back("/admin/workspace/crm/sales", { error: "sale_invalid" });
  const path = `/admin/workspace/crm/sales/${saleId}`;
  const outcome = field(form, "outcome");
  if (!refundId || !["won", "lost"].includes(outcome)) back(path, { error: "chargeback_invalid" });
  const { error } = await supabase.rpc("crm_chargeback_resolve", { p_refund: refundId, p_outcome: outcome, p_note: field(form, "note").trim().slice(0, 500) });
  if (error) back(path, { error: saleErrorCode(error) });
  refreshSaleMoney(saleId);
  back(path, { ok: "chargeback" });
}

/**
 * "Cerrar venta": registers the sale from the EXACT accepted quote revision (crm_quote_close_sale). Idempotent in the
 * database: repeating the action returns the same sale. Redirects to the sale on success.
 */
export async function closeSaleFromQuote(form: FormData) {
  const { supabase } = await ownerForAction();
  const quoteId = uuidField(form, "quote_id");
  const version = Number(field(form, "version_no"));
  if (!quoteId || !Number.isInteger(version) || version < 1) back("/admin/workspace/crm/quotes", { error: "save" });
  const back2quote = (code: string) => redirect(`/admin/workspace/crm/quotes/${quoteId}?close_error=${encodeURIComponent(code)}#close-sale`);
  const { data, error } = await supabase.rpc("crm_quote_close_sale", { request: { quote_id: quoteId, version_no: version } });
  if (error) {
    const known = /\b(quote_[a-z_]+|won_requires_verified_contract|crm_forbidden|sale_[a-z_]+)\b/.exec(error.message ?? "")?.[1];
    back2quote(known ?? "unavailable");
  }
  const r = data as { sale_id?: string; client_id?: string; replayed?: boolean } | null;
  if (!r?.sale_id || !/^[0-9a-f-]{36}$/.test(r.sale_id)) back2quote("unavailable");
  for (const path of ["/admin/workspace/crm/sales", "/admin/workspace/crm/quotes", `/admin/workspace/crm/quotes/${quoteId}`, "/admin/workspace/crm/clients",
    "/admin/workspace/crm/overview", "/admin/workspace/crm/activity", "/admin/dashboard"]) revalidatePath(path);
  if (r!.client_id) revalidatePath(`/admin/workspace/crm/clients/${r!.client_id}`);
  redirect(`/admin/workspace/crm/sales/${r!.sale_id}?ok=${r!.replayed ? "replayed" : "closed"}`);
}

/** Record a settlement period for a sale's variable agreement: verified base × agreed pct, computed by the database. */
export async function recordSettlement(form: FormData) {
  const { supabase } = await ownerForAction();
  const saleId = uuidField(form, "sale_id"), key = uuidField(form, "idempotency_key");
  if (!saleId) back("/admin/workspace/crm/sales", { error: "sale_invalid" });
  const path = `/admin/workspace/crm/sales/${saleId}`;
  const money = (v: string) => /^[0-9]{1,13}(\.[0-9]{1,2})?$/.test(v) ? v : null;
  const base = money(field(form, "eligible_base").trim()), excluded = money(field(form, "excluded_amount").trim() || "0");
  const from = field(form, "period_start"), to = field(form, "period_end");
  if (!key || !base || !excluded || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) back(path, { error: "settlement_invalid" });
  const { error } = await supabase.rpc("crm_sale_settlement_record", { request: {
    sale_id: saleId, idempotency_key: key, period_start: from, period_end: to, eligible_base: base, excluded_amount: excluded,
    evidence: field(form, "evidence").trim().slice(0, 500) } });
  if (error) back(path, { error: saleErrorCode(error) });
  refreshSaleMoney(saleId);
  back(path, { ok: "settlement" });
}

export async function moveSettlement(form: FormData) {
  const { supabase } = await ownerForAction();
  const saleId = uuidField(form, "sale_id"), id = uuidField(form, "settlement_id"), to = field(form, "to");
  if (!saleId) back("/admin/workspace/crm/sales", { error: "sale_invalid" });
  const path = `/admin/workspace/crm/sales/${saleId}`;
  if (!id || !["verified", "void"].includes(to)) back(path, { error: "settlement_invalid" });
  const { error } = await supabase.rpc("crm_sale_settlement_transition", { p_settlement: id, p_to: to, p_note: field(form, "note").trim().slice(0, 500) });
  if (error) back(path, { error: saleErrorCode(error) });
  refreshSaleMoney(saleId);
  back(path, { ok: "settlement" });
}
