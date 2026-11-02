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
