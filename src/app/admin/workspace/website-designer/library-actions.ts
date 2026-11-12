"use server";
// Website Designer → Library: snapshot every page of a website project as a STATIC site and register it as an
// immutable version of the SAME project through the existing Direct Bridge import pipeline (validation, SHA-256,
// content-addressed blobs, RLS, audit). Deterministic archive + content-digest idempotency key: saving the same
// content twice returns the existing version instead of creating a duplicate.
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { back, ownerForAction, uuidField } from "@/lib/os/actions";
import { getLang } from "@/lib/i18n-server";
import { pageToHtml } from "@/lib/os/exporters";
import { BRIDGE_BUCKET, BRIDGE_LIMITS } from "@/lib/project-bridge/policy";
import { processImport } from "@/lib/project-bridge/service";
import { supabaseRepo, supabaseStore } from "@/lib/project-bridge/supabase";
import { writeZip } from "@/lib/project-bridge/zip-write";

const BASE = "/admin/workspace/website-designer";

export async function saveWebsiteToLibrary(form: FormData) {
  const projectId = uuidField(form, "projectId");
  if (!projectId) back(BASE, { error: "not_found" });
  const { supabase, userId } = await ownerForAction();
  const path = `${BASE}/${projectId}`;
  const project = await supabase.from("os_projects").select("id,name").eq("id", projectId).eq("module", "website").maybeSingle();
  if (!project.data) back(BASE, { error: "not_found" });
  const pages = await supabase.from("os_website_pages").select("title,slug,seo_description,blocks").eq("project_id", projectId).order("position").order("created_at").limit(30);
  if (pages.error) back(path, { error: "unavailable" });
  if (!pages.data?.length) back(path, { error: "no_pages" });
  const lang = await getLang();
  const enc = new TextEncoder();
  // First page is the home page (index.html); the others live at /<slug>/.
  const files = pages.data.map((p, i) => ({ path: i === 0 ? "index.html" : `${p.slug}/index.html`, bytes: enc.encode(pageToHtml(p, lang)) }));
  const zip = writeZip(files);
  if (zip.length > BRIDGE_LIMITS.archiveBytes) back(path, { error: "archive_too_large" });
  const digest = createHash("sha256").update(zip).digest("hex");
  const key = `wd-${projectId.slice(0, 8)}-${digest.slice(0, 40)}`;

  // Same content already saved by this owner → reuse that import (no duplicate version).
  const prior = await supabase.from("os_project_imports").select("id,status").eq("created_by", userId).eq("idempotency_key", key).maybeSingle();
  let importId = prior.data?.id as string | undefined;
  if (!importId) {
    importId = crypto.randomUUID();
    const archivePath = `incoming/${userId}/${importId}.zip`;
    const ins = await supabase.from("os_project_imports").insert({ id: importId, project_id: projectId, category: "website", project_name: null,
      original_name: `${project.data.name.slice(0, 100)}.zip`, source_tool: "editor", archive_path: archivePath, archive_bytes: zip.length, idempotency_key: key });
    if (ins.error) back(path, { error: ins.error.code === "54000" ? "rate_limited" : "import_not_registered" });
    const up = await supabase.storage.from(BRIDGE_BUCKET).upload(archivePath, zip, { contentType: "application/zip", upsert: false });
    if (up.error) { await supabase.from("os_project_imports").update({ status: "failed", error_code: "storage_unavailable" }).eq("id", importId); back(path, { error: "storage_unavailable" }); }
  }
  const result = await processImport(supabaseRepo(supabase), supabaseStore(supabase), importId);
  revalidatePath(path);
  // A replayed import (same content digest → same key) is the version saved before: report it as unchanged.
  if (result.status === "registered" && !prior.data) back(path, { ok: "library_version_saved", version: String(result.number) });
  if (result.status === "registered") back(path, { ok: "library_version_unchanged", version: String(result.number) });
  if (result.status === "duplicate") back(path, { ok: "library_version_unchanged", version: String(result.number) });
  back(path, { error: "library_save_failed" });
}
