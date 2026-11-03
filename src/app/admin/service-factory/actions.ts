"use server";

import { revalidatePath } from "next/cache";
import { ownerForAction, back, field, uuidField } from "@/lib/os/actions";
import { CatalogInputError, parseServiceCatalogForm, serviceCatalogPayload } from "@/lib/service-factory/domain";

const PATH = "/admin/service-factory";
const errorCode = (error: { code?: string } | null) =>
  error?.code === "23505" ? "duplicate" :
  error?.code === "42P01" || error?.code === "42703" ? "schema_pending" :
  error?.code === "42501" ? "forbidden" : "unavailable";

function refresh() {
  revalidatePath(PATH);
  revalidatePath("/admin/workspace/crm/sales/new");
  revalidatePath("/admin/dashboard");
}

/** Only approved owners can create or modify catalog entries. New SKUs are hidden from sales. */
export async function saveCatalogService(form: FormData) {
  const { supabase } = await ownerForAction();
  let input;
  try { input = parseServiceCatalogForm(form); }
  catch (e) { back(PATH, { error: e instanceof CatalogInputError ? e.code : "invalid" }); }

  const rawId = field(form, "id");
  const id = uuidField(form, "id");
  if (rawId && !id) back(PATH, { error: "invalid" });
  const payload = serviceCatalogPayload(input);
  if (id) {
    const rawVersion = field(form, "version");
    if (!/^[1-9][0-9]{0,8}$/.test(rawVersion)) back(PATH, { error: "conflict" });
    const version = Number(rawVersion);
    const current = await supabase.from("crm_service_catalog")
      .select("id,code,version,readiness").eq("id", id).maybeSingle();
    if (current.error || !current.data) back(PATH, { error: errorCode(current.error) });
    if (current.data.code !== input.code || current.data.version !== version) back(PATH, { error: "conflict" });

    // Paused and retired services immediately leave the sale form. Existing
    // legacy active draft SKUs are otherwise left untouched for continuity.
    const patch = { ...payload, ...(["paused", "retired"].includes(input.readiness) ? { active: false } : {}) };
    const result = await supabase.from("crm_service_catalog")
      .update(patch).eq("id", id).eq("version", version).select("id").maybeSingle();
    if (result.error || !result.data) back(PATH, { error: result.error ? errorCode(result.error) : "conflict" });
    refresh();
    back(PATH, { ok: "saved" });
  }
  // Client input never determines status for insertion; new SKUs start inactive.
  // Owners must explicitly mark readiness 'sellable' and activate separately.
  const result = await supabase.from("crm_service_catalog")
    .insert({ ...payload, code: input.code, active: false }).select("id").maybeSingle();
  if (result.error || !result.data) back(PATH, { error: errorCode(result.error) });
  refresh();
  back(PATH, { ok: "created" });
}

/** Distinct approval before an SKU is available to the existing sales form. */
export async function setCatalogAvailability(form: FormData) {
  const { supabase } = await ownerForAction();
  const id = uuidField(form, "id");
  const versionText = field(form, "version");
  const enabled = field(form, "enabled");
  if (!id || !/^[1-9][0-9]{0,8}$/.test(versionText) || !["yes", "no"].includes(enabled))
    back(PATH, { error: "invalid" });
  const version = Number(versionText);
  const current = await supabase.from("crm_service_catalog")
    .select("id,version,readiness,active").eq("id", id).maybeSingle();
  if (current.error || !current.data) back(PATH, { error: errorCode(current.error) });
  if (current.data.version !== version) back(PATH, { error: "conflict" });
  if (enabled === "yes" && current.data.readiness !== "sellable")
    back(PATH, { error: "not_ready" });
  const result = await supabase.from("crm_service_catalog")
    .update({ active: enabled === "yes" })
    .eq("id", id).eq("version", version).select("id").maybeSingle();
  if (result.error || !result.data) back(PATH, { error: result.error ? errorCode(result.error) : "conflict" });
  refresh();
  back(PATH, { ok: "availability" });
}
