"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/session";
import { FUNNEL_TEMPLATES, isFunnelTemplate, validSlug, type FunnelTemplate } from "@/lib/growth/funnel";

const BASE = "/admin/workspace/marketing-hub/funnels";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const back = (key: string, value: string): never => redirect(`${BASE}?${key}=${encodeURIComponent(value)}`);

/** Create a DRAFT only. No campaign, page, ad or payment is published. */
export async function createGrowthFunnel(form: FormData) {
  const { supabase, user } = await requireOwner();
  const slug = field(form, "slug").toLowerCase();
  const template = field(form, "template");
  if (!validSlug(slug) || !isFunnelTemplate(template)) back("error", "invalid");
  const defaults = FUNNEL_TEMPLATES[template as FunnelTemplate];
  const title = field(form, "title") || defaults.title;
  const subheading = field(form, "subheading") || defaults.subheading;
  const cta = field(form, "cta") || defaults.cta;
  const clientId = field(form, "client_id");
  const projectId = field(form, "project_id");
  if (title.length < 4 || title.length > 120 || subheading.length > 500 ||
      cta.length < 4 || cta.length > 80 ||
      (clientId && !UUID.test(clientId)) || (projectId && !UUID.test(projectId))) back("error", "invalid");

  const { error } = await supabase.from("crm_growth_funnels").insert({
    slug, template, title, subheading, cta,
    status: "draft", created_by: user.id,
    client_id: clientId || null, project_id: projectId || null,
  });
  if (error) back("error", error.code === "23505" ? "duplicate" :
    ["42P01", "PGRST205", "PGRST202"].includes(error.code) ? "schema" : "unavailable");
  revalidatePath(BASE);
  back("ok", "created");
}

/** Deliberate owner action; client and advertiser permissions are not touched. */
export async function setGrowthFunnelStatus(form: FormData) {
  const { supabase } = await requireOwner();
  const id = field(form, "id");
  const next = field(form, "status");
  const version = Number(field(form, "version"));
  if (!UUID.test(id) || !["active", "paused", "draft"].includes(next) ||
      !Number.isSafeInteger(version) || version < 1) back("error", "invalid");
  const { data, error } = await supabase.from("crm_growth_funnels")
    .update({ status: next, version: version + 1 })
    .eq("id", id).eq("version", version).select("id").maybeSingle();
  if (error) back("error", ["42P01", "PGRST205", "PGRST202"].includes(error.code) ? "schema" : "unavailable");
  if (!data) back("error", "conflict");
  revalidatePath(BASE);
  back("ok", "updated");
}
