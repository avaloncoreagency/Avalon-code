"use server";
// Persistence for the Nova Website Designer (Codex UI). Writes go through the owner's own Supabase session, so RLS
// applies; every page update is guarded by its row version (optimistic concurrency) and the existing
// os_website_pages trigger snapshots each content change into os_website_page_versions.
import { revalidatePath } from "next/cache";
import { ownerForAction } from "@/lib/os/actions";
import { mapDbError } from "@/lib/os/data";
import { cleanText, isSlug, isUuid, slugify, validateBlocks, type Block } from "@/lib/os/domain";

const BASE = "/admin/workspace/website-designer";
const MAX_STUDIO_PAGES = 30;

export type StudioPageInput = { id: string; title: string; blocks: unknown; version: number | null };
export type StudioPageResult =
  | { id: string; ok: true; version: number; slug: string }
  | { id: string; ok: false; error: "conflict" | "invalid" | "denied" | "duplicate" | "unavailable" | "schema_pending" | "not_found"; detail?: string };
export type StudioSaveResult = { ok: boolean; error?: string; pages: StudioPageResult[] };

type Valid = { id: string; title: string; blocks: Block[]; version: number | null };

function validate(input: unknown): { ok: true; pages: Valid[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_STUDIO_PAGES) return { ok: false, error: "invalid" };
  const pages: Valid[] = [];
  const seen = new Set<string>();
  for (const raw of input as StudioPageInput[]) {
    if (!raw || typeof raw !== "object" || !isUuid(raw.id) || seen.has(raw.id)) return { ok: false, error: "invalid" };
    seen.add(raw.id);
    const title = cleanText(raw.title, { min: 1, max: 160 });
    if (!title.ok) return { ok: false, error: `title:${raw.id}` };
    const blocks = validateBlocks(raw.blocks);
    if (!blocks.ok) return { ok: false, error: `${blocks.error}:${raw.id}` };
    const version = raw.version === null ? null : Number(raw.version);
    if (version !== null && (!Number.isSafeInteger(version) || version < 1)) return { ok: false, error: "invalid" };
    pages.push({ id: raw.id, title: title.value, blocks: blocks.value, version });
  }
  return { ok: true, pages };
}

/** Save the changed pages of a Website Designer project. Never deletes pages; returns a per-page result. */
export async function saveWebsiteStudio(projectId: string, input: StudioPageInput[]): Promise<StudioSaveResult> {
  if (!isUuid(projectId)) return { ok: false, error: "not_found", pages: [] };
  const valid = validate(input);
  if (!valid.ok) return { ok: false, error: valid.error, pages: [] };
  const { supabase, userId } = await ownerForAction();

  const project = await supabase.from("os_projects").select("id").eq("id", projectId).eq("module", "website").maybeSingle();
  if (project.error) return { ok: false, error: mapDbError(project.error, project.status), pages: [] };
  if (!project.data) return { ok: false, error: "not_found", pages: [] };

  const existing = await supabase.from("os_website_pages").select("id,slug").eq("project_id", projectId).limit(500);
  if (existing.error) return { ok: false, error: mapDbError(existing.error, existing.status), pages: [] };
  const slugs = new Set((existing.data ?? []).map(p => p.slug as string));
  let position = existing.data?.length ?? 0;

  const results: StudioPageResult[] = [];
  for (const page of valid.pages) {
    if (page.version !== null) {
      const { data, error, status } = await supabase.from("os_website_pages").update({ title: page.title, blocks: page.blocks })
        .eq("id", page.id).eq("project_id", projectId).eq("version", page.version).select("id,version,slug");
      if (error) results.push({ id: page.id, ok: false, error: mapDbError(error, status) });
      else if (!data?.length) results.push({ id: page.id, ok: false, error: "conflict" });
      else results.push({ id: page.id, ok: true, version: data[0].version, slug: data[0].slug });
      continue;
    }
    let base = slugify(page.title) || "pagina";
    if (!isSlug(base)) base = "pagina";
    let slug = base;
    for (let n = 2; slugs.has(slug); n++) slug = `${base.slice(0, 74)}-${n}`;
    const { data, error, status } = await supabase.from("os_website_pages")
      .insert({ id: page.id, project_id: projectId, title: page.title, slug, blocks: page.blocks, position: Math.min(position, 10000), created_by: userId })
      .select("id,version,slug").single();
    if (error || !data) { results.push({ id: page.id, ok: false, error: error ? mapDbError(error, status) : "unavailable" }); continue; }
    slugs.add(slug); position++;
    results.push({ id: page.id, ok: true, version: data.version, slug: data.slug });
  }
  revalidatePath(`${BASE}/${projectId}`);
  return { ok: results.every(r => r.ok), pages: results };
}
