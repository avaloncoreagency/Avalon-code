/**
 * Avalon Project Bridge — import processing (server only). Runs under the OWNER's session: every read and write goes
 * through RLS and the SQL guards of 20261108100000_project_bridge.sql. Storage and database access are injected
 * (`BridgeRepo`, `BlobStore`) so the same code runs against Supabase in the app and against PGlite in tests.
 *
 * Bounded work: one import per call, ≤ 6 parallel blob uploads, no background loops. A crashed run leaves the import in
 * `validating`; the next call after STALE_MS marks it failed('interrupted') and retries (≤ 5 attempts, enforced in SQL).
 */
import { inspectUpload, archiveDigest, type Inspection } from "./inspect";
import { BRIDGE_LIMITS, type Category } from "./policy";

export const STALE_MS = 10 * 60_000;

export type ImportRow = {
  id: string; project_id: string | null; category: Category; project_name: string | null; original_name: string;
  source_tool: string; archive_path: string | null; status: string; attempts: number; updated_at: string; version_id: string | null;
};
export type BridgeRepo = {
  getImport(id: string): Promise<ImportRow | null>;
  updateImport(id: string, patch: Partial<Pick<ImportRow, "status" | "project_id" | "version_id" | "category">> & { error_code?: string | null; problems?: unknown[]; archive_sha256?: string; archive_bytes?: number }): Promise<void>;
  createProject(module: Category, name: string, settings: Record<string, unknown>): Promise<string>;
  latestSealedVersion(projectId: string): Promise<{ id: string; number: number; content_digest: string } | null>;
  sealedVersion(projectId:string,versionId:string):Promise<{id:string;number:number}|null>;
  insertVersion(v: { project_id: string; import_id: string; source_tool: string; framework: string; entry_path: string | null; deployable: string; file_count: number; total_bytes: number; content_digest: string; summary: Record<string, unknown> }): Promise<{ id: string; number: number }>;
  insertFiles(versionId: string, files: Inspection["files"]): Promise<void>;
  sealVersion(versionId: string): Promise<void>;
};
export type BlobStore = {
  get(path: string): Promise<Uint8Array | null>;
  /** Must succeed when the object already exists (content-addressed blobs are immutable and deduplicated). */
  put(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
};
export type ProcessResult =
  | { status: "registered"; projectId: string; versionId: string; number: number; inspection: Pick<Inspection, "framework" | "entry" | "deployable" | "warnings" | "skipped"> & { files: number; totalBytes: number } }
  | { status: "duplicate"; projectId: string; versionId: string; number: number }
  | { status: "rejected"; reason: string; problems: { path: string; reason: string }[] }
  | { status: "failed"; reason: string; retryable: boolean }
  | { status: "busy" };

const errCode = (e: unknown) => (e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "") || (e instanceof Error ? e.message.slice(0, 80) : "unknown");

export async function processImport(repo: BridgeRepo, store: BlobStore, importId: string, now = () => Date.now()): Promise<ProcessResult> {
  let row = await repo.getImport(importId);
  if (!row) return { status: "failed", reason: "import_not_found", retryable: false };
  if (row.status === "registered" || row.status === "duplicate") {
    // A receipt belongs to THIS import, even after another delivery or a restoration becomes latest.
    if(!row.project_id||!row.version_id)return {status:'failed',reason:'receipt_version_missing',retryable:false};
    try {
      const v=await repo.sealedVersion(row.project_id,row.version_id);
      if(!v)return {status:'failed',reason:'receipt_version_missing',retryable:false};
      return {status:row.status,projectId:row.project_id,versionId:v.id,number:v.number} as ProcessResult;
    } catch {return {status:'failed',reason:'receipt_unavailable',retryable:true};}
  }
  if (row.status === "rejected") return { status: "rejected", reason: "already_rejected", problems: [] };
  if (row.status === "awaiting_upload") return { status: "failed", reason: "archive_not_uploaded", retryable: true };
  if (row.status === "validating") {
    if (now() - Date.parse(row.updated_at) < STALE_MS) return { status: "busy" };
    await repo.updateImport(row.id, { status: "failed", error_code: "interrupted" });
    row = { ...row, status: "failed" };
  }
  try { await repo.updateImport(row.id, { status: "validating" }); }
  catch (e) { return { status: "failed", reason: errCode(e) === "54000" ? "retry_limit_reached" : "cannot_start:" + errCode(e), retryable: false }; }

  const fail = async (reason: string, retryable = true): Promise<ProcessResult> => {
    try { await repo.updateImport(row!.id, { status: "failed", error_code: reason.slice(0, 120) }); } catch { /* state stays validating; recovered after STALE_MS */ }
    return { status: "failed", reason, retryable };
  };
  try {
    if (!row.archive_path) return fail("archive_missing", false);
    const bytes = await store.get(row.archive_path);
    if (!bytes) return fail("archive_missing");
    if (bytes.length > BRIDGE_LIMITS.archiveBytes) {
      await repo.updateImport(row.id, { status: "rejected", error_code: "archive_too_large", problems: [] });
      return { status: "rejected", reason: "archive_too_large", problems: [] };
    }
    const digest = archiveDigest(bytes);
    const result = inspectUpload(row.original_name, bytes);
    if (!result.ok) {
      await repo.updateImport(row.id, { status: "rejected", error_code: result.reason, problems: result.problems, archive_sha256: digest, archive_bytes: bytes.length });
      return { status: "rejected", reason: result.reason, problems: result.problems };
    }
    const { inspection: ins, blobs } = result;

    // Duplicate of the project's current version: nothing new to store, no new version.
    if (row.project_id) {
      const latest = await repo.latestSealedVersion(row.project_id);
      if (latest && latest.content_digest === ins.contentDigest) {
        await repo.updateImport(row.id, { status: "duplicate", version_id: latest.id, archive_sha256: digest, archive_bytes: bytes.length, error_code: "same_content_as_v" + latest.number });
        return { status: "duplicate", projectId: row.project_id, versionId: latest.id, number: latest.number };
      }
    }
    const projectId = row.project_id ?? await repo.createProject(row.category, (row.project_name ?? row.original_name.replace(/\.(zip|html?)$/i, "")).slice(0, 120) || "Proyecto importado", {
      bridge: { source_tool: row.source_tool, framework: ins.framework, imported_from: row.original_name.slice(0, 255) },
    });

    // Blobs first (idempotent, content-addressed), then the version manifest, then seal: a crash at any point leaves no
    // half-registered version visible as complete (unsealed versions are never listed or deployed).
    const pending = [...blobs.entries()];
    const mimeBySha = new Map(ins.files.map(f => [f.sha256, f.mime]));
    const worker = async () => { for (let b = pending.shift(); b; b = pending.shift()) await store.put("blobs/" + b[0], b[1], mimeBySha.get(b[0]) ?? "application/octet-stream"); };
    await Promise.all(Array.from({ length: Math.min(6, pending.length) }, worker));

    const version = await repo.insertVersion({
      project_id: projectId, import_id: row.id, source_tool: row.source_tool, framework: ins.framework, entry_path: ins.entry, deployable: ins.deployable,
      file_count: ins.files.length, total_bytes: ins.totalBytes, content_digest: ins.contentDigest,
      summary: { warnings: ins.warnings, skipped: ins.skipped.length, package: ins.packageInfo, archive_sha256: digest },
    });
    await repo.insertFiles(version.id, ins.files);
    await repo.sealVersion(version.id);
    await repo.updateImport(row.id, { status: "registered", project_id: projectId, version_id: version.id, archive_sha256: digest, archive_bytes: bytes.length, error_code: null });
    return {
      status: "registered", projectId, versionId: version.id, number: version.number,
      inspection: { framework: ins.framework, entry: ins.entry, deployable: ins.deployable, warnings: ins.warnings, skipped: ins.skipped, files: ins.files.length, totalBytes: ins.totalBytes },
    };
  } catch (e) {
    return fail("processing_error:" + errCode(e));
  }
}

/** Human-readable, bilingual explanation of a rejection or failure reason (no internals, no secrets). */
export function reasonText(reason: string, lang: "es" | "en" = "es"): string {
  const es = lang === "es";
  const base = reason.split(":")[0];
  const map: Record<string, [string, string]> = {
    archive_too_large: ["El archivo supera el máximo de 25 MB.", "The archive exceeds the 25 MB limit."],
    archive_uncompressed_too_large: ["El contenido descomprimido supera 100 MB.", "Uncompressed content exceeds 100 MB."],
    too_many_entries: ["El ZIP tiene demasiados archivos (máx. 2000).", "The ZIP has too many files (max 2000)."],
    file_too_large: ["Un archivo supera 15 MB.", "A file exceeds 15 MB."],
    not_a_zip: ["El archivo no es un ZIP válido.", "The file is not a valid ZIP."],
    unsupported_upload_type: ["Sube un .zip o un .html.", "Upload a .zip or an .html file."],
    path_traversal: ["El ZIP intenta escribir fuera de su carpeta (ruta con ..).", "The ZIP tries to write outside its folder (.. path)."],
    absolute_path: ["El ZIP contiene rutas absolutas.", "The ZIP contains absolute paths."],
    symlink_entry: ["El ZIP contiene enlaces simbólicos, no permitidos.", "Symbolic links are not allowed."],
    encrypted_entry: ["El ZIP está cifrado con contraseña.", "The ZIP is password-protected."],
    compression_ratio_too_high: ["El ZIP parece una bomba de descompresión.", "The ZIP looks like a decompression bomb."],
    duplicate_entry: ["El ZIP repite nombres de archivo.", "The ZIP repeats file names."],
    rejected_files: ["Hay archivos no permitidos (ejecutables, secretos o tipos desconocidos). Revisa la lista.", "Some files are not allowed (executables, secrets or unknown types). See the list."],
    empty_archive: ["El ZIP está vacío.", "The ZIP is empty."],
    zip64_not_supported: ["ZIP64 no es compatible; comprime de nuevo con un ZIP normal.", "ZIP64 is not supported; re-compress as a normal ZIP."],
    archive_missing: ["No se encontró el archivo subido. Vuelve a subirlo.", "The uploaded archive was not found. Upload it again."],
    retry_limit_reached: ["Se alcanzó el máximo de reintentos.", "Retry limit reached."],
    interrupted: ["El procesamiento se interrumpió; puedes reintentarlo.", "Processing was interrupted; you can retry."],
    receipt_version_missing: ["La versión original del recibo no está disponible. Revisa el historial; no se creó otra versión.", "The receipt's original version is unavailable. Review history; no extra version was created."],
    receipt_unavailable: ["No se pudo comprobar el recibo. Puedes consultarlo de nuevo sin volver a importar.", "The receipt could not be verified. Retry the lookup without importing again."],
  };
  const hit = map[base];
  return hit ? (es ? hit[0] : hit[1]) : (es ? "No se pudo procesar el proyecto (" + base + ")." : "The project could not be processed (" + base + ").");
}
