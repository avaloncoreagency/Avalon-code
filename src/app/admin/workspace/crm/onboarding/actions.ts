"use server";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { back, field, ownerForAction, uuidField } from "@/lib/os/actions";
import { acceptanceBlockers, canMove, checklistFor, deliveryBlockers, isProductType, isStage, progress, readChecklist, toggleItem, PRODUCT_LABEL, STAGE_LABEL, type ProductType } from "@/lib/onboarding/model";
import { buildManual, renderManualPdf, MANUAL_GENERATOR, isManualSnapshot, manualFileName } from "@/lib/docs/manual";
import { isLifecycleKind, renderClientWelcome, renderDocumentDelivery, renderInvoiceCopy, renderLifecycle, type Lang, type Rendered } from "@/lib/comms/email";
import { appOrigin, loadCompany, signerForId, signerForUser } from "@/lib/comms/company-server";
import { sendMail, type Attachment } from "@/lib/comms/transport";
import { loadInvoiceDoc } from "@/lib/sales/invoice-server";
import { verifiedAgreement } from "@/lib/onboarding/evidence-server";
import { clientDocuments } from "@/lib/docs/library";
import { renderInvoicePdf, fileName as invoiceFileName } from "@/lib/sales/invoice";
import { isAgreementSnapshot } from "@/lib/contracts/agreement";

const BASE = "/admin/workspace/crm/onboarding";
const sha = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");
const lang = (form: FormData): Lang => field(form, "lang") === "en" ? "en" : "es";
const code = (e: { message?: string } | null) => e?.message?.includes("crm_email_outbox_kind_check") ? "outbox_kind_pending"
  : /\b((?:onboarding|outbox|document|consent)_[a-z_]+)\b/.exec(e?.message ?? "")?.[1] ?? (e?.message?.includes("row-level security") ? "forbidden" : "save");
type Onb = { id: string; client_id: string; sale_id: string | null; project_id: string | null; product_type: ProductType; title: string; stage: string; version: number;
  checklist: unknown; invoice_id: string | null; live_url: string; qa_passed: boolean; commercial_owner_id: string | null; next_step: string; next_step_on: string | null; next_step_confirmed: boolean; delivered_at: string | null;
  client_accepted_at?: string | null };

async function loadOnb(db: SupabaseClient, id: string) {
  const r = await db.from("crm_client_onboardings").select("*").eq("id", id).maybeSingle();
  if (r.error || !r.data) back(BASE, { error: r.error ? "unavailable" : "not_found" });
  return r.data as Onb;
}
function refresh(o: { id: string; client_id: string }) {
  for (const p of [BASE, `${BASE}/${o.id}`, `/admin/workspace/crm/clients/${o.client_id}`]) revalidatePath(p);
}
/** Optimistic update: 0 rows means someone changed it meanwhile (or RLS denied) → nothing is overwritten. */
async function update(db: SupabaseClient, o: Onb, expected: number, patch: Record<string, unknown>) {
  const r = await db.from("crm_client_onboardings").update(patch).eq("id", o.id).eq("version", expected).select("id").maybeSingle();
  if (r.error) back(`${BASE}/${o.id}`, { error: code(r.error) });
  if (!r.data) back(`${BASE}/${o.id}`, { error: "onboarding_version_conflict" });
}

