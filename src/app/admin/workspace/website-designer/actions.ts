"use server";
import { revalidatePath } from "next/cache";
import { getLang } from "@/lib/i18n-server";
import { websitePageTemplate } from "@/lib/os/website-templates";
import { back, field, ownerForAction, uuidField } from "@/lib/os/actions";
import { mapDbError } from "@/lib/os/data";
import { BLOCK_TYPES, cleanText, emptyBlock, isSlug, moveItem, oneOf, readBlocks, slugify, validateBlock, validateBlocks, MAX_BLOCKS, type Block } from "@/lib/os/domain";

const BASE = "/admin/workspace/website-designer";

async function context(form: FormData) {
  const projectId = uuidField(form, "projectId");
  const pageId = uuidField(form, "pageId");
  if (!projectId) back(BASE, { error: "not_found" });
  const session = await ownerForAction();
  return { ...session, projectId, pageId, editor: pageId ? `${BASE}/${projectId}/pages/${pageId}` : `${BASE}/${projectId}` };
}

async function loadPage(form: FormData) {
  const ctx = await context(form);
  if (!ctx.pageId) back(ctx.editor, { error: "not_found" });
  const version = Number(field(form, "version"));
  if (!Number.isSafeInteger(version)) back(ctx.editor, { error: "invalid" });
  const { data, error, status } = await ctx.supabase.from("os_website_pages").select("id,blocks,version").eq("id", ctx.pageId).eq("project_id", ctx.projectId).maybeSingle();
  if (error) back(ctx.editor, { error: mapDbError(error, status) });
  if (!data) back(ctx.editor, { error: "not_found" });
  if (data.version !== version) back(ctx.editor, { error: "conflict" });
  return { ...ctx, pageId: ctx.pageId, version, blocks: readBlocks(data.blocks) };
}

async function writeBlocks(ctx: Awaited<ReturnType<typeof loadPage>>, blocks: Block[], anchor?: number) {
  const valid = validateBlocks(blocks);
  if (!valid.ok) back(ctx.editor, { error: valid.error });
  const { data, error, status } = await ctx.supabase.from("os_website_pages").update({ blocks: valid.value })
    .eq("id", ctx.pageId).eq("project_id", ctx.projectId).eq("version", ctx.version).select("id");
  if (error) back(ctx.editor, { error: mapDbError(error, status) });
  if (!data?.length) back(ctx.editor, { error: "conflict" });
  revalidatePath(ctx.editor);
  back(ctx.editor + (anchor === undefined ? "" : `#block-${anchor}`), { ok: "saved" });
}

export async function createPage(form: FormData) {
  const ctx = await context(form);
  const title = cleanText(field(form, "title"), { min: 1, max: 160 });
  if (!title.ok) back(ctx.editor, { error: title.error });
  const slug = field(form, "slug").trim() || slugify(title.value) || "pagina";
  if (!isSlug(slug)) back(ctx.editor, { error: "slug" });
  const templateName = field(form, "template") || "blank";
  const preset = websitePageTemplate(templateName, await getLang());
  if (!preset) back(ctx.editor, { error: "invalid" });
  const validated = validateBlocks(preset);
  if (!validated.ok) back(ctx.editor, { error: validated.error });
  const { count } = await ctx.supabase.from("os_website_pages").select("id", { count: "exact", head: true }).eq("project_id", ctx.projectId);
  const { data, error, status } = await ctx.supabase.from("os_website_pages")
    .insert({ project_id: ctx.projectId, title: title.value, slug, blocks: validated.value, position: Math.min(count ?? 0, 10000), created_by: ctx.userId })
    .select("id").single();
  if (error || !data) back(ctx.editor, { error: mapDbError(error, status) });
  revalidatePath(ctx.editor);
  back(`${BASE}/${ctx.projectId}/pages/${data.id}`, { ok: "created" });
}

export async function updatePageMeta(form: FormData) {
  const ctx = await loadPage(form);
  const title = cleanText(field(form, "title"), { min: 1, max: 160 });
  const seo = cleanText(field(form, "seo_description"), { max: 300 });
  const slug = field(form, "slug").trim();
  if (!title.ok) back(ctx.editor, { error: title.error });
  if (!seo.ok) back(ctx.editor, { error: seo.error });
  if (!isSlug(slug)) back(ctx.editor, { error: "slug" });
  const { data, error, status } = await ctx.supabase.from("os_website_pages").update({ title: title.value, slug, seo_description: seo.value })
    .eq("id", ctx.pageId).eq("version", ctx.version).select("id");
  if (error) back(ctx.editor, { error: mapDbError(error, status) });
  if (!data?.length) back(ctx.editor, { error: "conflict" });
  revalidatePath(ctx.editor);
  back(ctx.editor, { ok: "saved" });
}

