"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { back, field, ownerForAction, uuidField } from "@/lib/os/actions";
import { isCommercialKind, renderCommercial, type CommercialFacts, type Lang } from "@/lib/comms/email";
import { appOrigin, loadCompany, signerForUser } from "@/lib/comms/company-server";

const PAGE = "/admin/workspace/crm/communications";
const sha = (v: string) => createHash("sha256").update(v).digest("hex");

/**
 * Prepares (never sends) a commercial e-mail in the ONE canonical outbox from a recorded fact:
 *  - quote_sent                  → a quote approved by an owner or already sent;
 *  - contract_confirmation       → a contract verified as signed;
 *  - payment_confirmation        → a payment verified by an owner;
 *  - subscription_renewal_notice → an active subscription with renewal enabled;
 *  - cancellation_confirmation   → a cancelled subscription or one scheduled to end.
 * The message is frozen, owner-approved and sent with the existing compare-and-set flow (approveAndSend), with
 * the same idempotency (kind + source + recipient + language) and the same 5-attempt limit.
 */
export async function prepareCommercialEmail(form: FormData) {
  const { supabase, userId } = await ownerForAction();
  const kind = field(form, "kind"), source = uuidField(form, "source_id"), contactId = uuidField(form, "contact_id");
  const L: Lang = field(form, "lang") === "en" ? "en" : "es";
  if (!isCommercialKind(kind) || !source || !contactId) back(PAGE, { error: "commercial_invalid" });

  let clientId: string | null = null, facts: CommercialFacts | null = null;
  if (kind === "quote_sent") {
    const r = await supabase.from("crm_quotes").select("id,quote_number,title,status,valid_until,client_id,current_version,lead_id").eq("id", source!).is("deleted_at", null).maybeSingle();
    const q = r.data as { id: string; quote_number: string; title: string; status: string; valid_until: string; client_id: string | null; current_version: number; lead_id: string } | null;
    if (!q || !["approved", "sent"].includes(q.status)) back(PAGE, { error: "commercial_fact_missing" });
    const v = await supabase.from("crm_quote_versions").select("one_time_total,monthly_total,content").eq("quote_id", q!.id).eq("version_no", q!.current_version).maybeSingle();
    const ver = v.data as { one_time_total: string; monthly_total: string; content: { currency?: string } } | null;
    clientId = q!.client_id;
    facts = { kind, quoteNumber: q!.quote_number, title: q!.title, validUntil: q!.valid_until, oneTime: ver ? String(ver.one_time_total) : null,
      monthly: ver ? String(ver.monthly_total) : null, currency: ver?.content?.currency ?? "USD", url: null };
  } else if (kind === "contract_confirmation") {
    const r = await supabase.from("crm_contracts").select("id,title,status,verified_at,effective_on,lead_id").eq("id", source!).maybeSingle();
    const c = r.data as { id: string; title: string; status: string; verified_at: string | null; effective_on: string | null; lead_id: string } | null;
    if (!c || c.status !== "verified_signed" || !c.verified_at) back(PAGE, { error: "commercial_fact_missing" });
    const s = await supabase.from("crm_sales").select("client_id").eq("lead_id", c!.lead_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const qc = s.data ? null : await supabase.from("crm_quotes").select("client_id").eq("lead_id", c!.lead_id).not("client_id", "is", null).limit(1).maybeSingle();
    clientId = (s.data as { client_id: string } | null)?.client_id ?? (qc?.data as { client_id: string } | null)?.client_id ?? null;
    facts = { kind, contractTitle: c!.title, verifiedOn: c!.verified_at!, effectiveOn: c!.effective_on };
  } else if (kind === "payment_confirmation") {
    const r = await supabase.from("crm_payments").select("id,amount,currency,received_on,status,invoice_id,crm_sales(client_id)").eq("id", source!).maybeSingle();
    const pm = r.data as unknown as { id: string; amount: string; currency: string; received_on: string; status: string; invoice_id: string | null; crm_sales: { client_id: string | null } | null } | null;
    if (!pm || pm.status !== "verified") back(PAGE, { error: "commercial_fact_missing" });
    const inv = pm!.invoice_id ? await supabase.from("crm_invoices").select("number,status").eq("id", pm!.invoice_id).maybeSingle() : null;
    const invoice = inv?.data as { number: string; status: string } | null;
    clientId = pm!.crm_sales?.client_id ?? null;
    facts = { kind, amount: String(pm!.amount), currency: pm!.currency, receivedOn: pm!.received_on, invoiceNumber: invoice?.status === "issued" ? invoice.number : null };
  } else {
    const r = await supabase.from("crm_subscriptions").select("id,client_id,status,period,amount,currency,renewal_mode,current_period_end,cancel_at_period_end,ended_on,crm_service_catalog(name,name_en)")
      .eq("id", source!).maybeSingle();
    const sub = r.data as unknown as { client_id: string; status: string; period: "monthly" | "annual"; amount: string; currency: string; renewal_mode: "manual" | "auto" | "none";
      current_period_end: string | null; cancel_at_period_end: boolean; ended_on: string | null; crm_service_catalog: { name: string; name_en: string } | null } | null;
    if (!sub) back(PAGE, { error: "commercial_fact_missing" });
    const product = (L === "en" ? sub!.crm_service_catalog?.name_en : "") || sub!.crm_service_catalog?.name || "";
    clientId = sub!.client_id;
    if (kind === "subscription_renewal_notice") {
      if (sub!.status !== "active" || sub!.renewal_mode === "none" || sub!.cancel_at_period_end || !sub!.current_period_end) back(PAGE, { error: "commercial_fact_missing" });
      facts = { kind, product, periodEnd: sub!.current_period_end!, amount: String(sub!.amount), currency: sub!.currency, period: sub!.period, renewalMode: sub!.renewal_mode };
    } else {
      const scheduled = sub!.cancel_at_period_end && ["active", "suspended"].includes(sub!.status);
      if (!scheduled && sub!.status !== "cancelled") back(PAGE, { error: "commercial_fact_missing" });
      facts = { kind: "cancellation_confirmation", product, endsOn: (scheduled ? sub!.current_period_end : sub!.ended_on) ?? "", atPeriodEnd: scheduled };
    }
  }
  if (!clientId) back(PAGE, { error: "commercial_client_unknown" });

  const [contact, client, company, signer] = await Promise.all([
    supabase.from("crm_contacts").select("full_name,email,client_id").eq("id", contactId!).maybeSingle(),
    supabase.from("crm_clients").select("legal_name,trade_name").eq("id", clientId!).maybeSingle(),
    loadCompany(supabase), signerForUser(supabase, userId, L),
  ]);
  const ct = contact.data as { full_name: string; email: string | null; client_id: string } | null;
  const cl = client.data as { legal_name: string; trade_name: string } | null;
  // The recipient must be a contact of the SAME client the fact belongs to (no cross-client e-mail).
  if (!ct || ct.client_id !== clientId || !ct.email || !cl) back(PAGE, { error: "commercial_recipient_invalid" });
  if (!signer) back(PAGE, { error: "commercial_signer_unknown" });
  const rendered = renderCommercial({ lang: L, contactName: ct!.full_name, companyName: cl!.trade_name || cl!.legal_name, representative: signer!,
    company: company.contact, origin: appOrigin(), note: field(form, "note").slice(0, 1000), facts: facts! });
  if (!rendered) back(PAGE, { error: "commercial_fact_missing" });

  const key = `${kind}:${source}:${sha(`${ct!.email!.toLowerCase()}|${L}|${rendered!.text}`).slice(0, 24)}`;
  const existing = await supabase.from("crm_email_outbox").select("id,status").eq("idempotency_key", key).maybeSingle();
  if (existing.data && (existing.data as { status: string }).status !== "cancelled") back(PAGE, { ok: "email_exists" });
  const r = await supabase.from("crm_email_outbox").insert({ idempotency_key: existing.data ? `${key}:r${Date.now().toString(36)}` : key, kind, client_id: clientId,
    to_email: ct!.email, to_name: ct!.full_name, from_email: company.contact.clientSender, reply_to: company.contact.replyTo,
    subject: rendered!.subject, body_html: rendered!.html, body_text: rendered!.text, lang: L, attachments: [], created_by: userId });
  if (r.error) back(PAGE, { error: r.error.message.includes("kind_check") ? "outbox_kind_pending" : "commercial_failed" });
  revalidatePath(PAGE); revalidatePath(`/admin/workspace/crm/clients/${clientId}`);
  back(PAGE, { ok: "email_prepared" });
}
