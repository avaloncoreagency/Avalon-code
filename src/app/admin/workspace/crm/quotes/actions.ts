"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { back, field, ownerForAction, uuidField } from "@/lib/os/actions";
import {
  QUOTE_STATUSES, canonicalQuote, clientSafe, validateInternal, validateQuote,
  type QuoteContent, type QuoteInternal, type QuoteStatus,
} from "@/lib/quotes/model";

const BASE = "/admin/workspace/crm/quotes";
/** Only these database error codes are echoed back to the URL; anything else becomes "save". */
const KNOWN = new Set([
  "crm_forbidden", "quote_lead_missing", "quote_missing", "quote_version_conflict", "quote_not_revisable", "quote_invalid_transition",
  "quote_note_required", "quote_commission_to_negotiate", "quote_expired", "quote_invalid_model_shape", "quote_invalid_lines",
  "quote_invalid_commission", "quote_invalid_dates", "quote_invalid_content",
]);
function dbCode(error: { message?: string; code?: string } | null): string {
  if (!error) return "save";
  if (error.code === "42883" || error.code === "PGRST202" || error.code === "42P01" || error.code === "PGRST205") return "schema";
  const m = (error.message ?? "").match(/[a-z_]+/g)?.find(x => KNOWN.has(x));
  return m ?? "save";
}

function parsePayload(form: FormData): { content: QuoteContent; internal: QuoteInternal; digest: string } | null {
  try {
    const raw = JSON.parse(field(form, "content")) as QuoteContent;
    const internal = JSON.parse(field(form, "internal") || "{}") as QuoteInternal;
    const normalizedInternal: QuoteInternal = {
      directCosts: String(internal?.directCosts ?? ""), marginNote: String(internal?.marginNote ?? ""), confidential: String(internal?.confidential ?? ""),
    };
    if (validateQuote(raw).length || validateInternal(normalizedInternal).length) return null;
    // Only the client-safe projection is stored as content; internal notes go to their own column.
    const content = clientSafe(raw);
    if (validateQuote(content).length) return null;
    const digest = createHash("sha256").update(canonicalQuote(content)).digest("hex");
    return { content, internal: normalizedInternal, digest };
  } catch {
    return null;
  }
}

export async function createQuote(form: FormData) {
  const { supabase } = await ownerForAction();
  const leadId = uuidField(form, "lead_id");
  const requestKey = uuidField(form, "request_key");
  const from = field(form, "from");
  const retry = BASE + "/new?lead=" + (leadId ?? "");
  if (!leadId || !requestKey) back(BASE, { error: "invalid" });
  const payload = parsePayload(form);
  if (!payload) back(retry, { error: "fields" });
  const { data, error } = await supabase.rpc("crm_quote_create", {
    p_lead: leadId, p_request_key: requestKey, p_content: payload.content, p_internal: payload.internal, p_sha256: payload.digest,
  });
  const result = data as { quote_id?: string; existing?: boolean } | null;
  if (error || !result?.quote_id) back(retry, { error: dbCode(error) });
  revalidatePath(BASE);
  back(BASE + "/" + result.quote_id, { ok: result.existing ? "existing" : "created", ...(from === "client" ? { from } : {}) });
}

export async function reviseQuote(form: FormData) {
  const { supabase } = await ownerForAction();
  const quoteId = uuidField(form, "quote_id");
  const expected = Number(field(form, "expected_version"));
  if (!quoteId || !Number.isInteger(expected) || expected < 1) back(BASE, { error: "invalid" });
  const here = BASE + "/" + quoteId;
  const payload = parsePayload(form);
  if (!payload) back(here + "/edit", { error: "fields" });
  const note = field(form, "note").trim().slice(0, 1000);
  const { data, error } = await supabase.rpc("crm_quote_revise", {
    p_quote: quoteId, p_expected_version: expected, p_content: payload.content, p_internal: payload.internal, p_sha256: payload.digest, p_note: note,
  });
  if (error || typeof data !== "number") back(here + "/edit", { error: dbCode(error) });
  revalidatePath(here);
  back(here, { ok: "revised" });
}

export async function transitionQuote(form: FormData) {
  const { supabase } = await ownerForAction();
  const quoteId = uuidField(form, "quote_id");
  const expected = Number(field(form, "expected_version"));
  const to = field(form, "to") as QuoteStatus;
  if (!quoteId || !Number.isInteger(expected) || expected < 1 || !QUOTE_STATUSES.includes(to)) back(BASE, { error: "invalid" });
  const here = BASE + "/" + quoteId;
  const note = field(form, "note").trim().slice(0, 1000);
  const { error } = await supabase.rpc("crm_quote_transition", { p_quote: quoteId, p_expected_version: expected, p_to: to, p_note: note });
  if (error) back(here, { error: dbCode(error) });
  revalidatePath(here);
  revalidatePath(BASE);
  back(here, { ok: "status_" + to });
}
