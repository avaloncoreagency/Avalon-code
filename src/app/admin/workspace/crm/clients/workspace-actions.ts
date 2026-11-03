"use server";

import { revalidatePath } from "next/cache";
import { ownerForAction, back, field, uuidField } from "@/lib/os/actions";

const ROOT = "/admin/workspace/crm/clients";
const clientPath = (id: string) => `${ROOT}/${id}#internal-workspace`;
const clean = (form: FormData, key: string, max: number) => {
  const value = field(form, key).trim();
  return value.length <= max ? value : null;
};
const TYPES = new Set(["note", "meeting", "milestone", "decision"]);
const validVersion = (raw: string) => /^(?:[1-9][0-9]{0,8})$/.test(raw);
const code = (error: { code?: string } | null) =>
  error?.code === "42P01" || error?.code === "PGRST205" ? "workspace_pending" :
  error?.code === "23505" ? "conflict" : "workspace_save_failed";

export async function saveClientWorkspace(form: FormData) {
  const { supabase } = await ownerForAction();
  const id = uuidField(form, "client_id");
  if (!id) back(ROOT, { error: "sale_invalid" });
  const path = clientPath(id);
  const package_name = clean(form, "package_name", 160);
  const development_stage = clean(form, "development_stage", 100);
  const next_step = clean(form, "next_step", 2000);
  const version = field(form, "version");
  if (package_name === null || development_stage === null || next_step === null || (version !== "0" && !validVersion(version))) back(path, { error: "workspace_invalid" });

  if (version === "0") {
    const result = await supabase.from("crm_client_workspace")
      .insert({ client_id: id, package_name, development_stage, next_step }).select("client_id").maybeSingle();
    if (result.error || !result.data) back(path, { error: code(result.error) });
  } else {
    const result = await supabase.from("crm_client_workspace")
      .update({ package_name, development_stage, next_step })
      .eq("client_id", id).eq("version", Number(version)).select("client_id").maybeSingle();
    if (result.error || !result.data) back(path, { error: result.error ? code(result.error) : "conflict" });
  }
  revalidatePath(`${ROOT}/${id}`);
  back(path, { ok: "workspace_saved" });
}

export async function createClientJournalEntry(form: FormData) {
  const { supabase } = await ownerForAction();
  const id = uuidField(form, "client_id");
  if (!id) back(ROOT, { error: "sale_invalid" });
  const path = clientPath(id);
  const kind = field(form, "kind");
  const title = clean(form, "title", 160);
  const body = clean(form, "journal_body", 4000);
  if (!TYPES.has(kind) || !title || !body) back(path, { error: "workspace_invalid" });
  const result = await supabase.from("crm_client_journal")
    .insert({ client_id: id, kind, title, body }).select("id").maybeSingle();
  if (result.error || !result.data) back(path, { error: code(result.error) });
  revalidatePath(`${ROOT}/${id}`);
  back(path, { ok: "workspace_saved" });
}

export async function reviseClientJournalEntry(form: FormData) {
  const { supabase } = await ownerForAction();
  const clientId = uuidField(form, "client_id");
  const entryId = uuidField(form, "entry_id");
  if (!clientId || !entryId) back(ROOT, { error: "sale_invalid" });
  const path = clientPath(clientId);
  const kind = field(form, "kind");
  const title = clean(form, "title", 160);
  const body = clean(form, "journal_body", 4000);
  const version = field(form, "version");
  if (!TYPES.has(kind) || !title || !body || !validVersion(version)) back(path, { error: "workspace_invalid" });
  const result = await supabase.from("crm_client_journal")
    .update({ kind, title, body })
    .eq("id", entryId).eq("client_id", clientId).eq("version", Number(version)).select("id").maybeSingle();
  if (result.error || !result.data) back(path, { error: result.error ? code(result.error) : "conflict" });
  revalidatePath(`${ROOT}/${clientId}`);
  back(path, { ok: "workspace_saved" });
}

export async function appendClientCost(form: FormData) {
  const { supabase } = await ownerForAction();
  const id = uuidField(form, "client_id");
  if (!id) back(ROOT, { error: "sale_invalid" });
  const path = clientPath(id);
  const category = clean(form, "category", 100);
  const memo = clean(form, "memo", 1000);
  const currency = field(form, "currency").trim().toUpperCase();
  const incurred_on = field(form, "incurred_on");
  const amountRaw = field(form, "amount").trim();
  const amount = Number(amountRaw);
  if (!category || !memo || !/^[A-Z]{3}$/.test(currency) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(incurred_on) ||
    !/^\-?\d{1,12}(?:\.\d{1,2})?$/.test(amountRaw) ||
    !Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1000000000000) {
    back(path, { error: "workspace_invalid" });
  }
  const result = await supabase.from("crm_client_costs")
    .insert({ client_id: id, category, memo, currency, incurred_on, amount }).select("id").maybeSingle();
  if (result.error || !result.data) back(path, { error: code(result.error) });
  revalidatePath(`${ROOT}/${id}`);
  back(path, { ok: "workspace_saved" });
}
