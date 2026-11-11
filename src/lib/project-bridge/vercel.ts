/**
 * Avalon Project Bridge — Vercel publishing without GitHub (official REST API: /v2/files + /v13/deployments).
 *
 * Hard rules (also enforced in SQL, see os_project_deployments):
 *  - A client site is ALWAYS its own Vercel project named `avalon-client-<slug>`; the Avalon OS project can never be targeted.
 *  - Only STATIC versions are deployed: no install, no build, no code from the archive runs on any machine we control.
 *  - Preview by default. Production only with a single-use owner approval for that exact version (checked by the DB).
 *  - The deploy token is server-only (`AVALON_VERCEL_DEPLOY_TOKEN`), never logged and never sent to the browser.
 * `fetch` is injected so every call path is testable; tests that use a fake fetch say so and are not "real Vercel".
 */
import { createHash } from "node:crypto";

export const MAIN_PROJECTS = new Set(["avalon-core-agency", "avalon-os", "avalon-code"]);
export type VercelConfig = { token: string; teamId: string | null };
export type DeployFile = { path: string; bytes: Uint8Array };
export type DeployState = "queued" | "building" | "ready" | "error" | "canceled";
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export function vercelConfig(env: Record<string, string | undefined> = process.env): VercelConfig | null {
  const token = env.AVALON_VERCEL_DEPLOY_TOKEN?.trim();
  if (!token) return null;
  const teamId = env.AVALON_VERCEL_TEAM_ID?.trim() || null;
  if (teamId && !/^team_[A-Za-z0-9]{8,64}$/.test(teamId)) return null;
  return { token, teamId };
}

/** `avalon-client-<slug>`; never one of the Avalon OS projects. Throws on anything else. */
export function clientProjectName(source: string): string {
  const slug = source.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 45).replace(/-+$/g, "");
  const name = "avalon-client-" + (slug || "proyecto");
  assertClientProject(name);
  return name;
}
export function assertClientProject(name: string): void {
  if (MAIN_PROJECTS.has(name) || !/^avalon-client-[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$/.test(name)) throw new Error("refused_project_name");
}

const sha1 = (b: Uint8Array) => createHash("sha1").update(b).digest("hex");
const q = (cfg: VercelConfig, extra = "") => (cfg.teamId ? `?teamId=${encodeURIComponent(cfg.teamId)}${extra ? "&" + extra : ""}` : extra ? "?" + extra : "");

/** The exact request body sent to POST /v13/deployments (also used to verify the payload with a real deployment). */
export function deploymentBody(project: string, files: { path: string; sha: string; size: number }[], target: "preview" | "production") {
  assertClientProject(project);
  return {
    name: project,
    project,
    files: files.map(f => ({ file: f.path, sha: f.sha, size: f.size })),
    ...(target === "production" ? { target: "production" } : {}),
    projectSettings: { framework: null, buildCommand: null, installCommand: null, devCommand: null, outputDirectory: null },
    meta: { avalonBridge: "1" },
  };
}

export class VercelError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}
async function call(fetchImpl: Fetch, url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try { res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(20_000) }); } catch { throw new VercelError("vercel_unreachable", 0); }
  return res;
}
async function errorCode(res: Response): Promise<string> {
  try { const j = await res.json() as { error?: { code?: string } }; return String(j?.error?.code ?? "http_" + res.status).slice(0, 80); } catch { return "http_" + res.status; }
}

/**
 * VERIFIED with real deployments (2026-11-08, project avalon-client-bridge-selftest): the FIRST deployment of a new
 * Vercel project is assigned to PRODUCTION even without `target`; later deployments without `target` are previews
 * (`target: "preview"` is rejected by the API). So a preview is only allowed when the project already has a production
 * deployment; otherwise the caller must go through the owner-approved production path.
 */
export async function projectHasProduction(fetchImpl: Fetch, cfg: VercelConfig, project: string): Promise<boolean> {
  assertClientProject(project);
  const res = await call(fetchImpl, `https://api.vercel.com/v9/projects/${encodeURIComponent(project)}` + q(cfg), { headers: { Authorization: `Bearer ${cfg.token}` } });
  if (res.status === 404) return false;
  if (!res.ok) throw new VercelError("project_lookup_failed:" + (await errorCode(res)), res.status);
  const p = await res.json() as { name?: string; targets?: { production?: unknown } };
  if (p.name !== project) throw new VercelError("project_mismatch", 0);
  return !!p.targets?.production;
}

/** Uploads every file (deduplicated by SHA1 on Vercel's side), then creates the deployment. */
export async function deployStatic(fetchImpl: Fetch, cfg: VercelConfig, project: string, files: DeployFile[], target: "preview" | "production") {
  assertClientProject(project);
  if (!files.some(f => f.path === "index.html")) throw new VercelError("no_index_html", 0);
  if (target === "preview" && !(await projectHasProduction(fetchImpl, cfg, project))) throw new VercelError("first_deployment_is_production", 409);
  const refs: { path: string; sha: string; size: number }[] = [];
  const queue = [...files];
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      const sha = sha1(f.bytes);
      const res = await call(fetchImpl, "https://api.vercel.com/v2/files" + q(cfg), {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/octet-stream", "x-vercel-digest": sha, "Content-Length": String(f.bytes.length) },
        body: f.bytes as unknown as BodyInit,
      });
      if (!res.ok) throw new VercelError("file_upload_failed:" + (await errorCode(res)), res.status);
      refs.push({ path: f.path, sha, size: f.bytes.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, files.length) }, worker));
  const res = await call(fetchImpl, "https://api.vercel.com/v13/deployments" + q(cfg, "skipAutoDetectionConfirmation=1"), {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(deploymentBody(project, refs, target)),
  });
  if (!res.ok) throw new VercelError("deployment_failed:" + (await errorCode(res)), res.status);
  const d = await res.json() as { id?: string; url?: string; readyState?: string };
  return normalizeDeployment(d);
}

export function normalizeDeployment(d: { id?: string; url?: string; readyState?: string; state?: string; errorCode?: string; errorMessage?: string }) {
  const raw = String(d.readyState ?? d.state ?? "").toUpperCase();
  const state: DeployState = raw === "READY" ? "ready" : raw === "ERROR" ? "error" : raw === "CANCELED" ? "canceled" : raw === "QUEUED" ? "queued" : "building";
  if (!d.id || !/^dpl_[A-Za-z0-9]{8,64}$/.test(d.id)) throw new VercelError("invalid_provider_response", 0);
  const host = d.url && /^[a-z0-9]([a-z0-9.-]{0,240})\.vercel\.app$/.test(d.url) ? d.url : null;
  return { id: d.id, url: host ? `https://${host}` : null, state, error: state === "error" ? String(d.errorCode ?? d.errorMessage ?? "build_error").slice(0, 200) : null };
}

export async function getDeployment(fetchImpl: Fetch, cfg: VercelConfig, id: string) {
  if (!/^dpl_[A-Za-z0-9]{8,64}$/.test(id)) throw new VercelError("invalid_deployment_id", 0);
  const res = await call(fetchImpl, `https://api.vercel.com/v13/deployments/${id}` + q(cfg), { headers: { Authorization: `Bearer ${cfg.token}` } });
  if (!res.ok) throw new VercelError("status_failed:" + (await errorCode(res)), res.status);
  return normalizeDeployment(await res.json());
}
