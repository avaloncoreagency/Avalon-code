"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ownerForAction, uuidField, field, back } from "@/lib/os/actions";
import { stripeRequest, stripeSandboxReady, dollarsToMinorUnits, type StripeInvoice } from "@/lib/stripe/avalon";

const BASE = "/admin/workspace/crm/sales";
type Sale = { id: string; sale_number: string; client_id: string; currency: string; total: string; status: string; contract_status: string; crm_clients: { legal_name: string } | null };
type Contact = { email: string | null };

/** Creates a draft only. No client email, payment, tax or charge is triggered. */
export async function createStripeInvoiceDraft(form: FormData) {
  const { supabase } = await ownerForAction();
  const saleId = uuidField(form, "sale_id");
  if (!saleId) back(BASE, { error: "sale_invalid" });
  const path = `${BASE}/${saleId}`;
  if (!stripeSandboxReady()) back(path, { stripe_error: "not_configured" });
  const { data: sale, error } = await supabase.from("crm_sales")
    .select("id,sale_number,client_id,currency,total,status,contract_status,crm_clients(legal_name)")
    .eq("id", saleId).maybeSingle();
  if (error || !sale) back(path, { stripe_error: "sale_missing" });
  const s = sale as unknown as Sale;
  if (s.status !== "confirmed" || s.contract_status === "cancelled" || s.currency !== "USD") {
    back(path, { stripe_error: "not_eligible" });
  }
  const { data: contacts } = await supabase.from("crm_contacts")
    .select("email").eq("client_id", s.client_id).eq("is_primary", true).limit(1);
  const contact = (contacts as Contact[] | null)?.[0];
  const email = (contact?.email ?? "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back(path, { stripe_error: "email_required" });
  const amount = dollarsToMinorUnits(String(s.total));
  if (!amount) back(path, { stripe_error: "amount_invalid" });

  try {
    const customerParams = new URLSearchParams();
    customerParams.set("email", email);
    customerParams.set("name", s.crm_clients?.legal_name ?? s.sale_number);
    customerParams.set("metadata[avalon_client_id]", s.client_id);
    const customer = await stripeRequest<{ id:string }>("/customers", "POST", customerParams, `avalon-customer-${s.client_id}`);
    const invoiceParams = new URLSearchParams();
    invoiceParams.set("customer", customer.id);
    invoiceParams.set("collection_method", "send_invoice");
    invoiceParams.set("days_until_due", "30");
    invoiceParams.set("auto_advance", "false");
    invoiceParams.set("metadata[avalon_sale_id]", s.id);
    invoiceParams.set("metadata[avalon_client_id]", s.client_id);
    invoiceParams.set("metadata[avalon_sale_number]", s.sale_number);
    const invoice = await stripeRequest<StripeInvoice>("/invoices", "POST", invoiceParams, `avalon-invoice-${s.id}-v1`);
    const item = new URLSearchParams();
    item.set("customer", customer.id);
    item.set("invoice", invoice.id);
    item.set("amount", String(amount));
    item.set("currency", "usd");
    item.set("description", `Avalon Core Agency — ${s.sale_number}`);
    await stripeRequest("/invoiceitems", "POST", item, `avalon-invoice-item-${s.id}-v1`);
    revalidatePath(path);
    redirect(`${path}?stripe_invoice=${encodeURIComponent(invoice.id)}`);
  } catch (error) {
    // Next.js redirect is an intentional control-flow exception.
    if (error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) throw error;
    back(path, { stripe_error: "create_failed" });
  }
}

/** Only an owner can send a previously prepared sandbox invoice. */
export async function sendStripeInvoice(form: FormData) {
  await ownerForAction();
  const saleId = uuidField(form, "sale_id");
  const invoiceId = field(form, "invoice_id");
  if (!saleId) back(BASE, { error: "sale_invalid" });
  const path = `${BASE}/${saleId}`;
  if (!stripeSandboxReady() || !/^in_[A-Za-z0-9]{8,80}$/.test(invoiceId)) back(path, { stripe_error: "not_configured" });
  try {
    const invoice = await stripeRequest<StripeInvoice>(`/invoices/${invoiceId}`);
    if (invoice.metadata?.avalon_sale_id !== saleId || invoice.status !== "draft") back(path, { stripe_error: "not_eligible" });
    // Sending an invoice emails the customer. Owner action explicitly authorizes this.
    const confirmed = await stripeRequest<StripeInvoice>(`/invoices/${invoiceId}/send`, "POST", new URLSearchParams(), `avalon-send-${invoiceId}`);
    redirect(`${path}?stripe_invoice=${encodeURIComponent(confirmed.id)}&stripe_ok=sent`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) throw error;
    back(path, { stripe_error: "send_failed" });
  }
}