export async function addBlock(form: FormData) {
  const ctx = await loadPage(form);
  const type = oneOf(field(form, "type"), BLOCK_TYPES);
  if (!type.ok || ctx.blocks.length >= MAX_BLOCKS) back(ctx.editor, { error: "block" });
  await writeBlocks(ctx, [...ctx.blocks, emptyBlock(type.value)], ctx.blocks.length);
}

export async function saveBlock(form: FormData) {
  const ctx = await loadPage(form);
  const index = Number(field(form, "index"));
  if (!Number.isInteger(index) || index < 0 || index >= ctx.blocks.length) back(ctx.editor, { error: "block" });
  const block = validateBlock({
    type: ctx.blocks[index].type,
    heading: field(form, "heading"), subheading: field(form, "subheading"), body: field(form, "body"),
    items: field(form, "items"), buttonLabel: field(form, "buttonLabel"), buttonHref: field(form, "buttonHref"),
  });
  if (!block.ok) back(ctx.editor + `#block-${index}`, { error: block.error });
  const blocks = ctx.blocks.slice();
  blocks[index] = block.value;
  await writeBlocks(ctx, blocks, index);
}

export async function moveBlock(form: FormData) {
  const ctx = await loadPage(form);
  const index = Number(field(form, "index"));
  const direction = field(form, "direction") === "up" ? -1 : 1;
  await writeBlocks(ctx, moveItem(ctx.blocks, index, direction), Math.max(0, index + direction));
}

export async function deleteBlock(form: FormData) {
  const ctx = await loadPage(form);
  const index = Number(field(form, "index"));
  if (!Number.isInteger(index) || index < 0 || index >= ctx.blocks.length) back(ctx.editor, { error: "block" });
  await writeBlocks(ctx, ctx.blocks.filter((_, i) => i !== index));
}

export async function setPageStatus(form: FormData) {
  const ctx = await loadPage(form);
  const publish = field(form, "status") === "published";
  const { data, error, status } = await ctx.supabase.from("os_website_pages")
    .update({ status: publish ? "published" : "draft", published_at: publish ? new Date().toISOString() : null })
    .eq("id", ctx.pageId).eq("version", ctx.version).select("id");
  if (error) back(ctx.editor, { error: mapDbError(error, status) });
  if (!data?.length) back(ctx.editor, { error: "conflict" });
  revalidatePath(ctx.editor);
  back(ctx.editor, { ok: publish ? "published" : "unpublished" });
}

export async function restoreVersion(form: FormData) {
  const ctx = await loadPage(form);
  const versionId = uuidField(form, "versionId");
  if (!versionId) back(ctx.editor, { error: "not_found" });
  const { data, error, status } = await ctx.supabase.from("os_website_page_versions").select("title,blocks").eq("id", versionId).eq("page_id", ctx.pageId).maybeSingle();
  if (error) back(ctx.editor, { error: mapDbError(error, status) });
  if (!data) back(ctx.editor, { error: "not_found" });
  const blocks = validateBlocks(readBlocks(data.blocks));
  const title = cleanText(data.title, { min: 1, max: 160 });
  if (!blocks.ok || !title.ok) back(ctx.editor, { error: "invalid" });
  const update = await ctx.supabase.from("os_website_pages").update({ title: title.value, blocks: blocks.value })
    .eq("id", ctx.pageId).eq("version", ctx.version).select("id");
  if (update.error) back(ctx.editor, { error: mapDbError(update.error, update.status) });
  if (!update.data?.length) back(ctx.editor, { error: "conflict" });
  revalidatePath(ctx.editor);
  back(ctx.editor, { ok: "restored" });
}

export async function deletePage(form: FormData) {
  const ctx = await loadPage(form);
  if (field(form, "confirm") !== "yes") back(ctx.editor, { error: "required" });
  const { error, status } = await ctx.supabase.from("os_website_pages").delete().eq("id", ctx.pageId).eq("version", ctx.version);
  if (error) back(ctx.editor, { error: mapDbError(error, status) });
  revalidatePath(`${BASE}/${ctx.projectId}`);
  back(`${BASE}/${ctx.projectId}`, { ok: "deleted" });
}
