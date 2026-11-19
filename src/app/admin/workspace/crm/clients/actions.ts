"use server";
import { revalidatePath } from "next/cache";
import { ownerForAction, back, field, uuidField } from "@/lib/os/actions";
import { saleErrorCode } from "@/lib/sales/domain";

const LIST = "/admin/workspace/crm/clients";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (form: FormData, name: string, max: number) => {
  const value = field(form, name).trim();
  if (value.length > max) throw Error("too_long");
  return value;
};

export async function createClientRecord(form: FormData) {
  const { supabase, userId } = await ownerForAction();
  let row: Record<string, string>;
  try {
    row = { legal_name: text(form, "legal_name", 200), trade_name: text(form, "trade_name", 200), website: text(form, "website", 500),
      industry: text(form, "industry", 120), country: text(form, "country", 80), location: text(form, "location", 200),
      source: text(form, "source", 200) || "Registro manual", notes: text(form, "notes", 4000), owner_id: userId };
  } catch { back(LIST, { error: "sale_too_long" }); }
  if (!row.legal_name) back(LIST, { error: "sale_client_required" });
  if (row.website && !/^https:\/\/[^\s<>"]+$/.test(row.website)) back(LIST, { error: "sale_invalid_website" });
  // Reviewed RPC, when deployed, creates the client and its first opportunity atomically.
  // Retain the established client-only behavior until the separate migration is approved.
  const linked = await supabase.rpc("crm_register_client_with_opportunity", { p_request: row });
  if (!linked.error && linked.data && typeof linked.data.client_id === "string") {
    revalidatePath("/admin/workspace/crm/leads");
    revalidatePath(LIST);
    back(`${LIST}/${linked.data.client_id}`, { ok: "created" });
  }
  if (linked.error && !["PGRST202", "42883"].includes(linked.error.code ?? "")) {
    back(LIST, { error: linked.error.code === "23505" ? "sale_client_exists" : saleErrorCode(linked.error) });
  }
  const { data, error } = await supabase.from("crm_clients").insert(row).select("id").single();
  if (error) back(LIST, { error: error.code === "23505" ? "sale_client_exists" : saleErrorCode(error) });
  revalidatePath(LIST);
  back(`${LIST}/${data.id}`, { ok: "created" });
}

/** Explicit owner-only repair of an old client that has no commercial lead. */
export async function ensureClientOpportunity(form: FormData) {
  const { supabase } = await ownerForAction();
  const clientId = uuidField(form, "client_id");
  if (!clientId) back(LIST, { error: "sale_invalid" });
  const path = `${LIST}/${clientId}`;
  const { data, error } = await supabase.rpc("crm_ensure_client_opportunity", { p_client_id: clientId });
  if (error || typeof data !== "string") back(path, { error:
    ["PGRST202", "42883"].includes(error?.code ?? "") ? "schema_pending"
      : error ? saleErrorCode(error) : "unavailable" });
  revalidatePath(path);
  revalidatePath(LIST);
  revalidatePath("/admin/workspace/crm/leads");
  back(`/admin/workspace/crm/leads?lead=${data}`, { ok: "saved" });
}

export async function addContact(form: FormData) {
  const { supabase } = await ownerForAction();
  const clientId = uuidField(form, "client_id");
  if (!clientId) back(LIST, { error: "sale_invalid" });
  const path = `${LIST}/${clientId}`;
  let row: Record<string, string | boolean | null>;
  try {
    const email = text(form, "email", 254).toLowerCase();
    if (email && !EMAIL.test(email)) back(path, { error: "sale_invalid_email" });
    row = { client_id: clientId, full_name: text(form, "full_name", 160), email: email || null, phone: text(form, "phone", 40), role: text(form, "role", 120) };
  } catch { back(path, { error: "sale_too_long" }); }
  if (!row.full_name) back(path, { error: "sale_contact_name" });
  const primary = await supabase.from("crm_contacts").select("id").eq("client_id", clientId).eq("is_primary", true).limit(1);
  if (primary.error) back(path, { error: saleErrorCode(primary.error) });
  row.is_primary = primary.data.length === 0;
  const { error } = await supabase.from("crm_contacts").insert(row);
  if (error) back(path, { error: error.code === "23505" ? "duplicate" : saleErrorCode(error) });
  revalidatePath(path);
  back(path, { ok: "saved", edit: "1" });
}

/** Edit an existing contact without replacing the client's identity or primary designation. */
export async function updateContact(form: FormData) {
  const { supabase } = await ownerForAction();
  const clientId = uuidField(form, "client_id");
  const contactId = uuidField(form, "contact_id");
  if (!clientId || !contactId) back(LIST, { error: "sale_invalid" });
  const path = `${LIST}/${clientId}`;
  const version = Number(field(form, "version"));
  if (!Number.isSafeInteger(version) || version < 1) back(path, { error: "sale_invalid", edit: "1" });
  let full_name: string, email: string, phone: string, role: string;
  try {
    full_name = text(form, "full_name", 160);
    email = text(form, "email", 254).toLowerCase();
    phone = text(form, "phone", 40);
    role = text(form, "role", 120);
  } catch { back(path, { error: "sale_too_long", edit: "1" }); }
  if (!full_name) back(path, { error: "sale_contact_name", edit: "1" });
  if (email && !EMAIL.test(email)) back(path, { error: "sale_invalid_email", edit: "1" });
  // Owner RLS, client scope and optimistic version prevent cross-client updates and stale overwrites.
  const { data, error } = await supabase.from("crm_contacts")
    .update({ full_name, email: email || null, phone, role })
    .eq("id", contactId).eq("client_id", clientId).eq("version", version)
    .select("id").maybeSingle();
  if (error) back(path, { error: error.code === "23505" ? "duplicate" : saleErrorCode(error), edit: "1" });
  if (!data) back(path, { error: "conflict", edit: "1" });
  revalidatePath(path);
  back(path, { ok: "saved", edit: "1" });
}

export async function updateClientNotes(form: FormData) {
  const { supabase } = await ownerForAction();
  const clientId = uuidField(form, "client_id");
  if (!clientId) back(LIST, { error: "sale_invalid" });
  const path = `${LIST}/${clientId}`;
  const notes = field(form, "notes");
  if (notes.length > 4000) back(path, { error: "sale_too_long" });
  const { data, error } = await supabase.from("crm_clients").update({ notes }).eq("id", clientId).select("id").maybeSingle();
  if (error || !data) back(path, { error: error ? saleErrorCode(error) : "sale_client_missing" });
  revalidatePath(path);
  back(path, { ok: "saved" });
}

const STATUSES = ["active", "inactive", "archived"];
export async function updateClient(form: FormData) {
  const { supabase } = await ownerForAction();
  const clientId = uuidField(form, "client_id");
  if (!clientId) back(LIST, { error: "sale_invalid" });
  const path = `${LIST}/${clientId}`;
  const version = Number(field(form, "version"));
  let row: Record<string, string>;
  try {
    row = { legal_name: text(form, "legal_name", 200), trade_name: text(form, "trade_name", 200), website: text(form, "website", 500),
      industry: text(form, "industry", 120), country: text(form, "country", 80), location: text(form, "location", 200),
      source: text(form, "source", 200), status: field(form, "status") };
  } catch { back(path, { error: "sale_too_long" }); }
  if (form.has("notes")) {
    try { row.notes = text(form, "notes", 4000); }
    catch { back(path, { error: "sale_too_long", edit: "1" }); }
  }
  if (!row.legal_name || !row.source || !STATUSES.includes(row.status) || !Number.isSafeInteger(version)) back(path, { error: "sale_invalid" });
  if (row.website && !/^https:\/\/[^\s<>"]+$/.test(row.website)) back(path, { error: "sale_invalid_website" });
  // Optimistic concurrency: the crm_private.stamp trigger bumps version on every update.
  const { data, error } = await supabase.from("crm_clients").update(row).eq("id", clientId).eq("version", version).select("id").maybeSingle();
  if (error) back(path, { error: error.code === "23505" ? "sale_client_exists" : saleErrorCode(error) });
  if (!data) back(path, { error: "conflict" });
  revalidatePath(path);
  revalidatePath(LIST);
  back(path, { ok: "saved", edit: "1" });
}

const KINDS = ["note", "call", "email", "whatsapp", "meeting", "task"];
/** Activity or follow-up on the client (and its origin lead, when there is one). */
export async function addClientActivity(form: FormData) {
  const { supabase } = await ownerForAction();
  const clientId = uuidField(form, "client_id");
  if (!clientId) back(LIST, { error: "sale_invalid" });
  const path = `${LIST}/${clientId}`;
  const body = field(form, "body").trim();
  const kind = field(form, "kind") || "note";
  const due = field(form, "due_on").trim();
  if (!body || body.length > 4000 || !KINDS.includes(kind)) back(path, { error: "sale_invalid" });
  if (due && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(`${due}T00:00:00Z`)))) back(path, { error: "sale_invalid_date" });
  const client = await supabase.from("crm_clients").select("id,origin_lead_id").eq("id", clientId).maybeSingle();
  if (client.error || !client.data) back(path, { error: client.error ? saleErrorCode(client.error) : "sale_client_missing" });
  const { error } = await supabase.from("crm_activities").insert({
    client_id: clientId, lead_id: client.data.origin_lead_id, body, kind,
    status: due ? "pending" : "completed", due_at: due ? `${due}T17:00:00Z` : null,
  });
  if (error) back(path, { error: saleErrorCode(error) });
  revalidatePath(path);
  back(path, { ok: "saved" });
}
