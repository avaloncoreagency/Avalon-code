import { createHash } from "node:crypto";
import { getOwnerSession } from "@/lib/auth/session";
import { BRIDGE_LIMITS } from "@/lib/project-bridge/policy";
import { supabaseStore } from "@/lib/project-bridge/supabase";
import { UUID } from "@/lib/project-bridge/http";
import { writeZip } from "@/lib/project-bridge/zip-write";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Export one sealed library version as a ZIP (owner session, RLS). Every file is re-hashed against the SHA-256 recorded
 * at import; a mismatch aborts the export. The archive carries AVALON_EXPORT.json (project, version, digest, file hashes)
 * and can be imported again through the normal Library importer — on another Avalon, without GitHub or Vercel.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOwnerSession();
  if (!session) return new Response("unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id } = await params;
  const versionId = new URL(req.url).searchParams.get("version") ?? "";
  if (!UUID.test(id) || !UUID.test(versionId)) return new Response("invalid", { status: 400 });
  const db = session.supabase;
  const [project, version] = await Promise.all([
    db.from("os_projects").select("id,name,module").eq("id", id).maybeSingle(),
    db.from("os_project_versions").select("id,number,content_digest,sealed,created_at,kind").eq("id", versionId).eq("project_id", id).maybeSingle(),
  ]);
  if (!project.data || !version.data) return new Response("not_found", { status: 404 });
  if (!version.data.sealed) return new Response("version_not_sealed", { status: 409 });
  const files = await db.from("os_project_files").select("path,sha256,size").eq("version_id", versionId).order("path").limit(BRIDGE_LIMITS.entries);
  if (files.error || !files.data?.length) return new Response("files_unavailable", { status: 503 });
  const store = supabaseStore(db);
  const entries: { path: string; bytes: Uint8Array }[] = [];
  let total = 0;
  for (const f of files.data) {
    if (f.path === "AVALON_EXPORT.json") continue;
    const bytes = await store.get("blobs/" + f.sha256);
    if (!bytes) return new Response("blob_missing", { status: 503 });
    if (createHash("sha256").update(bytes).digest("hex") !== f.sha256) return new Response("integrity_error", { status: 500 });
    total += bytes.length;
    if (total > BRIDGE_LIMITS.totalUncompressedBytes) return new Response("too_large", { status: 413 });
    entries.push({ path: f.path, bytes });
  }
  const manifest = { format: "avalon-library-export/1", project: { id, name: project.data.name, module: project.data.module },
    version: { id: versionId, number: version.data.number, kind: version.data.kind, created_at: version.data.created_at, content_digest: version.data.content_digest },
    files: entries.map(e => ({ path: e.path, sha256: createHash("sha256").update(e.bytes).digest("hex"), size: e.bytes.length })), exported_at: new Date().toISOString() };
  entries.push({ path: "AVALON_EXPORT.json", bytes: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
  const zip = writeZip(entries);
  const safe = project.data.name.normalize("NFKD").replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "proyecto";
  return new Response(zip as unknown as BodyInit, { headers: {
    "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${safe}-v${version.data.number}.zip"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
