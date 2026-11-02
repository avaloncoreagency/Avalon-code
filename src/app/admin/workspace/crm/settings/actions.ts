"use server";
import { revalidatePath } from "next/cache";
import { ownerForAction, back, field, uuidField } from "@/lib/os/actions";
import { saleErrorCode } from "@/lib/sales/domain";

const PATH = "/admin/workspace/crm/settings";

/** Catalog edits are audited by the crm_audit trigger; code/department are not editable here. */
export async function saveService(form: FormData) {
  const { supabase } = await ownerForAction();
  const id = uuidField(form, "id");
  const version = Number(field(form, "version"));
  const name = field(form, "name").trim();
  const price = field(form, "suggested_price").trim();
  const assignee = field(form, "default_assignee_id");
  if (!id || !Number.isSafeInteger(version) || !name || name.length > 120) back(PATH, { error: "sale_invalid" });
  if (price && !/^[0-9]{1,13}(\.[0-9]{1,2})?$/.test(price)) back(PATH, { error: "sale_invalid_amount" });
  if (assignee && !uuidField(form, "default_assignee_id")) back(PATH, { error: "sale_invalid_member" });
  const { data, error } = await supabase.from("crm_service_catalog")
    .update({ name, suggested_price: price || null, default_assignee_id: assignee || null, active: field(form, "active") === "on" })
    .eq("id", id).eq("version", version).select("id").maybeSingle();
  if (error) back(PATH, { error: saleErrorCode(error) });
  if (!data) back(PATH, { error: "conflict" });
  revalidatePath(PATH);
  revalidatePath("/admin/workspace/crm/sales/new");
  back(PATH, { ok: "saved" });
}

export async function toggleRule(form: FormData) {
  const { supabase } = await ownerForAction();
  const id = uuidField(form, "id");
  const enabled = field(form, "enabled");
  if (!id || (enabled !== "true" && enabled !== "false")) back(PATH, { error: "sale_invalid" });
  const { data, error } = await supabase.from("crm_automation_rules").update({ enabled: enabled === "true" }).eq("id", id).select("id").maybeSingle();
  if (error || !data) back(PATH, { error: error ? saleErrorCode(error) : "sale_invalid" });
  revalidatePath(PATH);
  back(PATH, { ok: "saved" });
}
