/**
 * Supabase implementations of the Project Bridge ports, always bound to the signed-in OWNER's client (RLS applies).
 * No privileged key is used anywhere in the application.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { BRIDGE_BUCKET } from "./policy";
import type { BlobStore, BridgeRepo, ImportRow } from "./service";

const check = (r: { error: { code?: string; message?: string } | null }) => {
  if (r.error) { const e = new Error(r.error.message ?? "db_error") as Error & { code?: string }; e.code = r.error.code; throw e; }
};

export function supabaseRepo(db: SupabaseClient): BridgeRepo {
  return {
    async getImport(id) {
      const r = await db.from("os_project_imports").select("id,project_id,category,project_name,original_name,source_tool,archive_path,status,attempts,updated_at,version_id").eq("id", id).maybeSingle();
      check(r);
      return (r.data as ImportRow | null) ?? null;
    },
    async updateImport(id, patch) { check(await db.from("os_project_imports").update(patch).eq("id", id)); },
    async createProject(module, name, settings) {
      const r = await db.from("os_projects").insert({ module, name, settings }).select("id").single();
      check(r);
      return (r.data as { id: string }).id;
    },
    async latestSealedVersion(projectId) {
      const r = await db.from("os_project_versions").select("id,number,content_digest").eq("project_id", projectId).eq("sealed", true).order("number", { ascending: false }).limit(1).maybeSingle();
      check(r);
      return (r.data as { id: string; number: number; content_digest: string } | null) ?? null;
    },
    async sealedVersion(projectId,versionId) {
      const r=await db.from('os_project_versions').select('id,number').eq('project_id',projectId).eq('id',versionId).eq('sealed',true).maybeSingle();
      check(r);
      return r.data as {id:string;number:number}|null;
    },
    async insertVersion(v) {
      const r = await db.from("os_project_versions").insert({ ...v, number: 1, kind: "import" }).select("id,number").single();
      check(r);
      return r.data as { id: string; number: number };
    },
    async insertFiles(versionId, files) {
      for (let i = 0; i < files.length; i += 500)
        check(await db.from("os_project_files").insert(files.slice(i, i + 500).map(f => ({ version_id: versionId, path: f.path, sha256: f.sha256, size: f.size, mime: f.mime.slice(0, 100) }))));
    },
    async sealVersion(versionId) { check(await db.from("os_project_versions").update({ sealed: true }).eq("id", versionId)); },
  };
}

export function supabaseStore(db: SupabaseClient): BlobStore {
  const bucket = db.storage.from(BRIDGE_BUCKET);
  return {
    async get(path) {
      const r = await bucket.download(path);
      if (r.error || !r.data) return null;
      return new Uint8Array(await r.data.arrayBuffer());
    },
    async put(path, bytes, contentType) {
      const r = await bucket.upload(path, bytes, { contentType, upsert: false, cacheControl: "31536000" });
      if (r.error && !/exists|duplicate|409/i.test(`${r.error.message} ${(r.error as { statusCode?: string }).statusCode ?? ""}`)) {
        const e = new Error("storage_put_failed") as Error & { code?: string }; e.code = "storage_put_failed"; throw e;
      }
    },
  };
}
