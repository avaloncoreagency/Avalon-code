import { getOwnerSession } from "@/lib/auth/session";
import { BRIDGE_BUCKET, BRIDGE_LIMITS, CATEGORIES, SOURCE_TOOLS, bridgeCategoryEnabled, type Category } from "@/lib/project-bridge/policy";
import { readJson, reply, sameOrigin, str, UUID } from "@/lib/project-bridge/http";

export const dynamic = "force-dynamic";

/**
 * Step 1 of an import from the library: validate the request, register the import (RLS + SQL limits: 30/h, 2 at once)
 * and hand the browser a one-time signed URL to upload the archive DIRECTLY to private Storage (no Vercel body limit,
 * real progress on iPhone). The archive is processed only in step 2, on the server.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return reply({ error: "forbidden_origin" }, 403);
  const session = await getOwnerSession();
  if (!session) return reply({ error: "unauthorized" }, 401);
  const body = await readJson(req);
  if (!body) return reply({ error: "invalid_body" }, 400);
  const name = str(body.name, 255)?.trim();
  const size = typeof body.size === "number" && Number.isInteger(body.size) ? body.size : -1;
  const category = str(body.category, 20) as Category | null;
  const sourceTool = str(body.sourceTool, 20) ?? "manual";
  const key = str(body.idempotencyKey, 100);
  const projectId = body.projectId == null ? null : str(body.projectId, 36);
  const projectName = body.projectName == null ? null : str(body.projectName, 120)?.trim() || null;
  const ext = name?.toLowerCase().endsWith(".zip") ? "zip" : /\.html?$/i.test(name ?? "") ? "html" : null;
  if (!name || !ext) return reply({ error: "unsupported_upload_type" }, 400);
  if (size < 1 || size > BRIDGE_LIMITS.archiveBytes) return reply({ error: "archive_too_large" }, 413);
  if (!category || !CATEGORIES.includes(category)) return reply({ error: "invalid_category" }, 400);
  if (!bridgeCategoryEnabled(category,process.env.AVALON_PRODUCT_CONTROL_EXTENDED_UPLOADS === "true"))
    return reply({ error: "category_not_enabled" }, 409);
  if (!(SOURCE_TOOLS as readonly string[]).includes(sourceTool)) return reply({ error: "invalid_source_tool" }, 400);
  if (!key || key.length < 8) return reply({ error: "invalid_idempotency_key" }, 400);
  if (projectId !== null && !UUID.test(projectId)) return reply({ error: "invalid_project" }, 400);

  const db = session.supabase;
  if (projectId) {
    const project = await db.from("os_projects").select("id,module,status").eq("id",projectId).maybeSingle();
    if (project.error) return reply({error:"unavailable"},503);
    if (!project.data || project.data.module!==category || project.data.status==="archived")
      return reply({error:"invalid_project"},400);
  }
  const existing = await db.from("os_project_imports")
    .select("id,status,archive_path,category,original_name,archive_bytes,project_id,source_tool,project_name")
    .eq("created_by", session.user.id).eq("idempotency_key", key).maybeSingle();
  if (existing.error) return reply({ error: "unavailable" }, 503);
  if (existing.data) {
    const previous = existing.data;
    // A retry is for the SAME owner, archive, target and category. Never reuse an
    // import ID for a changed form payload (even if a browser retained the key).
    if (previous.category !== category || previous.original_name !== name ||
        Number(previous.archive_bytes) !== size || previous.project_id !== projectId ||
        previous.source_tool !== sourceTool || previous.project_name !== projectName)
      return reply({ error: "idempotency_key_in_use" }, 409);
    const replay = { importId: previous.id, status: previous.status, replayed: true };
    if (!previous.archive_path || !["received", "failed", "awaiting_upload"].includes(previous.status))
      return reply(replay, 200);
    // A lost first response must not strand a pending import: reissue a short-lived
    // upload URL for the existing private path, with Storage upsert still forbidden.
    const retrySigned = await db.storage.from(BRIDGE_BUCKET).createSignedUploadUrl(previous.archive_path);
    if (retrySigned.error || !retrySigned.data) return reply({ error: "storage_unavailable" }, 503);
    return reply({ ...replay, upload: { url: retrySigned.data.signedUrl, method: "PUT",
      contentType: ext === "zip" ? "application/zip" : "text/html" } }, 200);
  }
  const importId = crypto.randomUUID();
  const path = `incoming/${session.user.id}/${importId}.${ext}`;
  const ins = await db.from("os_project_imports").insert({
    id: importId, project_id: projectId, category, project_name: projectName, original_name: name, source_tool: sourceTool,
    archive_path: path, archive_bytes: size, idempotency_key: key,
  });
  if (ins.error) {
    const code = ins.error.code === "54000" ? "rate_limited" : ins.error.code === "23505" ? "duplicate_request" : "import_not_registered";
    return reply({ error: code }, code === "rate_limited" ? 429 : 409);
  }
  const signed = await db.storage.from(BRIDGE_BUCKET).createSignedUploadUrl(path);
  if (signed.error || !signed.data) {
    await db.from("os_project_imports").update({ status: "failed", error_code: "storage_unavailable" }).eq("id", importId);
    return reply({ error: "storage_unavailable" }, 503);
  }
  return reply({ importId, upload: { url: signed.data.signedUrl, method: "PUT", contentType: ext === "zip" ? "application/zip" : "text/html" } }, 201);
}
