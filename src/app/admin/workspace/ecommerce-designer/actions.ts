"use server";
import { revalidatePath } from "next/cache";
import { back, field, ownerForAction, uuidField } from "@/lib/os/actions";
import { mapDbError } from "@/lib/os/data";
import { CURRENCIES, cleanText, httpsUrl, intInRange, oneOf, parsePrice, type Currency } from "@/lib/os/domain";

const BASE = "/admin/workspace/ecommerce-designer";

async function store(form: FormData) {
  const projectId = uuidField(form, "projectId");
  if (!projectId) back(BASE, { error: "not_found" });
  const session = await ownerForAction();
  const { data, error, status } = await session.supabase.from("os_projects").select("id,settings,version").eq("id", projectId).eq("module", "ecommerce").maybeSingle();
  if (error) back(`${BASE}/${projectId}`, { error: mapDbError(error, status) });
  if (!data) back(BASE, { error: "not_found" });
  const currency = oneOf((data.settings as Record<string, unknown> | null)?.currency, CURRENCIES);
  return { ...session, projectId, project: data as { id: string; settings: Record<string, unknown>; version: number }, currency: (currency.ok ? currency.value : "USD") as Currency, path: `${BASE}/${projectId}` };
}

function productInput(form: FormData, currency: Currency) {
  const name = cleanText(field(form, "name"), { min: 1, max: 160 });
  const sku = cleanText(field(form, "sku"), { max: 64 });
  const category = cleanText(field(form, "category"), { max: 80 });
  const description = cleanText(field(form, "description"), { max: 4000 });
  const price = parsePrice(field(form, "price") || "0", currency);
  const inventory = intInRange(field(form, "inventory") || "0", 0, 10_000_000);
  const image = httpsUrl(field(form, "image_url"));
  const status = oneOf(field(form, "status") || "draft", ["draft", "active", "archived"] as const);
  for (const r of [name, sku, category, description, price, inventory, image, status]) if (!r.ok) return { ok: false as const, error: r.error };
  if (!name.ok || !sku.ok || !category.ok || !description.ok || !price.ok || !inventory.ok || !image.ok || !status.ok) return { ok: false as const, error: "invalid" };
  if (!/^[A-Za-z0-9._-]*$/.test(sku.value)) return { ok: false as const, error: "invalid" };
  return { ok: true as const, value: { name: name.value, sku: sku.value, category: category.value, description: description.value, price_cents: price.value, inventory: inventory.value, image_url: image.value, status: status.value } };
}

export async function updateStoreSettings(form: FormData) {
  const ctx = await store(form);
  const currency = oneOf(field(form, "currency"), CURRENCIES);
  const version = Number(field(form, "version"));
  if (!currency.ok) back(ctx.path, { error: "invalid" });
  if (version !== ctx.project.version) back(ctx.path, { error: "conflict" });
  const { data, error, status } = await ctx.supabase.from("os_projects").update({ settings: { ...ctx.project.settings, currency: currency.value } })
    .eq("id", ctx.projectId).eq("version", version).select("id");
  if (error) back(ctx.path, { error: mapDbError(error, status) });
  if (!data?.length) back(ctx.path, { error: "conflict" });
  revalidatePath(ctx.path);
  back(ctx.path, { ok: "saved" });
}

export async function createProduct(form: FormData) {
  const ctx = await store(form);
  const input = productInput(form, ctx.currency);
  if (!input.ok) back(ctx.path + "#new-product", { error: input.error });
  const { error, status } = await ctx.supabase.from("os_store_products").insert({ ...input.value, project_id: ctx.projectId, created_by: ctx.userId });
  if (error) back(ctx.path + "#new-product", { error: mapDbError(error, status) });
  revalidatePath(ctx.path);
  back(ctx.path, { ok: "created" });
}

export async function updateProduct(form: FormData) {
  const ctx = await store(form);
  const productId = uuidField(form, "productId");
  if (!productId) back(ctx.path, { error: "not_found" });
  const path = `${ctx.path}/products/${productId}`;
  const version = Number(field(form, "version"));
  const input = productInput(form, ctx.currency);
  if (!input.ok) back(path, { error: input.error });
  if (!Number.isSafeInteger(version)) back(path, { error: "invalid" });
  const { data, error, status } = await ctx.supabase.from("os_store_products").update(input.value)
    .eq("id", productId).eq("project_id", ctx.projectId).eq("version", version).select("id");
  if (error) back(path, { error: mapDbError(error, status) });
  if (!data?.length) back(path, { error: "conflict" });
  revalidatePath(ctx.path);
  back(path, { ok: "saved" });
}

export async function deleteProduct(form: FormData) {
  const ctx = await store(form);
  const productId = uuidField(form, "productId");
  if (!productId) back(ctx.path, { error: "not_found" });
  if (field(form, "confirm") !== "yes") back(`${ctx.path}/products/${productId}`, { error: "required" });
  const { error, status } = await ctx.supabase.from("os_store_products").delete().eq("id", productId).eq("project_id", ctx.projectId);
  if (error) back(`${ctx.path}/products/${productId}`, { error: mapDbError(error, status) });
  revalidatePath(ctx.path);
  back(ctx.path, { ok: "deleted" });
}
