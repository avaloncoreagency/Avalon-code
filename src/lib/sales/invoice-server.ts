import type { SupabaseClient } from "@supabase/supabase-js";
import { acceptedSaleMethods, readSalePaymentTerms, salePaymentMethodLabel } from "@/lib/sales/payment-terms";
import type { InvoiceDoc } from "@/lib/sales/invoice";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASIS: Record<string, [string, string]> = { gross_revenue: ["ingresos brutos", "gross revenue"], gross_profit: ["utilidad bruta", "gross profit"], other: ["la base acordada", "the agreed base"] };

/** Display name of the person responsible for a sale: Office profile name, else the account's e-mail name. Read-only. */
export async function sellerName(db: SupabaseClient, sellerId: string | null | undefined): Promise<string> {
  if (!sellerId || !UUID.test(sellerId)) return "";
  const [profile, owners] = await Promise.all([
    db.from("office_profiles").select("display_name").eq("user_id", sellerId).maybeSingle(),
    db.rpc("crm_owner_directory"),
  ]);
  const name = (profile.data as { display_name?: string } | null)?.display_name?.trim();
  if (name) return name;
  const email = ((owners.data ?? []) as { user_id: string; email: string }[]).find(o => o.user_id === sellerId)?.email ?? "";
  return email.split("@")[0] ?? "";
}

/** How the sale closed, from stored records only (commercial model + variable agreement). Missing migration → fixed. */
export async function saleClosing(db: SupabaseClient, saleId: string, lang: "es" | "en"): Promise<InvoiceDoc["closing"]> {
  const [model, terms] = await Promise.all([
    db.from("crm_sales").select("commercial_model").eq("id", saleId).maybeSingle(),
    db.from("crm_sale_variable_terms").select("pct,base").eq("sale_id", saleId).maybeSingle(),
  ]);
  const m = (model.error ? null : (model.data as { commercial_model?: string | null } | null)?.commercial_model) ?? "fixed";
  const v = terms.error ? null : terms.data as { pct: string; base: string } | null;
  return { model: m === "commission" || m === "hybrid" ? m : "fixed", pct: v?.pct ?? null, basis: v ? (BASIS[v.base] ?? BASIS.other)[lang === "es" ? 0 : 1] : null };
}

const METHOD: Record<string, [string, string]> = {
  transfer: ["Transferencia bancaria", "Bank transfer"], ach: ["ACH", "ACH"], wire: ["Wire", "Wire"], zelle: ["Zelle", "Zelle"], check: ["Cheque", "Check"],
  card: ["Tarjeta", "Card"], cash: ["Efectivo", "Cash"], paypal: ["PayPal", "PayPal"], payment_link: ["Enlace de pago", "Payment link"],
  financing_external: ["Financiamiento externo", "External financing"], other: ["Otro", "Other"],
};

/**
 * READ-ONLY. Loads one invoice of one sale through the signed-in owner's client: RLS decides (owners with finance
 * access). The invoice must belong to the sale in the URL, so a guessed id from another sale returns nothing.
 * Nothing here inserts, updates or numbers anything.
 */
