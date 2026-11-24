"use server";
import { revalidatePath } from "next/cache";
import { back, field, ownerForAction, uuidField } from "@/lib/os/actions";

const SCOPES = ["name", "logo", "testimonial", "case_study", "screenshots", "results", "reference"];
const CHANNELS = ["website", "social", "proposals", "ads", "events"];
const page = (clientId: string) => `/admin/workspace/crm/clients/${clientId}#consents`;
const err = (m?: string) => /\b(consent_[a-z_]+)\b/.exec(m ?? "")?.[1] ?? (m?.includes("check constraint") ? "consent_invalid" : "save");

/** Records that a testimonial/endorsement authorization was REQUESTED. Nothing is usable until it is granted. */
export async function requestConsent(form: FormData) {
  const { supabase, userId } = await ownerForAction();
  const clientId = uuidField(form, "client_id"); if (!clientId) back("/admin/workspace/crm/clients", { error: "consent_invalid" });
  const r = await supabase.from("crm_testimonial_consents").insert({ client_id: clientId, signer_name: field(form, "signer_name").trim().slice(0, 160),
    signer_role: field(form, "signer_role").trim().slice(0, 120), signer_email: field(form, "signer_email").trim().toLowerCase().slice(0, 254), created_by: userId });
  if (r.error) back(page(clientId!), { error: err(r.error.message) });
  revalidatePath(`/admin/workspace/crm/clients/${clientId}`); back(page(clientId!), { ok: "consent" });
}

/**
 * Explicit grant. Every use and channel must be ticked by the owner from the client's written answer (nothing is
 * preselected); testimonials need the exact approved text, results claims need substantiation, and evidence is required.
 */
export async function grantConsent(form: FormData) {
  const { supabase } = await ownerForAction();
  const id = uuidField(form, "id"), clientId = uuidField(form, "client_id");
  if (!id || !clientId) back("/admin/workspace/crm/clients", { error: "consent_invalid" });
  const scopes = form.getAll("scopes").map(String).filter(v => SCOPES.includes(v));
  const channels = form.getAll("channels").map(String).filter(v => CHANNELS.includes(v));
  const expires = field(form, "expires_on");
  if (!scopes.length || !channels.length || (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires))) back(page(clientId!), { error: "consent_invalid" });
  const r = await supabase.from("crm_testimonial_consents").update({ status: "granted", granted_at: new Date().toISOString(), scopes: [...new Set(scopes)], channels: [...new Set(channels)],
    approved_text: field(form, "approved_text").trim().slice(0, 4000), restrictions: field(form, "restrictions").trim().slice(0, 2000),
    material_connection: field(form, "material_connection").trim().slice(0, 500), results_substantiation: field(form, "results_substantiation").trim().slice(0, 2000),
    evidence: field(form, "evidence").trim().slice(0, 1000), expires_on: expires || null })
    .eq("id", id).eq("client_id", clientId).eq("status", "requested").select("id").maybeSingle();
  if (r.error || !r.data) back(page(clientId!), { error: r.error ? err(r.error.message) : "consent_final" });
  revalidatePath(`/admin/workspace/crm/clients/${clientId}`); back(page(clientId!), { ok: "consent" });
}

export async function closeConsent(form: FormData) {
  const { supabase } = await ownerForAction();
  const id = uuidField(form, "id"), clientId = uuidField(form, "client_id"); const to = field(form, "to");
  if (!id || !clientId || !["declined", "revoked"].includes(to)) back("/admin/workspace/crm/clients", { error: "consent_invalid" });
  const patch = to === "revoked" ? { status: "revoked", revoked_at: new Date().toISOString(), revoke_reason: field(form, "reason").trim().slice(0, 500) } : { status: "declined" };
  const r = await supabase.from("crm_testimonial_consents").update(patch).eq("id", id).eq("client_id", clientId)
    .in("status", to === "revoked" ? ["granted"] : ["requested"]).select("id").maybeSingle();
  if (r.error || !r.data) back(page(clientId!), { error: r.error ? err(r.error.message) : "consent_final" });
  revalidatePath(`/admin/workspace/crm/clients/${clientId}`); back(page(clientId!), { ok: "consent" });
}