/** Start onboarding for a client, optionally from a sale (one per sale: a repeat returns the existing record). */
export async function startOnboarding(form: FormData) {
  const { supabase, userId } = await ownerForAction();
  const clientId = uuidField(form, "client_id"), saleId = uuidField(form, "sale_id"), projectId = uuidField(form, "project_id");
  const type = field(form, "product_type");
  const from = clientId ? `/admin/workspace/crm/clients/${clientId}` : BASE;
  if (!clientId || !isProductType(type)) back(from, { error: "onboarding_invalid" });
  if (saleId) {
    const existing = await supabase.from("crm_client_onboardings").select("id").eq("sale_id", saleId).maybeSingle();
    if (existing.data) redirect(`${BASE}/${(existing.data as { id: string }).id}`);
  }
  const sale = saleId ? await supabase.from("crm_sales").select("client_id,seller_id,sale_number").eq("id", saleId).maybeSingle() : null;
  if (saleId && (!sale?.data || (sale.data as { client_id: string }).client_id !== clientId)) back(from, { error: "onboarding_sale_other_client" });
  const title = field(form, "title").trim().slice(0, 160) || `${PRODUCT_LABEL[type as ProductType][0]}${sale?.data ? ` · ${(sale.data as { sale_number: string }).sale_number}` : ""}`;
  const r = await supabase.from("crm_client_onboardings").insert({
    client_id: clientId, sale_id: saleId, project_id: projectId, product_type: type, title, checklist: checklistFor(type as ProductType),
    commercial_owner_id: (sale?.data as { seller_id?: string } | undefined)?.seller_id ?? userId,
  }).select("id").single();
  if (r.error) {
    // Unique sale index: a concurrent click created it first → open that one.
    if (saleId && /duplicate key/.test(r.error.message)) {
      const again = await supabase.from("crm_client_onboardings").select("id").eq("sale_id", saleId).maybeSingle();
      if (again.data) redirect(`${BASE}/${(again.data as { id: string }).id}`);
    }
    back(from, { error: code(r.error) });
  }
  refresh({ id: (r.data as { id: string }).id, client_id: clientId! });
  redirect(`${BASE}/${(r.data as { id: string }).id}?ok=started`);
}

export async function updateOnboarding(form: FormData) {
  const { supabase } = await ownerForAction();
  const id = uuidField(form, "id"); if (!id) back(BASE, { error: "onboarding_invalid" });
  const o = await loadOnb(supabase, id!); const v = Number(field(form, "version"));
  const date = field(form, "next_step_on");
  const url = field(form, "live_url").trim();
  if (url && !/^https:\/\/\S{3,500}$/.test(url)) back(`${BASE}/${id}`, { error: "onboarding_live_url_invalid" });
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) back(`${BASE}/${id}`, { error: "onboarding_invalid" });
  await update(supabase, o, v, {
    commercial_owner_id: uuidField(form, "commercial_owner_id"), technical_owner_id: uuidField(form, "technical_owner_id"),
    next_step: field(form, "next_step").trim().slice(0, 500), next_step_on: date || null, next_step_confirmed: field(form, "next_step_confirmed") === "on" && Boolean(date),
    project_id: uuidField(form, "project_id"), invoice_id: uuidField(form, "invoice_id"), live_url: url,
  });
  refresh(o); back(`${BASE}/${id}`, { ok: "saved" });
}

export async function moveOnboarding(form: FormData) {
  const { supabase } = await ownerForAction();
  const id = uuidField(form, "id"); const to = field(form, "to");
  if (!id || !isStage(to)) back(BASE, { error: "onboarding_invalid" });
  const o = await loadOnb(supabase, id!);
  if (!isStage(o.stage) || !canMove(o.stage, to as never)) back(`${BASE}/${id}`, { error: "onboarding_stage_not_allowed" });
  // OPS-004: closing needs the client's acceptance (the database enforces it too).
  if (to === "closed" && !o.client_accepted_at) back(`${BASE}/${id}#delivery`, { error: "onboarding_acceptance_blocked" });
  await update(supabase, o, Number(field(form, "version")), { stage: to });
  refresh(o); back(`${BASE}/${id}`, { ok: "stage" });
}

export async function toggleChecklist(form: FormData) {
  const { supabase, userId } = await ownerForAction();
  const id = uuidField(form, "id"); if (!id) back(BASE, { error: "onboarding_invalid" });
  const o = await loadOnb(supabase, id!);
  let list;
  try { list = toggleItem(readChecklist(o.checklist), field(form, "key"), field(form, "done") === "1", userId, new Date().toISOString()); }
  catch { back(`${BASE}/${id}`, { error: "onboarding_checklist_unknown" }); }
  await update(supabase, o, Number(field(form, "version")), { checklist: list });
  refresh(o); back(`${BASE}/${id}#checklist`, { ok: "saved" });
}

export async function setQa(form: FormData) {
  const { supabase } = await ownerForAction();
  const id = uuidField(form, "id"); if (!id) back(BASE, { error: "onboarding_invalid" });
  const o = await loadOnb(supabase, id!);
  await update(supabase, o, Number(field(form, "version")), { qa_passed: field(form, "qa") === "1" });
  refresh(o); back(`${BASE}/${id}#delivery`, { ok: "saved" });
}

