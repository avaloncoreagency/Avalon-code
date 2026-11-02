"use server";

import { revalidatePath } from "next/cache";
import { ownerForAction, uuidField, back } from "@/lib/os/actions";
import { stripeRequest, stripeSandboxReady, type StripeInvoice } from "@/lib/stripe/avalon";

const BASE = "/admin/workspace/crm/sales";

type Sale = {
  id: string; sale_number: string; client_id: string; currency: string;
  status: string; contract_status: string;
  crm_clients: { legal_name: string } | null;
};
type ReservedInvoice = {
  id: string; sale_id: string; client_id: string; amount_minor: number | string;
  currency: string; status: string; stripe_invoice_id: string | null; stripe_customer_id: string | null;
};
type DbInvoice = {
  id: string; sale_id: string; client_id: string; amount_minor: number | string; currency: string;
  status: string; stripe_invoice_id: string | null; stripe_customer_id: string | null;
};

const TEST_EMAIL = /^[^\s@]+@(?:[^\s@]+\.)?(?:example\.com|example\.org|example\.net|example\.test|example\.invalid)$/i;
function isTestRecipient(email: string) { return TEST_EMAIL.test(email); }
function minor(value: string | number) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
function actionError(error: unknown) {
  return (error as { code?: string } | null)?.code === "PGRST205" ? "schema_pending" : "unavailable";
}
function salePath(id: string) { return `${BASE}/${id}`; }

/** A draft-only sandbox workflow: reserve one invoice in Postgres before any external API call. */
export async function createStripeInvoiceDraft(form: FormData) {
  const { supabase } = await ownerForAction();
  const saleId = uuidField(form, "sale_id");
  if (!saleId) back(BASE, { error: "sale_invalid" });
  const path = salePath(saleId);
  if (!stripeSandboxReady()) back(path, { stripe_error: "not_configured" });

  const { data, error } = await supabase.from("crm_sales")
    .select("id,sale_number,client_id,currency,status,contract_status,crm_clients(legal_name)")
    .eq("id", saleId).maybeSingle();
  const s = data as Sale | null;
  if (error || !s) back(path, { stripe_error: "sale_missing" });
  if (s.currency !== "USD" || s.status !== "confirmed" || s.contract_status === "cancelled") {
    back(path, { stripe_error: "not_eligible" });
  }
  const { data: contacts, error: contactError } = await supabase.from("crm_contacts")
    .select("email").eq("client_id", s.client_id).eq("is_primary", true).limit(1);
  if (contactError) back(path, { stripe_error: "unavailable" });
  const email = (contacts?.[0]?.email ?? "").trim();
  // Test mode must never send live customer data or email real clients.
  if (!isTestRecipient(email)) back(path, { stripe_error: "test_email_required" });

  const reservation = await supabase.rpc("crm_stripe_reserve_invoice", { p_sale_id: saleId });
  if (reservation.error || !Array.isArray(reservation.data) || !reservation.data[0]) {
    back(path, { stripe_error: actionError(reservation.error) });
  }
  const local = reservation.data[0] as ReservedInvoice;
  if (local.stripe_invoice_id) back(path, { stripe_ok: "existing" });
  const cents = minor(local.amount_minor);
  if (!cents || local.status !== "creating" || local.currency !== "USD") back(path, { stripe_error: "not_eligible" });

  try {
    const customerParams = new URLSearchParams({
      email,
      name: `Avalon Sandbox ${s.sale_number}`,
      "metadata[avalon_client_id]": s.client_id,
    });
    const customer = await stripeRequest<{ id: string }>(
      "/customers", "POST", customerParams, `avalon-test-customer-${s.client_id}`
    );

    const invoiceParams = new URLSearchParams({
      customer: customer.id,
      collection_method: "send_invoice",
      days_until_due: "30",
      auto_advance: "false",
      pending_invoice_items_behavior: "exclude",
      "metadata[avalon_invoice_id]": local.id,
      "metadata[avalon_sale_id]": s.id,
      "metadata[avalon_client_id]": s.client_id,
      "metadata[avalon_sale_number]": s.sale_number,
    });
    const invoice = await stripeRequest<StripeInvoice>(
      "/invoices", "POST", invoiceParams, `avalon-test-invoice-${local.id}`
    );

    const item = new URLSearchParams({
      customer: customer.id,
      invoice: invoice.id,
      amount: String(cents),
      currency: "usd",
      description: `Avalon Core Agency / ${s.sale_number} / saldo pendiente`,
    });
    await stripeRequest("/invoiceitems", "POST", item, `avalon-test-item-${local.id}`);

    const linked = await supabase.rpc("crm_stripe_attach_invoice", {
      p_id: local.id, p_stripe_invoice_id: invoice.id, p_stripe_customer_id: customer.id,
    });
    if (linked.error) throw new Error("Failed to attach Stripe invoice");
  } catch {
    // The reservation remains "creating" for safe retry with the SAME Stripe idempotency keys.
    back(path, { stripe_error: "create_failed" });
  }
  revalidatePath(path);
  revalidatePath(`/admin/workspace/crm/clients/${s.client_id}`);
  back(path, { stripe_ok: "draft" });
}

