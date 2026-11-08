"use server";
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { back, field, ownerForAction, uuidField } from "@/lib/os/actions";
import { assertClientProject, clientProjectName, deployStatic, getDeployment, vercelConfig, VercelError } from "@/lib/project-bridge/vercel";
import { supabaseStore } from "@/lib/project-bridge/supabase";

const LIB = "/admin/workspace/library";

/** Restore = a NEW immutable version with the files of the chosen one (history is never rewritten). */
export async function restoreVersion(form: FormData) {
  const { supabase } = await ownerForAction();
  const project = uuidField(form, "project_id"), version = uuidField(form, "version_id");
  if (!project || !version) back(LIB, { error: "invalid" });
  const r = await supabase.rpc("os_project_restore_version", { p_version: version, p_note: field(form, "note").slice(0, 500) });
  if (r.error) back(`${LIB}/${project}`, { error: "restore_failed" });
  revalidatePath(`${LIB}/${project}`);
  back(`${LIB}/${project}`, { ok: "restored" });
}

/** Links the project to an existing CRM client (no sales, stages or commercial data are created). */
export async function assignClient(form: FormData) {
  const { supabase } = await ownerForAction();
  const project = uuidField(form, "project_id");
  const raw = field(form, "client_id");
  const client = raw === "" ? null : uuidField(form, "client_id");
  if (!project || (raw !== "" && !client)) back(LIB, { error: "invalid" });
  if (client) {
    const c = await supabase.from("crm_clients").select("id").eq("id", client).maybeSingle();
    if (!c.data) back(`${LIB}/${project}`, { error: "client_not_found" });
  }
  const r = await supabase.from("os_projects").update({ client_id: client }).eq("id", project);
  if (r.error) back(`${LIB}/${project}`, { error: "assign_failed" });
  revalidatePath(`${LIB}/${project}`);
  back(`${LIB}/${project}`, { ok: "client_assigned" });
}

/** Owner approval for a production publication of ONE exact version (single use, 24 h). */
export async function approvePublication(form: FormData) {
  const { supabase } = await ownerForAction();
  const project = uuidField(form, "project_id"), version = uuidField(form, "version_id");
  if (!project || !version) back(LIB, { error: "invalid" });
  if (field(form, "confirm") !== "PUBLICAR") back(`${LIB}/${project}`, { error: "confirm_required" });
  const r = await supabase.from("os_project_publish_approvals").insert({ project_id: project, version_id: version, note: field(form, "note").slice(0, 500) });
  if (r.error) back(`${LIB}/${project}`, { error: "approval_failed" });
  back(`${LIB}/${project}`, { ok: "approved" });
}

/**
 * Deploys a sealed STATIC version to the client's own Vercel project. The database refuses production without a valid
 * approval and refuses dynamic projects; the Vercel bridge refuses the Avalon OS project and a first deployment as preview.
 */