async function deliveryFacts(db: SupabaseClient, o: Onb, deliveredTo: string) {
  const [manuals, verified] = await Promise.all([
    db.from("crm_client_documents").select("id", { count: "exact", head: true }).eq("onboarding_id", o.id).eq("kind", "manual").eq("status", "issued"),
    verifiedAgreement(db, o.client_id),
  ]);
  return deliveryBlockers({ productType: o.product_type, checklist: readChecklist(o.checklist), qaPassed: o.qa_passed, liveUrl: o.live_url,
    manualIssued: !manuals.error && (manuals.count ?? 0) > 0, contractVerified: Boolean(verified), deliveredTo });
}

/** OPS-003: the exact agreement version tied to the client's verified signature (null data + reason otherwise). */
async function signedAgreement(db: SupabaseClient, clientId: string): Promise<{ data: { id: string; template_version: string; snapshot: unknown; client_id: string } | null; error: string | null }> {
  const v = await verifiedAgreement(db, clientId);
  if (!v) return { data: null, error: "manual_contract_not_verified" };
  if (!v.agreementDraftId) return { data: null, error: "manual_agreement_not_linked" };
  const r = await db.from("crm_client_agreement_drafts").select("id,template_version,snapshot,client_id").eq("id", v.agreementDraftId).maybeSingle();
  return { data: (r.data as { id: string; template_version: string; snapshot: unknown; client_id: string } | null) ?? null, error: r.data ? null : "manual_agreement_not_linked" };
}

/** OPS-004: record the CLIENT's acceptance (distinct from the handover and from technical publication), once. */
export async function recordAcceptance(form: FormData) {
  const { supabase, userId } = await ownerForAction();
  const id = uuidField(form, "id"); if (!id) back(BASE, { error: "onboarding_invalid" });
  const o = await loadOnb(supabase, id!);
  const evidence = field(form, "acceptance_evidence").trim().slice(0, 1000);
  const blockers = acceptanceBlockers({ deliveredAt: o.delivered_at, evidence });
  if (blockers.length || o.client_accepted_at) back(`${BASE}/${id}#delivery`, { error: o.client_accepted_at ? "onboarding_acceptance_immutable" : "onboarding_acceptance_blocked" });
  await update(supabase, o, Number(field(form, "version")), { client_accepted_at: new Date().toISOString(), client_acceptance_evidence: evidence, client_acceptance_recorded_by: userId });
  refresh(o); back(`${BASE}/${id}#delivery`, { ok: "accepted" });
}

/** Records the actual delivery. Only possible when every gate passes; the database re-checks QA, approver and URL. */
export async function recordDelivery(form: FormData) {
  const { supabase, userId } = await ownerForAction();
  const id = uuidField(form, "id"); if (!id) back(BASE, { error: "onboarding_invalid" });
  const o = await loadOnb(supabase, id!);
  const to = field(form, "delivered_to").trim().slice(0, 200);
  if (o.stage !== "delivery_ready") back(`${BASE}/${id}#delivery`, { error: "onboarding_stage_not_allowed" });
  const blockers = await deliveryFacts(supabase, o, to);
  if (blockers.length) back(`${BASE}/${id}#delivery`, { error: "onboarding_delivery_blocked", blockers: blockers.join(",") });
  await update(supabase, o, Number(field(form, "version")), { stage: "delivered", delivered_at: new Date().toISOString(), delivery_approved_by: userId,
    delivered_to: to, delivery_note: field(form, "delivery_note").trim().slice(0, 1000) });
  refresh(o); back(`${BASE}/${id}#delivery`, { ok: "delivered" });
}

