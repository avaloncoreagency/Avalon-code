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
  const { data, error } = await supabase.from("crm_clients").insert(row).select("id").single();
  if (error) back(LIST, { error: error.code === "23505" ? "sale_client_exists" : saleErrorCode(error) });
  revalidatePath(LIST);
  back(`${LIST}/${data.id}`, { ok: "created" });
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
  back(path, { ok: "saved" });
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
  if (!row.legal_name || !row.source || !STATUSES.includes(row.status) || !Number.isSafeInteger(version)) back(path, { error: "sale_invalid" });
  if (row.website && !/^https:\/\/[^\s<>"]+$/.test(row.website)) back(path, { error: "sale_invalid_website" });
  // Optimistic concurrency: the crm_private.stamp trigger bumps version on every update.
  const { data, error } = await supabase.from("crm_clients").update(row).eq("id", clientId).eq("version", version).select("id").maybeSingle();
  if (error) back(path, { error: error.code === "23505" ? "sale_client_exists" : saleErrorCode(error) });
  if (!data) back(path, { error: "conflict" });
  revalidatePath(path);
  revalidatePath(LIST);
  back(path, { ok: "saved" });
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
