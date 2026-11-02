"use server";
import { revalidatePath } from "next/cache";
import { back, field, ownerForAction, uuidField } from "@/lib/os/actions";
import { mapDbError } from "@/lib/os/data";
import { CHANNELS, CONTENT_STATUSES, cleanText, httpsUrl, isoDate, oneOf } from "@/lib/os/domain";

const BASE = "/admin/workspace/marketing-hub";

async function campaign(form: FormData) {
  const projectId = uuidField(form, "projectId");
  if (!projectId) back(BASE, { error: "not_found" });
  const session = await ownerForAction();
  return { ...session, projectId, path: `${BASE}/${projectId}` };
}

function itemInput(form: FormData) {
  const title = cleanText(field(form, "title"), { min: 1, max: 200 });
  const channel = oneOf(field(form, "channel"), CHANNELS);
  const status = oneOf(field(form, "status") || "idea", CONTENT_STATUSES);
  const planned = isoDate(field(form, "planned_for"));
  const body = cleanText(field(form, "body"), { max: 20000 });
  const asset = httpsUrl(field(form, "asset_url"));
  const notes = cleanText(field(form, "notes"), { max: 4000 });
  if (!title.ok) return { ok: false as const, error: title.error };
  if (!channel.ok || !status.ok) return { ok: false as const, error: "invalid" };
  if (!planned.ok) return { ok: false as const, error: planned.error };
  if (!body.ok) return { ok: false as const, error: body.error };
  if (!asset.ok) return { ok: false as const, error: asset.error };
  if (!notes.ok) return { ok: false as const, error: notes.error };
  if (status.value === "planned" && !planned.value) return { ok: false as const, error: "date" };
  return { ok: true as const, value: { title: title.value, channel: channel.value, status: status.value, planned_for: planned.value, body: body.value, asset_url: asset.value, notes: notes.value } };
}

export async function createMarketingItem(form: FormData) {
  const ctx = await campaign(form);
  const input = itemInput(form);
  if (!input.ok) back(ctx.path + "#new-item", { error: input.error });
  const { error, status } = await ctx.supabase.from("os_marketing_items").insert({ ...input.value, project_id: ctx.projectId, created_by: ctx.userId });
  if (error) back(ctx.path + "#new-item", { error: mapDbError(error, status) });
  revalidatePath(ctx.path);
  back(ctx.path, { ok: "created" });
}

export async function updateMarketingItem(form: FormData) {
  const ctx = await campaign(form);
  const itemId = uuidField(form, "itemId");
  const version = Number(field(form, "version"));
  if (!itemId || !Number.isSafeInteger(version)) back(ctx.path, { error: "invalid" });
  const path = `${ctx.path}/items/${itemId}`;
  const input = itemInput(form);
  if (!input.ok) back(path, { error: input.error });
  const { data, error, status } = await ctx.supabase.from("os_marketing_items").update(input.value)
    .eq("id", itemId).eq("project_id", ctx.projectId).eq("version", version).select("id");
  if (error) back(path, { error: mapDbError(error, status) });
  if (!data?.length) back(path, { error: "conflict" });
  revalidatePath(ctx.path);
  back(path, { ok: "saved" });
}

export async function setMarketingStatus(form: FormData) {
  const ctx = await campaign(form);
  const itemId = uuidField(form, "itemId");
  const version = Number(field(form, "version"));
  const next = oneOf(field(form, "status"), CONTENT_STATUSES);
  if (!itemId || !next.ok || !Number.isSafeInteger(version)) back(ctx.path, { error: "invalid" });
  const { data, error, status } = await ctx.supabase.from("os_marketing_items").update({ status: next.value })
    .eq("id", itemId).eq("project_id", ctx.projectId).eq("version", version).select("id");
  if (error) back(ctx.path, { error: mapDbError(error, status) });
  if (!data?.length) back(ctx.path, { error: "conflict" });
  revalidatePath(ctx.path);
  back(ctx.path, { ok: "saved" });
}

export async function deleteMarketingItem(form: FormData) {
  const ctx = await campaign(form);
  const itemId = uuidField(form, "itemId");
  if (!itemId) back(ctx.path, { error: "invalid" });
  if (field(form, "confirm") !== "yes") back(`${ctx.path}/items/${itemId}`, { error: "required" });
  const { error, status } = await ctx.supabase.from("os_marketing_items").delete().eq("id", itemId).eq("project_id", ctx.projectId);
  if (error) back(`${ctx.path}/items/${itemId}`, { error: mapDbError(error, status) });
  revalidatePath(ctx.path);
  back(ctx.path, { ok: "deleted" });
}