// ── Manuals ───────────────────────────────────────────────────────────────────────────────────────────────────────
export async function generateManual(form: FormData) {
  const { supabase, userId } = await ownerForAction();
  const id = uuidField(form, "id"); if (!id) back(BASE, { error: "onboarding_invalid" });
  const o = await loadOnb(supabase, id!); const L = lang(form);
  const [client, contact, project, draft, prev, company] = await Promise.all([
    supabase.from("crm_clients").select("legal_name,trade_name").eq("id", o.client_id).single(),
    supabase.from("crm_contacts").select("full_name").eq("client_id", o.client_id).order("is_primary", { ascending: false }).limit(1).maybeSingle(),
    o.project_id ? supabase.from("os_projects").select("name").eq("id", o.project_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    signedAgreement(supabase, o.client_id),
    supabase.from("crm_client_documents").select("id,version").eq("client_id", o.client_id).eq("kind", "manual").eq("product_type", o.product_type).order("version", { ascending: false }).limit(1).maybeSingle(),
    loadCompany(supabase),
  ]);
  if (client.error || !client.data) back(`${BASE}/${id}`, { error: "unavailable" });
  // OPS-003: a manual describes the scope that was actually SIGNED (verified contract linked to its exact agreement
  // version). Without it no manual is issued — never a generic manual presented as proof of a specific product.
  const signed = draft.data as { client_id?: string } | null;
  if (!signed || signed.client_id !== o.client_id) back(`${BASE}/${id}#documents`, { error: draft.error ?? "manual_agreement_not_linked" });
  const c = client.data as { legal_name: string; trade_name: string };
  const snap = draft.data && isAgreementSnapshot((draft.data as { snapshot: unknown }).snapshot) ? (draft.data as { snapshot: { data: Record<string, string> } }).snapshot.data : null;
  const responsible = (await signerForId(supabase, o.commercial_owner_id, L))?.name ?? (await signerForUser(supabase, userId, L))?.name ?? "";
  const version = ((prev.data as { version?: number } | null)?.version ?? 0) + 1;
  const manual = buildManual({ lang: L, clientName: (contact.data as { full_name?: string } | null)?.full_name || c.legal_name, companyName: c.trade_name || c.legal_name,
    productType: o.product_type, productName: (project.data as { name?: string } | null)?.name || o.title, liveUrl: o.live_url, version,
    issuedOn: new Date().toISOString().slice(0, 10), responsible,
    contractRef: draft.data ? `${(draft.data as { template_version: string }).template_version} · ${(draft.data as { id: string }).id.slice(0, 8)}` : "",
    scope: snap?.scope ?? "", exclusions: snap?.exclusions ?? "", maintenance: snap?.supportMaintenance ?? "", warranty: snap?.warrantyPeriod ?? "",
    support: { email: company.contact.supportEmail, phone: company.contact.supportPhone, hours: company.contact.supportHours } });
  const pdf = renderManualPdf(manual);
  const r = await supabase.from("crm_client_documents").insert({ client_id: o.client_id, onboarding_id: o.id, project_id: o.project_id, kind: "manual",
    product_type: o.product_type, version, title: `${manual.product.name} · v${version}`, generator: MANUAL_GENERATOR, snapshot: manual, sha256: sha(pdf), created_by: userId });
  if (r.error) back(`${BASE}/${id}#documents`, { error: code(r.error) });
  if (prev.data) await supabase.from("crm_client_documents").update({ status: "superseded" }).eq("id", (prev.data as { id: string }).id).eq("status", "issued");
  refresh(o); back(`${BASE}/${id}#documents`, { ok: "manual" });
}

// ── E-mail outbox ────────────────────────────────────────────────────────────────────────────────────────────────
type Attach = { type: "invoice"; id: string; sale_id: string; number: string } | { type: "document"; id: string; title: string };

/** Prepare (never send) a message. The recipient must be one of the client's recorded contacts. */
export async function prepareEmail(form: FormData) {
  const { supabase, userId } = await ownerForAction();
  const id = uuidField(form, "id"); if (!id) back(BASE, { error: "onboarding_invalid" });
  const o = await loadOnb(supabase, id!); const L = lang(form);
  const kind = field(form, "kind");
  if (!["client_welcome", "invoice_copy", "document_delivery"].includes(kind) && !isLifecycleKind(kind)) back(`${BASE}/${id}#emails`, { error: "onboarding_invalid" });
  const contactId = uuidField(form, "contact_id");
  const [contact, client, company, docs, inv] = await Promise.all([
    contactId ? supabase.from("crm_contacts").select("full_name,email,client_id").eq("id", contactId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("crm_clients").select("legal_name,trade_name").eq("id", o.client_id).single(),
    loadCompany(supabase),
    supabase.from("crm_client_documents").select("id,title").eq("onboarding_id", o.id).eq("status", "issued").order("created_at", { ascending: false }).limit(3),
    o.invoice_id ? supabase.from("crm_invoices").select("id,sale_id,number,status,client_id").eq("id", o.invoice_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  const ct = contact.data as { full_name: string; email: string | null; client_id: string } | null;
  if (!ct || ct.client_id !== o.client_id || !ct.email) back(`${BASE}/${id}#emails`, { error: "onboarding_recipient_invalid" });
  const signer = (await signerForId(supabase, o.commercial_owner_id, L)) ?? (await signerForUser(supabase, userId, L));
  if (!signer) back(`${BASE}/${id}#emails`, { error: "onboarding_signer_unknown" });
  const c = client.data as { legal_name: string; trade_name: string };
  const invoice = inv.data as { id: string; sale_id: string; number: string; status: string; client_id: string } | null;
  const useInvoice = field(form, "attach_invoice") === "on" && invoice && invoice.status === "issued" && invoice.client_id === o.client_id;
  if (kind === "invoice_copy" && !useInvoice) back(`${BASE}/${id}#emails`, { error: "onboarding_invoice_not_issued" });
  const documents = field(form, "attach_documents") === "on" ? ((docs.data ?? []) as { id: string; title: string }[]) : [];
  if (kind === "document_delivery" && !documents.length) back(`${BASE}/${id}#emails`, { error: "onboarding_no_documents" });
  const attachments: Attach[] = [...(useInvoice ? [{ type: "invoice" as const, id: invoice!.id, sale_id: invoice!.sale_id, number: invoice!.number }] : []),
    ...documents.map(d => ({ type: "document" as const, id: d.id, title: d.title }))];
  const company2 = company.contact, origin = appOrigin(), company_name = c.trade_name || c.legal_name;
  const stage = isStage(o.stage) ? o.stage : null;
  const lifecycle = isLifecycleKind(kind) ? renderLifecycle({ kind, lang: L, contactName: ct!.full_name, companyName: company_name, product: o.title, representative: signer!,
    company: company2, origin, stageLabel: stage ? STAGE_LABEL[stage][L === "es" ? 0 : 1] : o.stage, progress: progress(readChecklist(o.checklist)),
    nextStep: o.next_step || null, note: field(form, "note").slice(0, 1000), liveUrl: o.live_url || null, deliveredOn: o.delivered_at ? o.delivered_at.slice(0, 10) : null,
    pending: readChecklist(o.checklist).filter(item => !item.done).map(item => item.label[L === "es" ? 0 : 1]) }) : undefined;
  // A lifecycle message the recorded facts do not support (no delivery, no owner note) is never prepared.
  if (lifecycle === null) back(`${BASE}/${id}#emails`, { error: kind === "delivery_notice" ? "outbox_not_delivered" : "outbox_note_required" });
  const rendered: Rendered = lifecycle ? lifecycle : kind === "client_welcome"
    ? renderClientWelcome({ lang: L, contactName: ct!.full_name, companyName: company_name, service: PRODUCT_LABEL[o.product_type][L === "es" ? 0 : 1] + ` — ${o.title}`,
      representative: signer!, nextStep: o.next_step && o.next_step_confirmed ? `${o.next_step}${o.next_step_on ? ` (${o.next_step_on})` : ""}` : o.next_step || null,
      documents: [...documents.map(d => d.title), ...clientDocuments(o.product_type, L).map(d => `${d.id} · ${d.title}`)], invoiceNumber: useInvoice ? invoice!.number : null, company: company2, origin })
    : kind === "invoice_copy"
      ? renderInvoiceCopy({ lang: L, contactName: ct!.full_name, invoiceNumber: invoice!.number, companyName: company_name, representative: signer!, company: company2, origin })
      : renderDocumentDelivery({ lang: L, contactName: ct!.full_name, documents: documents.map(d => d.title), product: o.title, representative: signer!, company: company2, origin });
  // Same kind + onboarding + recipient + attachments = same message: a double click or refresh returns the existing row.
  const key = `${kind}:${o.id}:${sha(`${ct!.email!.toLowerCase()}|${attachments.map(a => a.id).sort().join(",")}|${L}|${lifecycle ? rendered.text : ""}`).slice(0, 24)}`;
  const existing = await supabase.from("crm_email_outbox").select("id,status").eq("idempotency_key", key).maybeSingle();
  if (existing.data && (existing.data as { status: string }).status !== "cancelled") back(`${BASE}/${id}#emails`, { ok: "email_exists" });
  const r = await supabase.from("crm_email_outbox").insert({ idempotency_key: existing.data ? `${key}:r${Date.now().toString(36)}` : key, kind, client_id: o.client_id, onboarding_id: o.id,
    to_email: ct!.email, to_name: ct!.full_name, from_email: company2.clientSender, reply_to: company2.replyTo, subject: rendered.subject,
    body_html: rendered.html, body_text: rendered.text, lang: L, attachments, created_by: userId });
  if (r.error) back(`${BASE}/${id}#emails`, { error: code(r.error) });
  refresh(o); back(`${BASE}/${id}#emails`, { ok: "email_prepared" });
}

async function buildAttachments(db: SupabaseClient, clientId: string, list: Attach[], L: Lang): Promise<Attachment[] | null> {
  const out: Attachment[] = [];
  for (const a of list) {
    if (a.type === "invoice") {
      const r = await loadInvoiceDoc(db, a.sale_id, a.id, L);
      if (!r.ok || r.clientId !== clientId || r.doc.status !== "issued") return null; // voided/foreign invoices are never sent
      out.push({ filename: invoiceFileName(r.doc.number), content: renderInvoicePdf(r.doc, L, new Date().toISOString().slice(0, 10)), contentType: "application/pdf" });
    } else {
      const d = await db.from("crm_client_documents").select("client_id,snapshot,sha256,status,generator").eq("id", a.id).maybeSingle();
      const doc = d.data as { client_id: string; snapshot: unknown; sha256: string; status: string; generator: string } | null;
      if (!doc || doc.client_id !== clientId || !isManualSnapshot(doc.snapshot)) return null;
      let pdf: Uint8Array; try { pdf = renderManualPdf(doc.snapshot, doc.generator); } catch { return null; }
      if (sha(pdf) !== doc.sha256) return null; // integrity: the stored hash must match the regenerated bytes
      out.push({ filename: manualFileName(doc.snapshot), content: pdf, contentType: "application/pdf" });
    }
  }
  return out;
}

/** Owner approval + send. Claimed with a compare-and-set on (status, attempts) so a double click sends once. */
export async function approveAndSend(form: FormData) {
  const { supabase, userId } = await ownerForAction();
  const mid = uuidField(form, "message_id"); if (!mid) back(BASE, { error: "onboarding_invalid" });
  const m = await supabase.from("crm_email_outbox").select("*").eq("id", mid).maybeSingle();
  const msg = m.data as { id: string; client_id: string; onboarding_id: string | null; kind: string; status: string; attempts: number; to_email: string; to_name: string;
    from_email: string; reply_to: string; subject: string; body_html: string; body_text: string; lang: Lang; attachments: Attach[] } | null;
  const page = msg?.onboarding_id ? `${BASE}/${msg.onboarding_id}#emails` : BASE;
  if (!msg) back(BASE, { error: "not_found" });
  if (!["prepared", "approved", "failed", "blocked_no_transport"].includes(msg!.status) || msg!.attempts >= 5) back(page, { error: "outbox_final" });
  const claim = await supabase.from("crm_email_outbox").update({ status: "approved", approved_by: userId, approved_at: new Date().toISOString(), attempts: msg!.attempts + 1 })
    .eq("id", msg!.id).eq("status", msg!.status).eq("attempts", msg!.attempts).select("id").maybeSingle();
  if (claim.error || !claim.data) back(page, { error: "outbox_in_progress" });
  const files = await buildAttachments(supabase, msg!.client_id, msg!.attachments ?? [], msg!.lang);
  if (!files) {
    await supabase.from("crm_email_outbox").update({ status: "failed", error: "attachment_invalid" }).eq("id", msg!.id);
    back(page, { error: "outbox_attachment_invalid" });
  }
  const r = await sendMail({ from: msg!.from_email, fromName: "Avalon Core Agency", to: msg!.to_email, toName: msg!.to_name, replyTo: msg!.reply_to,
    subject: msg!.subject, html: msg!.body_html, text: msg!.body_text, attachments: files! });
  if (r.status === "sent") {
    await supabase.from("crm_email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), provider: r.provider, provider_message_id: r.messageId, error: "" }).eq("id", msg!.id);
    if (msg!.kind === "client_welcome" && msg!.onboarding_id) {
      const o = await supabase.from("crm_client_onboardings").select("id,stage,version").eq("id", msg!.onboarding_id).maybeSingle();
      const ob = o.data as { id: string; stage: string; version: number } | null;
      if (ob?.stage === "approved") await supabase.from("crm_client_onboardings").update({ stage: "welcome_sent" }).eq("id", ob.id).eq("version", ob.version);
    }
  } else {
    await supabase.from("crm_email_outbox").update({ status: r.status === "blocked_no_transport" ? "blocked_no_transport" : "failed",
      error: r.status === "failed" ? r.error : r.reason }).eq("id", msg!.id);
  }
  for (const p of [`/admin/workspace/crm/clients/${msg!.client_id}`, msg!.onboarding_id ? `${BASE}/${msg!.onboarding_id}` : BASE]) revalidatePath(p);
  back(page, r.status === "sent" ? { ok: "email_sent" } : { error: r.status === "blocked_no_transport" ? `outbox_${r.reason}` : "outbox_send_failed" });
}

/** When SMTP is not configured an owner may send from Gmail and record the evidence (e.g. the sent message's id). */
export async function recordManualSend(form: FormData) {
  const { supabase, userId } = await ownerForAction();
  const mid = uuidField(form, "message_id"); const evidence = field(form, "evidence").trim().slice(0, 300);
  if (!mid) back(BASE, { error: "onboarding_invalid" });
  const m = await supabase.from("crm_email_outbox").select("id,status,onboarding_id,client_id,kind").eq("id", mid).maybeSingle();
  const msg = m.data as { id: string; status: string; onboarding_id: string | null; client_id: string; kind: string } | null;
  const page = msg?.onboarding_id ? `${BASE}/${msg.onboarding_id}#emails` : BASE;
  if (!msg) back(BASE, { error: "not_found" });
  if (evidence.length < 10) back(page, { error: "outbox_evidence_required" });
  const r = await supabase.from("crm_email_outbox").update({ status: "sent", approved_by: userId, approved_at: new Date().toISOString(), sent_at: new Date().toISOString(),
    provider: "manual", provider_message_id: evidence, error: "" }).eq("id", msg!.id).in("status", ["prepared", "approved", "failed", "blocked_no_transport"]).select("id").maybeSingle();
  if (r.error || !r.data) back(page, { error: r.error ? code(r.error) : "outbox_final" });
  if (msg!.kind === "client_welcome" && msg!.onboarding_id) {
    const o = await supabase.from("crm_client_onboardings").select("id,stage,version").eq("id", msg!.onboarding_id).maybeSingle();
    const ob = o.data as { id: string; stage: string; version: number } | null;
    if (ob?.stage === "approved") await supabase.from("crm_client_onboardings").update({ stage: "welcome_sent" }).eq("id", ob.id).eq("version", ob.version);
  }
  revalidatePath(`/admin/workspace/crm/clients/${msg!.client_id}`);
  back(page, { ok: "email_recorded" });
}

export async function cancelEmail(form: FormData) {
  const { supabase } = await ownerForAction();
  const mid = uuidField(form, "message_id"); if (!mid) back(BASE, { error: "onboarding_invalid" });
  const r = await supabase.from("crm_email_outbox").update({ status: "cancelled" }).eq("id", mid).in("status", ["prepared", "approved", "failed", "blocked_no_transport"]).select("onboarding_id").maybeSingle();
  const ob = (r.data as { onboarding_id: string | null } | null)?.onboarding_id;
  back(ob ? `${BASE}/${ob}#emails` : BASE, r.error || !r.data ? { error: "outbox_final" } : { ok: "email_cancelled" });
}
