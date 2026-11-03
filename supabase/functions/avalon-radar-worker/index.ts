// Avalon Radar: private, scheduled Supabase Edge Function.
// Deploy with verify_jwt=false ONLY because this function authenticates a
// dedicated >=256-bit token from Vault against a service-role-only hash.
// It never sends mail, contacts businesses, or exposes service keys.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { investigateOfficialWebsite, type ResearchReport } from "./radar-research.ts";
import { ResearchBlocked, websiteUrl, fetchPublicPage } from "./radar-website-safety.ts";

const MAX_DAILY_REPORTS = 12;
const MAX_PER_INVOCATION = 2;
const REFRESH_DAYS = 30;
const WAIT_AFTER_BROKEN_ROBOTS_HOURS = 24;
const LEASE_MS = 120_000;
const KEY = "avalon";
const encoder = new TextEncoder();

type Prospect = {
  id: string;
  company: string;
  website: string | null;
  status: string;
  do_not_contact: boolean;
  owner_id: string | null;
  stars: number | null;
  stars_override: number | null;
  confidence: string;
};
type StoredReport = {
  prospect_id: string;
  scanned_at: string;
  status: string;
  report: { warnings?: string[] };
};

const json = (value: Record<string, unknown>, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

async function hashToken(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function sameHash(a: string, b: string): boolean {
  if (a.length !== 64 || b.length !== 64) return false;
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function blockedReport(url: string, cause: unknown): ResearchReport {
  const category = cause instanceof ResearchBlocked ? cause.code : "unavailable";
  return {
    status: "blocked",
    website: url,
    researched_at: new Date().toISOString(),
    pages: [],
    signals: [],
    warnings: ["Consulta no verificable (" + category.replace(/[^a-z_]/g, "").slice(0, 40) + "). No se infirieron necesidades."],
    confidence: "none",
    identity_matched: false,
    unverified: ["Servicios privados, CRM, atención telefónica y marketing no verificables"],
    suggested_needs: [],
  };
}

function mayScan(previous: StoredReport | undefined, now: number): boolean {
  if (!previous) return true;
  const age = now - Date.parse(previous.scanned_at);
  if (!Number.isFinite(age) || age < 0) return false;
  if (age >= REFRESH_DAYS * 86400_000) return true;
  // Recover old reports stopped by the Node DNS bug. Do not retry more often
  // than daily, even when a site remains unreachable.
  const warnings = previous.report?.warnings ?? [];
  const brokenRobots = previous.status === "blocked" &&
    warnings.some(w => w.includes("No pudimos comprobar robots.txt"));
  return brokenRobots && age >= WAIT_AFTER_BROKEN_ROBOTS_HOURS * 3600_000;
}

async function recordEvidence(db: SupabaseClient, prospect: Prospect, report: ResearchReport): Promise<boolean> {
  if (!report.identity_matched || !report.suggested_needs.length || prospect.status === "converted")
    return false;
  // Only the verified, stored report may become CRM evidence. The narrow
  // server-only RPC sets the correct owner claim inside its own transaction
  // to satisfy the existing owner-only CRM stamp and audit triggers.
  const { data, error } = await db.rpc("crm_radar_worker_record_website_need", {
    prospect_id: prospect.id,
  });
  return !error && data === true;
}

async function processBatch(db: SupabaseClient, owner: string, now: number) {
  let checked = 0, rated = 0, converted = 0, blocked = 0, failures = 0;
  const utcDay = new Date(now);
  utcDay.setUTCHours(0, 0, 0, 0);
  const [today, allReports, businesses] = await Promise.all([
    db.from("crm_radar_research_reports").select("id", { head: true, count: "exact" })
      .gte("scanned_at", utcDay.toISOString()),
    db.from("crm_radar_research_reports").select("prospect_id,scanned_at,status,report")
      .order("scanned_at", { ascending: false }).limit(800),
    db.from("crm_prospects")
      .select("id,company,website,status,do_not_contact,owner_id,stars,stars_override,confidence")
      .not("source_ref", "is", null).eq("status", "pending")
      .eq("do_not_contact", false).order("last_seen_at", { ascending: false })
      .limit(250),
  ]);
  if (today.error || allReports.error || businesses.error)
    throw new Error("query_failed");
  let dailyRemaining = Math.max(0, MAX_DAILY_REPORTS - (today.count ?? MAX_DAILY_REPORTS));
  const previous = new Map<string, StoredReport>();
  for (const row of (allReports.data ?? []) as StoredReport[]) {
    if (!previous.has(row.prospect_id)) previous.set(row.prospect_id, row);
  }
  const eligible = ((businesses.data ?? []) as Prospect[])
    .filter(p => !!p.website && !!websiteUrl(p.website) && mayScan(previous.get(p.id), now));
  for (const prospect of eligible.slice(0, Math.min(MAX_PER_INVOCATION, dailyRemaining))) {
    if (!prospect.website) continue;
    const url = websiteUrl(prospect.website);
    if (!url) continue;
    let report: ResearchReport;
    try {
      report = await investigateOfficialWebsite(url.href, prospect.company);
    } catch (cause) {
      report = blockedReport(url.href, cause);
    }
    const saved = await db.from("crm_radar_research_reports").insert({
      prospect_id: prospect.id,
      website: url.href,
      status: report.status,
      report,
      created_by: owner,
    });
    if (saved.error) { failures++; continue; }
    checked++;
    dailyRemaining--;
    if (report.status === "blocked") blocked++;
    await recordEvidence(db, prospect, report);
    // The existing trigger recalculates evidence-based stars. Commercial
    // high-confidence needs must come from multiple independently corroborated
    // services before a job can create a lead card.
    const scoring = await db.from("crm_prospects")
      .select("stars,stars_override,confidence,status,do_not_contact")
      .eq("id", prospect.id).maybeSingle();
    if (scoring.error || !scoring.data) { failures++; continue; }
    const row = scoring.data;
    if (typeof row.stars === "number") rated++;
    if (row.status === "pending" && !row.do_not_contact &&
        row.stars_override == null && Number(row.stars) >= 4 && row.confidence === "high") {
      const result = await db.rpc("crm_radar_worker_convert_verified", { prospect_id: prospect.id });
      if (result.error) failures++;
      else if (result.data) converted++;
    }
  }
  return { checked, rated, converted, blocked, failures, daily_remaining: dailyRemaining,
    pending: eligible.length - checked };
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const token = request.headers.get("x-avalon-radar-job") ?? "";
  if (token.length < 48 || token.length > 200) return json({ error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  let secrets: Record<string, string> = {};
  try { secrets = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); } catch { /* fail closed */ }
  const secret = secrets.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) return json({ error: "backend_credentials_unavailable" }, 503);

  const db = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: config, error: configError } = await db.from("crm_radar_worker_config")
    .select("token_sha256,enabled,lease_until").eq("id", KEY).maybeSingle();
  if (configError || !config) return json({ error: "worker_config_unavailable" }, 503);
  const supplied = await hashToken(token);
  if (!sameHash(supplied, config.token_sha256)) return json({ error: "unauthorized" }, 401);

  let dryRun = false;
  let networkProbe = false;
  try {
    const body = await request.json() as { dry_run?: unknown; network_probe?: unknown };
    dryRun = body?.dry_run === true;
    networkProbe = body?.network_probe === true;
  } catch { /* no body */ }
  if (networkProbe) {
    // Safe, fixed first-party robots.txt probe checks that pinned-DNS HTTPS
    // works in the Deno runtime. Never touches any business or quota.
    try {
      const response = await fetchPublicPage(new URL("https://avaloncoreagency.com/robots.txt"), "robots");
      return json({ ok: true, network_probe: true, status: response.status, type: response.contentType });
    } catch (cause) {
      const code = cause instanceof ResearchBlocked ? cause.code : "runtime_network";
      return json({ ok: false, network_probe: true, code }, 502);
    }
  }
  if (dryRun) {
    const { count, error } = await db.from("crm_prospects")
      .select("id", { head: true, count: "exact" }).not("source_ref", "is", null)
      .eq("status", "pending").eq("do_not_contact", false).not("website", "is", null);
    return error ? json({ error: "preview_unavailable" }, 503)
      : json({ ok: true, dry_run: true, pending_with_web: count ?? 0, max_daily: MAX_DAILY_REPORTS });
  }

  if (!config.enabled) return json({ ok: true, enabled: false, message: "worker_disabled" });
  const start = new Date();
  const lease = new Date(start.getTime() + LEASE_MS).toISOString();
  const { data: locked, error: leaseError } = await db.from("crm_radar_worker_config")
    .update({ lease_until: lease, last_started_at: start.toISOString(), updated_at: start.toISOString() })
    .eq("id", KEY).lt("lease_until", start.toISOString()).select("id").maybeSingle();
  if (leaseError) return json({ error: "lease_failed" }, 503);
  if (!locked) return json({ ok: true, busy: true, message: "already_running" });

  let status: "ok" | "partial" | "error" | "limited" = "ok";
  let result: ReturnType<typeof processBatch> extends Promise<infer T> ? T : never =
    { checked: 0, rated: 0, converted: 0, blocked: 0, failures: 0, daily_remaining: 0, pending: 0 };
  let message = "";
  try {
    const { data: membership, error: ownerError } = await db.from("agency_memberships")
      .select("user_id").eq("role", "owner").order("created_at").limit(1).maybeSingle();
    if (ownerError || !membership?.user_id) throw new Error("no_owner");
    result = await processBatch(db, membership.user_id, start.getTime());
    status = result.failures ? "partial" : result.daily_remaining === 0 ? "limited" : "ok";
    message = result.failures ? "partial_evidence_error" : result.daily_remaining === 0 ? "daily_budget_consumed" : "scan_complete";
  } catch (cause) {
    status = "error";
    message = cause instanceof Error && /^(query_failed|no_owner)$/.test(cause.message) ? cause.message : "worker_exception";
  } finally {
    const finishedAt = new Date().toISOString();
    await db.from("crm_radar_worker_runs").insert({
      status, checked: result.checked, rated: result.rated,
      converted: result.converted, blocked: result.blocked,
      started_at: start.toISOString(), finished_at: finishedAt,
      message,
    });
    await db.from("crm_radar_worker_config").update({
      lease_until: new Date(0).toISOString(),
      last_finished_at: finishedAt, last_message: message, updated_at: finishedAt,
    }).eq("id", KEY);
  }
  return json({ ok: status !== "error", status, ...result, message }, status === "error" ? 503 : 200);
});