export async function deployVersion(form: FormData) {
  const { supabase } = await ownerForAction();
  const project = uuidField(form, "project_id"), version = uuidField(form, "version_id");
  const target = field(form, "target") === "production" ? "production" : "preview";
  if (!project || !version) back(LIB, { error: "invalid" });
  const path = `${LIB}/${project}`;
  const cfg = vercelConfig();
  if (!cfg) back(path, { error: "vercel_not_configured" });
  const p = await supabase.from("os_projects").select("id,name,settings").eq("id", project).maybeSingle();
  if (!p.data) back(LIB, { error: "not_found" });
  const settings = (p.data.settings ?? {}) as { bridge?: { vercel_project?: string } };
  let vercelProject = settings.bridge?.vercel_project ?? clientProjectName(p.data.name);
  try { assertClientProject(vercelProject); } catch { vercelProject = clientProjectName(p.data.name); }
  let approval: string | null = null;
  if (target === "production") {
    const a = await supabase.from("os_project_publish_approvals").select("id").eq("version_id", version).is("used_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!a.data) back(path, { error: "approval_required" });
    approval = a.data.id;
  }
  const idem = field(form, "idempotency_key").slice(0, 100) || "deploy-" + randomBytes(8).toString("hex");
  const row = await supabase.from("os_project_deployments").insert({ project_id: project, version_id: version, target, vercel_project: vercelProject, approval_id: approval, idempotency_key: idem }).select("id").single();
  if (row.error || !row.data) back(path, { error: row.error?.code === "0A000" ? "needs_build_not_supported" : row.error?.code === "42501" ? "approval_required" : "deploy_not_registered" });
  const depId = row.data.id;
  const fail = async (code: string) => {
    await supabase.from("os_project_deployments").update({ state: code === "first_deployment_is_production" ? "blocked" : "error", error_code: code.slice(0, 200) }).eq("id", depId);
    back(path, { error: code.split(":")[0] });
  };
  const files = await supabase.from("os_project_files").select("path,sha256").eq("version_id", version).limit(2000);
  if (files.error || !files.data?.length) return fail("files_unavailable");
  const store = supabaseStore(supabase);
  const payload: { path: string; bytes: Uint8Array }[] = [];
  for (const f of files.data) {
    const bytes = await store.get("blobs/" + f.sha256);
    if (!bytes) return fail("blob_missing");
    payload.push({ path: f.path, bytes });
  }
  try {
    const d = await deployStatic(fetch, cfg, vercelProject, payload, target);
    await supabase.from("os_project_deployments").update({ deployment_id: d.id, url: d.url, state: d.state === "ready" && !d.url ? "building" : d.state, error_code: d.error, checked_at: new Date().toISOString() }).eq("id", depId);
    if (!settings.bridge?.vercel_project) await supabase.from("os_projects").update({ settings: { ...settings, bridge: { ...(settings.bridge ?? {}), vercel_project: vercelProject } } }).eq("id", project);
  } catch (e) {
    return fail(e instanceof VercelError ? e.code : "vercel_error");
  }
  revalidatePath(path);
  back(path, { ok: "deploy_started" });
}

/** Reads the REAL state from Vercel; a deployment is shown as ready only after Vercel says READY. */
export async function refreshDeployment(form: FormData) {
  const { supabase } = await ownerForAction();
  const project = uuidField(form, "project_id"), dep = uuidField(form, "deployment_row");
  if (!project || !dep) back(LIB, { error: "invalid" });
  const path = `${LIB}/${project}`;
  const cfg = vercelConfig();
  if (!cfg) back(path, { error: "vercel_not_configured" });
  const row = await supabase.from("os_project_deployments").select("deployment_id,state,url").eq("id", dep).maybeSingle();
  if (!row.data?.deployment_id) back(path, { error: "not_found" });
  try {
    const d = await getDeployment(fetch, cfg, row.data.deployment_id);
    if (d.state !== row.data.state) await supabase.from("os_project_deployments").update({ state: d.state, url: d.url ?? row.data.url, error_code: d.error, checked_at: new Date().toISOString() }).eq("id", dep);
    else await supabase.from("os_project_deployments").update({ checked_at: new Date().toISOString() }).eq("id", dep);
  } catch (e) {
    back(path, { error: e instanceof VercelError ? e.code.split(":")[0] : "vercel_error" });
  }
  revalidatePath(path);
  back(path, { ok: "status_updated" });
}

/** Creates a revocable API token for a tool. The plaintext is shown ONCE (via a short-lived httpOnly flash) and stored only as sha256. */
export async function createApiToken(form: FormData) {
  const { supabase, user } = await ownerForAction();
  const name = field(form, "name").trim().slice(0, 80);
  const days = Math.min(90, Math.max(1, Number(field(form, "days")) || 30));
  const scopes = field(form, "scope") === "read" ? ["import:read"] : ["import:create", "import:read"];
  if (!name) back(`${LIB}/tokens`, { error: "name_required" });
  const token = "avb_" + randomBytes(24).toString("base64url");
  const r = await supabase.from("os_project_api_tokens").insert({
    name, token_sha256: createHash("sha256").update(token).digest("hex"), prefix: token.slice(0, 8), scopes,
    expires_at: new Date(Date.now() + days * 86400e3).toISOString(), created_by: user.id,
  });
  if (r.error) back(`${LIB}/tokens`, { error: "token_failed" });
  const { cookies } = await import("next/headers");
  (await cookies()).set("avalon_bridge_new_token", token, { httpOnly: true, secure: true, sameSite: "strict", path: `${LIB}/tokens`, maxAge: 120 });
  back(`${LIB}/tokens`, { ok: "token_created" });
}

export async function revokeApiToken(form: FormData) {
  const { supabase } = await ownerForAction();
  const id = uuidField(form, "token_id");
  if (!id) back(`${LIB}/tokens`, { error: "invalid" });
  const r = await supabase.from("os_project_api_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null);
  if (r.error) back(`${LIB}/tokens`, { error: "revoke_failed" });
  back(`${LIB}/tokens`, { ok: "token_revoked" });
}
