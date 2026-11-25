"use server";
// Seller actions. Every write goes through a database RPC that re-checks, with the caller's own session, that the
// lead/proposal belongs to this seller. The UI checks here are only for friendly errors, never the authorization.
import { createHash, randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSeller } from "@/lib/auth/staff";
import { canonicalQuote, clientSafe, validateInternal, validateQuote, QUOTE_STATUSES, type QuoteContent, type QuoteInternal, type QuoteStatus } from "@/lib/quotes/model";
import { sellerErrorCode } from "@/lib/staff/seller";
import { DEFAULT_TZ, localToUtc } from "@/lib/staff/work";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const field = (form: FormData, name: string) => { const v = form.get(name); return typeof v === "string" ? v.trim() : ""; };
const uuid = (form: FormData, name: string) => { const v = field(form, name); return UUID.test(v) ? v : null; };

function go(path: string, key: "status" | "error", value: string, hash = ""): never {
  if (!path.startsWith("/staff") || path.startsWith("//")) path = "/staff";
  revalidatePath("/staff");
  redirect(`${path}?${key}=${encodeURIComponent(value)}${hash ? "#" + hash : ""}`);
}

function leadPayload(form: FormData) {
  const date = field(form, "follow_up_date"), time = field(form, "follow_up_time");
  const follow = date ? localToUtc(date, time || "09:00", DEFAULT_TZ) : null;
  return {
    contact: field(form, "contact"), contact_title: field(form, "contact_title"), email: field(form, "email"), phone: field(form, "phone"),
    website: field(form, "website"), city: field(form, "city"), value: field(form, "value"), next_action: field(form, "next_action"),
    follow_up_at: follow ?? "",
  };
}

export async function createSellerLead(form: FormData) {
  const { supabase } = await requireSeller();
  const company = field(form, "company");
  if (!company || company.length > 200) go("/staff", "error", "staff_lead_invalid", "seller-leads");
  const request_key = uuid(form, "request_key") ?? randomUUID();
  const { data, error } = await supabase.rpc("staff_lead_create", {
    request: { request_key, company, industry: field(form, "industry"), source: field(form, "source"), ...leadPayload(form) },
  });
  if (error) go("/staff", "error", sellerErrorCode(error), "seller-leads");
  go("/staff", "status", (data as { existing?: boolean } | null)?.existing ? "lead-existing" : "lead-created", "seller-leads");
}

export async function updateSellerLead(form: FormData) {
  const { supabase } = await requireSeller();
  const lead = uuid(form, "lead_id"), version = Number(field(form, "version"));
  if (!lead || !Number.isInteger(version) || version < 1) go("/staff", "error", "invalid", "seller-leads");
  const request: Record<string, string> = { ...leadPayload(form), stage_id: field(form, "stage_id") };
  const reason = field(form, "loss_reason");
  if (reason) request.loss_reason = reason;
  const { error } = await supabase.rpc("staff_lead_update", { p_lead: lead, p_expected_version: version, request });
  if (error) go("/staff", "error", sellerErrorCode(error), "seller-leads");
  go("/staff", "status", "lead-saved", "seller-leads");
}

function parseQuote(form: FormData): { content: QuoteContent; internal: QuoteInternal; digest: string } | null {
  try {
    const raw = JSON.parse(field(form, "content")) as QuoteContent;
    const i = JSON.parse(field(form, "internal") || "{}") as QuoteInternal;
    const internal: QuoteInternal = { directCosts: String(i?.directCosts ?? ""), marginNote: String(i?.marginNote ?? ""), confidential: String(i?.confidential ?? "") };
    if (validateQuote(raw).length || validateInternal(internal).length) return null;
    const content = clientSafe(raw);
    if (validateQuote(content).length) return null;
    return { content, internal, digest: createHash("sha256").update(canonicalQuote(content)).digest("hex") };
  } catch {
    return null;
  }
}

export async function createSellerQuote(form: FormData) {
  const { supabase } = await requireSeller();
  const lead = uuid(form, "lead_id"), key = uuid(form, "request_key");
  if (!lead || !key) go("/staff", "error", "invalid", "seller-quotes");
  const payload = parseQuote(form);
  if (!payload) go(`/staff/quotes/new`, "error", "invalid");
  const { data, error } = await supabase.rpc("crm_quote_create", {
    p_lead: lead, p_request_key: key, p_content: payload.content, p_internal: payload.internal, p_sha256: payload.digest,
  });
  const id = (data as { quote_id?: string } | null)?.quote_id;
  if (error || !id) go("/staff", "error", sellerErrorCode(error), "seller-quotes");
  go(`/staff/quotes/${id}`, "status", "quote-created");
}

export async function reviseSellerQuote(form: FormData) {
  const { supabase } = await requireSeller();
  const id = uuid(form, "quote_id"), expected = Number(field(form, "expected_version"));
  if (!id || !Number.isInteger(expected) || expected < 1) go("/staff", "error", "invalid", "seller-quotes");
  const payload = parseQuote(form);
  if (!payload) go(`/staff/quotes/${id}/edit`, "error", "invalid");
  const { error } = await supabase.rpc("crm_quote_revise", {
    p_quote: id, p_expected_version: expected, p_content: payload.content, p_internal: payload.internal, p_sha256: payload.digest,
    p_note: field(form, "note").slice(0, 1000),
  });
  if (error) go(`/staff/quotes/${id}/edit`, "error", sellerErrorCode(error));
  go(`/staff/quotes/${id}`, "status", "quote-revised");
}

export async function transitionSellerQuote(form: FormData) {
  const { supabase } = await requireSeller();
  const id = uuid(form, "quote_id"), expected = Number(field(form, "expected_version"));
  const to = field(form, "to") as QuoteStatus;
  if (!id || !Number.isInteger(expected) || expected < 1 || !QUOTE_STATUSES.includes(to) || to === "approved")
    go("/staff", "error", "invalid", "seller-quotes");
  const { error } = await supabase.rpc("crm_quote_transition", { p_quote: id, p_expected_version: expected, p_to: to, p_note: field(form, "note").slice(0, 1000) });
  if (error) go(`/staff/quotes/${id}`, "error", sellerErrorCode(error));
  go(`/staff/quotes/${id}`, "status", "quote-status");
}

export async function closeSellerSale(form: FormData) {
  const { supabase } = await requireSeller();
  const id = uuid(form, "quote_id"), versionNo = Number(field(form, "version_no"));
  if (!id || !Number.isInteger(versionNo) || versionNo < 1) go("/staff", "error", "invalid", "seller-quotes");
  const soldOn = /^\d{4}-\d{2}-\d{2}$/.test(field(form, "sold_on")) ? field(form, "sold_on") : "";
  const { error } = await supabase.rpc("crm_quote_close_sale", { request: { quote_id: id, version_no: versionNo, sold_on: soldOn } });
  if (error) go(`/staff/quotes/${id}`, "error", sellerErrorCode(error));
  go("/staff", "status", "sale-closed", "seller-sales");
}
