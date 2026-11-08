import { getOwnerSession } from "@/lib/auth/session";
import { reply, UUID } from "@/lib/project-bridge/http";
import { buildPreview } from "@/lib/project-bridge/preview";
import { supabaseStore } from "@/lib/project-bridge/supabase";

export const dynamic = "force-dynamic";

/**
 * Returns the self-contained preview document as JSON (never as an HTML page on the Avalon origin). The library loads it
 * into <iframe sandbox="allow-scripts" srcdoc>, an opaque origin without cookies or network (see preview.ts).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getOwnerSession();
  if (!session) return reply({ error: "unauthorized" }, 401);
  const { id } = await params;
  const url = new URL(req.url);
  const version = url.searchParams.get("version") ?? "";
  const page = url.searchParams.get("page") ?? "";
  if (!UUID.test(id) || !UUID.test(version) || page.length > 240) return reply({ error: "invalid_request" }, 400);
  const db = session.supabase;
  const v = await db.from("os_project_versions").select("id,entry_path,sealed").eq("id", version).eq("project_id", id).maybeSingle();
  if (!v.data || !v.data.sealed) return reply({ error: "not_found" }, 404);
  const files = await db.from("os_project_files").select("path,sha256,size").eq("version_id", version).limit(2000);
  if (files.error) return reply({ error: "files_unavailable" }, 503);
  const store = supabaseStore(db);
  const doc = await buildPreview((files.data ?? []).map(f => ({ ...f, size: Number(f.size) })), page || v.data.entry_path || "index.html", sha => store.get("blobs/" + sha));
  if (!doc) return reply({ error: "no_html_page" }, 404);
  return reply(doc);
}
