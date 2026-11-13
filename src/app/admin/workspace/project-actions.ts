"use server";
import { operations } from "@/lib/os/project-operations";
import { exactCompanyName, parseCreativeRef, resolveOrCreateProductLead } from "@/lib/os/creative-company";
import { revalidatePath } from "next/cache";
import { back, field, ownerForAction, uuidField } from "@/lib/os/actions";
import { mapDbError } from "@/lib/os/data";
import { SOURCE_TOOLS } from "@/lib/project-bridge/policy";
import {
  BLUEPRINT_TEMPLATES, CURRENCIES, MODULE_KEYS, PROJECT_STATUSES, cleanText, emptyBlueprint, oneOf, type ModuleKey,
} from "@/lib/os/domain";

const BASE: Record<ModuleKey, string> = {
  website: "/admin/workspace/website-designer",
  ecommerce: "/admin/workspace/ecommerce-designer",
  crm_creator: "/admin/workspace/crm-creator",
  receptionist: "/admin/workspace/ai-receptionist",
  chatbots: "/admin/workspace/ai-chatbots",
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

async function projectOperations(form: FormData, supabase: Awaited<ReturnType<typeof ownerForAction>>['supabase']) {
  let metadata;
  try { metadata = operations(Object.fromEntries(form)); } catch { back('/admin/dashboard', {error:'invalid'}); }
  if(metadata.client_lead_id) {
    const {data,error}=await supabase.from('crm_leads').select('id').eq('id',metadata.client_lead_id).maybeSingle();
    if(error || !data)back('/admin/dashboard',{error:'invalid'});
  }
  return metadata;
}

export async function createProject(form: FormData) {
  const moduleKey = oneOf(field(form, "module"), MODULE_KEYS);
  if (!moduleKey.ok) back("/admin/dashboard", { error: "invalid" });
  const base = BASE[moduleKey.value];
  const { supabase, userId } = await ownerForAction();
  const name = cleanText(field(form, "name"), { min: 1, max: 120 });
  const description = cleanText(field(form, "description"), { max: 2000 });
  const source = oneOf(field(form,"source_tool") || "manual", SOURCE_TOOLS);
  if (!source.ok) back(base,{error:"invalid"});
  if (!name.ok) back(base, { error: name.error });
  if (!description.ok) back(base, { error: description.error });
  // Existing owner-led project flow remains unchanged when Higgsfield fields
  // are absent. Agents without an authorized owner session cannot write here.
  const metadata = await projectOperations(form, supabase);
  const clientRaw = field(form,"client_id");
  const confirmedClientId = uuidField(form,"client_id");
  if (clientRaw && !confirmedClientId) back(base,{error:"invalid"});
  const confirmedClient = confirmedClientId
    ? await supabase.from("crm_clients").select("id,origin_lead_id")
        .eq("id",confirmedClientId).neq("status","archived").maybeSingle()
    : null;
  if (confirmedClient?.error || (confirmedClientId && !confirmedClient?.data)) back(base,{error:"invalid"});
  const originatingLead = confirmedClient?.data?.origin_lead_id ?? null;
  if (confirmedClientId && metadata.client_lead_id && metadata.client_lead_id !== originatingLead) back(base,{error:"conflict"});
  let companyName: string;
  let creativeRef: string;
  try {
    companyName = exactCompanyName(field(form, "company_name"));
    creativeRef = parseCreativeRef(field(form, "higgsfield_ref"));
  } catch { back(base, { error: "invalid" }); }
  if (creativeRef && (!metadata.url && !metadata.repository || !companyName && !metadata.client_lead_id && !confirmedClientId))
    back(base, { error: "invalid" });

  if (creativeRef) {
    // A stable Higgsfield website/job ID is a replay guard, NOT proof of
    // completed generation. Without a DB unique index it is not a lock.
    const existing = await supabase.from("os_projects").select("id")
      .eq("module", moduleKey.value)
      .eq("settings->creative->>external_ref", creativeRef).limit(2);
    if (existing.error) back(base, { error: mapDbError(existing.error) });
    if (existing.data?.length === 1) back(`${base}/${existing.data[0].id}`, { ok: "existing" });
    if ((existing.data?.length ?? 0) > 1) back(base, { error: "conflict" });
  }

  let leadId = metadata.client_lead_id || originatingLead || "";
  if (!leadId && !confirmedClientId && companyName) {
    const resolved = await resolveOrCreateProductLead(supabase, userId, companyName);
    if (!resolved.ok) back(base, { error: resolved.error === "ambiguous" ? "conflict" : "unavailable" });
    leadId = resolved.id;
  }
  const settings = {
    ...initialSettings(moduleKey.value, form),
    operations: { ...metadata, client_lead_id: leadId },
    product_control: { source_tool: source.value, mode: metadata.url ? "external_reference" : "pending_delivery", recorded_at: new Date().toISOString() },
    ...(creativeRef ? { creative: { provider: "higgsfield", external_ref: creativeRef,
      state: "reference_only", added_at: new Date().toISOString() } } : {}),
  };
  const { data, error, status } = await supabase.from("os_projects")
    .insert({ module: moduleKey.value, name: name.value, description: description.value, status: "draft",
      settings, client_id: confirmedClientId, created_by: userId })
    .select("id").single();
  if (error || !data) back(base, { error: mapDbError(error, status) });
  revalidatePath(base);
  if (confirmedClientId) revalidatePath(`/admin/workspace/crm/clients/${confirmedClientId}`);
  if (leadId) {
    revalidatePath(`/admin/workspace/clients/${leadId}`);
    revalidatePath("/admin/workspace/crm/leads");
  }
  // External products open in their canonical Control HUD, not the legacy internal editor.
  revalidatePath(`/admin/workspace/products/${data.id}`);
  back(`/admin/workspace/products/${data.id}`, { ok: "created" });
}

export async function updateProject(form: FormData) {
  const moduleKey = oneOf(field(form, "module"), MODULE_KEYS);
  if (!moduleKey.ok) back("/admin/dashboard", { error: "invalid" });
  const base = BASE[moduleKey.value];
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
  const current = await supabase.from('os_projects').select('settings,client_id').eq('id',id).eq('module',moduleKey.value).eq('version',version).maybeSingle();
  if(current.error || !current.data)back(path,{error:'conflict'});
  const metadata = await projectOperations(form, supabase);
  // A confirmed client FK must never be given a mismatched legacy lead through settings.
  if (current.data.client_id && metadata.client_lead_id) {
    const related=await supabase.from("crm_clients").select("origin_lead_id")
      .eq("id",current.data.client_id).maybeSingle();
    if (related.error || !related.data || related.data.origin_lead_id!==metadata.client_lead_id)
      back(path,{error:"conflict"});
  }
  const { data, error, status: http } = await supabase.from("os_projects")
    .update({ name: name.value, description: description.value, status: status.value, settings: { ...current.data.settings, operations: metadata } })
    .eq("id", id).eq("module", moduleKey.value).eq("version", version).select("id");
  if (error) back(path, { error: mapDbError(error, http) });
  if (!data?.length) back(path, { error: "conflict" });
  revalidatePath(base);
  back(path, { ok: status.value === "archived" ? "archived" : "saved" });
}