export async function loadInvoiceDoc(db: SupabaseClient, saleId: string, invoiceId: string, lang: "es" | "en")
  : Promise<{ ok: true; doc: InvoiceDoc; clientId: string } | { ok: false; status: 400 | 404 }> {
  if (!UUID.test(saleId) || !UUID.test(invoiceId)) return { ok: false, status: 400 };
  const inv = await db.from("crm_invoices").select("id,sale_id,client_id,number,issued_on,due_on,amount,currency,status,void_reason")
    .eq("id", invoiceId).eq("sale_id", saleId).maybeSingle();
  if (inv.error || !inv.data) return { ok: false, status: 404 };
  const i = inv.data as { client_id: string; number: string; issued_on: string; due_on: string | null; amount: string; currency: string; status: "issued" | "void"; void_reason: string };
  const [sale, lines, client, contact, pays, terms] = await Promise.all([
    db.from("crm_sales").select("*").eq("id", saleId).maybeSingle(),
    db.from("crm_sale_lines").select("description,quantity,unit_price,discount,line_total,billing_type,position,crm_service_catalog(name)").eq("sale_id", saleId).order("position"),
    db.from("crm_clients").select("legal_name,trade_name,client_code,location,country").eq("id", i.client_id).maybeSingle(),
    db.from("crm_contacts").select("full_name,email").eq("client_id", i.client_id).order("is_primary", { ascending: false }).limit(1).maybeSingle(),
    db.from("crm_payments").select("received_on,amount,method,status").eq("invoice_id", invoiceId).neq("status", "reversed").order("received_on"),
    db.from("crm_sale_terms").select("quote_number,version_no,content").eq("sale_id", saleId).maybeSingle(),
  ]);
  if (sale.error || !sale.data || lines.error || client.error || !client.data || pays.error) return { ok: false, status: 404 };
  const s = sale.data as { sale_number: string; sold_on: string; subtotal: string; discount_total: string; tax_rate: string; tax_total: string; total: string; notes: string | null; seller_id: string };
  const [seller, closing] = await Promise.all([sellerName(db, s.seller_id), saleClosing(db, saleId, lang)]);
  const c = client.data as { legal_name: string; trade_name: string; client_code: string; location: string; country: string };
  const accepted = terms.error ? null : terms.data as { quote_number: string; version_no: number; content: { issuer?: { name?: string; email?: string; phone?: string } } } | null;
  const t = (es: string, en: string) => lang === "es" ? es : en;
  const agreed = readSalePaymentTerms(s.notes).terms;
  const doc: InvoiceDoc = {
    number: i.number, issuedOn: i.issued_on, dueOn: i.due_on, currency: i.currency, amount: i.amount, status: i.status, voidReason: i.void_reason ?? "",
    saleNumber: s.sale_number, soldOn: s.sold_on, quoteRef: accepted ? `${accepted.quote_number} v${accepted.version_no}` : null,
    issuer: { name: accepted?.content?.issuer?.name || "Avalon Core Agency", email: accepted?.content?.issuer?.email ?? "", phone: accepted?.content?.issuer?.phone ?? "" },
    client: { legalName: c.legal_name, tradeName: c.trade_name ?? "", code: c.client_code, location: c.location ?? "", country: c.country ?? "",
      contactName: (contact.data as { full_name?: string } | null)?.full_name ?? "", contactEmail: (contact.data as { email?: string } | null)?.email ?? "" },
    lines: ((lines.data ?? []) as unknown as { description: string; quantity: string; unit_price: string; discount: string; line_total: string; billing_type: string; crm_service_catalog: { name: string } | null }[])
      .map(l => ({ description: [l.crm_service_catalog?.name, l.description].filter(Boolean).join(" — ") + (l.billing_type === "monthly" ? t(" (mensual)", " (monthly)") : l.billing_type === "annual" ? t(" (anual)", " (annual)") : ""),
        quantity: l.quantity, unitPrice: l.unit_price, discount: l.discount, total: l.line_total, billing: l.billing_type })),
    saleSubtotal: s.subtotal, saleDiscount: s.discount_total, saleTaxRate: s.tax_rate, saleTax: s.tax_total, saleTotal: s.total,
    payments: ((pays.data ?? []) as { received_on: string; amount: string; method: string; status: "recorded" | "verified" }[])
      .map(p => ({ receivedOn: p.received_on, amount: p.amount, method: t(...(METHOD[p.method] ?? [p.method, p.method])), status: p.status })),
    agreedMethod: agreed ? salePaymentMethodLabel(agreed.method, lang) : null,
    seller, closing, acceptedMethods: acceptedSaleMethods(agreed).map(m => salePaymentMethodLabel(m, lang)),
  };
  return { ok: true, doc, clientId: i.client_id };
}
