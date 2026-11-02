"use server";
import { revalidatePath } from "next/cache";
import { back, field, ownerForAction, uuidField } from "@/lib/os/actions";
import { mapDbError } from "@/lib/os/data";
import {
  BLUEPRINT_TEMPLATES, CURRENCIES, MODULE_KEYS, PROJECT_STATUSES, cleanText, emptyBlueprint, oneOf, type ModuleKey,
} from "@/lib/os/domain";

const BASE: Record<ModuleKey, string> = {
  website: "/admin/workspace/website-designer",
  ecommerce: "/admin/workspace/ecommerce-designer",
  crm_creator: "/admin/workspace/crm-creator",
  receptionist: "/admin/workspace/ai-receptionist",
  marketing: "/admin/workspace/marketing-hub",
};

function initialSettings(module: ModuleKey, form: FormData): Record<string, unknown> {
  if (module === "ecommerce") {
    const currency = oneOf(field(form, "currency"), CURRENCIES);
    return { currency: currency.ok ? currency.value : "USD" };
  }
  if (module === "crm_creator") {
    const template = BLUEPRINT_TEMPLATES[field(form, "template")];
    return { blueprint: template ? template.blueprint : emptyBlueprint() };
  }
  if (module === "marketing") {
    const goal = cleanText(field(form, "goal"), { max: 500 });
    return { goal: goal.ok ? goal.value : "" };
  }
  return {};
}

export async function createProject(form: FormData) {
  const module = oneOf(field(form, "module"), MODULE_KEYS);
  if (!module.ok) back("/admin/dashboard", { error: "invalid" });
  const base = BASE[module.value];
  const { supabase, userId } = await ownerForAction();
  const name = cleanText(field(form, "name"), { min: 1, max: 120 });
  const description = cleanText(field(form, "description"), { max: 2000 });
  if (!name.ok) back(base, { error: name.error });
  if (!description.ok) back(base, { error: description.error });
  const { data, error, status } = await supabase.from("os_projects")
    .insert({ module: module.value, name: name.value, description: description.value, status: "draft", settings: initialSettings(module.value, form), created_by: userId })
    .select("id").single();
  if (error || !data) back(base, { error: mapDbError(error, status) });
  revalidatePath(base);
  back(`${base}/${data.id}`, { ok: "created" });
}

export async function updateProject(form: FormData) {
  const module = oneOf(field(form, "module"), MODULE_KEYS);
  if (!module.ok) back("/admin/dashboard", { error: "invalid" });
  const base = BASE[module.value];
  const id = uuidField(form, "id");
  if (!id) back(base, { error: "not_found" });
  const path = `${base}/${id}${field(form, "return") === "settings" ? "/settings" : ""}`;
  const { supabase } = await ownerForAction();
  const name = cleanText(field(form, "name"), { min: 1, max: 120 });
  const description = cleanText(field(form, "description"), { max: 2000 });
  const status = oneOf(field(form, "status"), PROJECT_STATUSES);
  const version = Number(field(form, "version"));
  if (!name.ok) back(path, { error: name.error });
  if (!description.ok) back(path, { error: description.error });
  if (!status.ok || !Number.isSafeInteger(version)) back(path, { error: "invalid" });
  const { data, error, status: http } = await supabase.from("os_projects")
    .update({ name: name.value, description: description.value, status: status.value })
    .eq("id", id).eq("module", module.value).eq("version", version).select("id");
  if (error) back(path, { error: mapDbError(error, http) });
  if (!data?.length) back(path, { error: "conflict" });
  revalidatePath(base);
  back(path, { ok: status.value === "archived" ? "archived" : "saved" });
}