/** Explicit owner-approved email send, restricted to synthetic test recipient addresses. */
export async function sendStripeInvoice(form: FormData) {
  const { supabase } = await ownerForAction();
  const saleId = uuidField(form, "sale_id");
  const localId = uuidField(form, "invoice_id");
  if (!saleId || !localId) back(BASE, { error: "sale_invalid" });
  const path = salePath(saleId);
  if (!stripeSandboxReady() || process.env.STRIPE_ALLOW_TEST_SEND !== "true") {
    back(path, { stripe_error: "not_configured" });
  }
  const { data: row, error } = await supabase.from("crm_stripe_invoices")
    .select("id,sale_id,client_id,amount_minor,currency,status,stripe_invoice_id,stripe_customer_id")
    .eq("id", localId).eq("sale_id", saleId).maybeSingle();
  const local = row as DbInvoice | null;
  if (error || !local?.stripe_invoice_id || !local.stripe_customer_id || local.status !== "draft") {
    back(path, { stripe_error: "not_eligible" });
  }
  const { data: contacts } = await supabase.from("crm_contacts")
    .select("email").eq("client_id", local.client_id).eq("is_primary", true).limit(1);
  if (!isTestRecipient((contacts?.[0]?.email ?? "").trim())) {
    back(path, { stripe_error: "test_email_required" });
  }
  try {
    const stripeCustomer = await stripeRequest<{ id: string; email: string | null }>(`/customers/${local.stripe_customer_id}`);
    if (stripeCustomer.id !== local.stripe_customer_id || !isTestRecipient((stripeCustomer.email ?? "").trim())) {
      back(path, { stripe_error: "test_email_required" });
    }
    const invoice = await stripeRequest<StripeInvoice>(`/invoices/${local.stripe_invoice_id}`);
    if (invoice.status !== "draft" || invoice.livemode !== false ||
      invoice.id !== local.stripe_invoice_id ||
      invoice.customer !== local.stripe_customer_id ||
      invoice.currency !== "usd" ||
      invoice.metadata?.avalon_sale_id !== saleId ||
      invoice.metadata?.avalon_invoice_id !== local.id ||
      invoice.total !== minor(local.amount_minor)) {
      back(path, { stripe_error: "invoice_mismatch" });
    }
    const sent = await stripeRequest<StripeInvoice>(
      `/invoices/${local.stripe_invoice_id}/send`, "POST", new URLSearchParams(),
      `avalon-test-send-${local.id}`
    );
    const saved = await supabase.rpc("crm_stripe_mark_sent", {
      p_id: local.id, p_url: sent.hosted_invoice_url,
    });
    if (saved.error) throw new Error("Failed to record sent invoice");
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error &&
      String(error.digest).startsWith("NEXT_REDIRECT")) throw error;
    back(path, { stripe_error: "send_failed" });
  }
  revalidatePath(path);
  revalidatePath(`/admin/workspace/crm/clients/${local.client_id}`);
  back(path, { stripe_ok: "sent" });
}
