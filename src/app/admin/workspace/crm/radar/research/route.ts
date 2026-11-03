import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { investigateOfficialWebsite, type ResearchReport } from "@/lib/crm/radar-research";
import { ResearchBlocked, websiteUrl } from "@/lib/crm/radar-website-safety";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DAILY_PER_OWNER = 12;
const CACHE_MS = 24 * 60 * 60 * 1000;
const AUTO_RESEARCH_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;
const AUTO_BATCH_MAX = 3;
const inFlight = new Set<string>();
const reply = (value: unknown, status = 200) => NextResponse.json(value,
  { status, headers: { "Cache-Control": "private, no-store" } });

async function ownerProspect(id: string) {
  const session = await getOwnerSession();
  if (!session) return { error: "No autorizado.", status: 403 } as const;
  if (!UUID.test(id)) return { error: "Negocio inválido.", status: 400 } as const;
  const { data, error } = await session.supabase.from("crm_prospects")
    .select("id,company,website,source_ref,status,do_not_contact")
    .eq("id", id).maybeSingle();
  if (error) return { error: "No se pudo consultar el negocio.", status: 503 } as const;
  if (!data || !data.source_ref) return { error: "Negocio del radar no encontrado.", status: 404 } as const;
  return { session, prospect: data } as const;
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("job_status") === "1") {
    const session = await getOwnerSession();
    if (!session) return reply({ error: "No autorizado." }, 403);
    const { data, error } = await session.supabase.from("crm_radar_worker_runs")
      .select("finished_at,status,checked,rated,converted,blocked,message")
      .order("finished_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return reply({ error: "No se pudo consultar el estado del investigador." }, 503);
    return reply({ job: data ?? null });
  }
  if (request.nextUrl.searchParams.get("queue") === "1") {
    const session = await getOwnerSession();
    if (!session) return reply({ error: "No autorizado." }, 403);
    const db = session.supabase;
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    const cutoff = new Date(Date.now() - AUTO_RESEARCH_REFRESH_MS).toISOString();
    // Queue selection only; this endpoint never crawls websites or creates leads.
    const [daily, recent, prospects] = await Promise.all([
      db.from("crm_radar_research_reports").select("id", { head: true, count: "exact" })
        .eq("created_by", session.userId).gte("scanned_at", day.toISOString()),
      db.from("crm_radar_research_reports").select("prospect_id")
        .gte("scanned_at", cutoff).limit(1000),
      db.from("crm_prospects").select("id,company,website,do_not_contact,status,source_ref")
        .not("source_ref", "is", null).eq("status", "pending").eq("do_not_contact", false)
        .not("website", "is", null).order("last_seen_at", { ascending: false }).limit(250),
    ]);
    if (daily.error || recent.error || prospects.error)
      return reply({ error: "No se pudo seleccionar una cola segura para el radar." }, 503);
    const remaining = Math.max(0, MAX_DAILY_PER_OWNER - (daily.count ?? 0));
    const researched = new Set((recent.data ?? []).map(row => row.prospect_id));
    const eligible = (prospects.data ?? [])
      .filter(p => !researched.has(p.id) && !!websiteUrl(String(p.website ?? "")));
    const batch = eligible.slice(0, Math.min(AUTO_BATCH_MAX, remaining))
      .map(p => ({ id: p.id, company: p.company }));
    return reply({ batch, pending: eligible.length, remaining, max_daily: MAX_DAILY_PER_OWNER });
  }
  const result = await ownerProspect(request.nextUrl.searchParams.get("id") ?? "");
  if ("error" in result) return reply({ error: result.error }, result.status);
  const { data, error } = await result.session.supabase.from("crm_radar_research_reports")
    .select("report,scanned_at,website")
    .eq("prospect_id", result.prospect.id)
    .order("scanned_at", { ascending: false })
    .limit(1).maybeSingle();
  if (error) return reply({ error: "Historial de investigación no disponible. Comprueba la migración de research." }, 503);
  return reply({ report: (data?.report as ResearchReport | undefined) ?? null,
    scanned_at: data?.scanned_at ?? null, website: data?.website ?? result.prospect.website });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return reply({ error: "Origen no autorizado." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return reply({ error: "JSON requerido." }, 415);
  let payload: { id?: unknown; website?: unknown; automated?: unknown };
  try { payload = await request.json(); }
  catch { return reply({ error: "JSON inválido." }, 400); }
  const result = await ownerProspect(String(payload.id ?? ""));
  if ("error" in result) return reply({ error: result.error }, result.status);
  const { session, prospect } = result;
  if (prospect.do_not_contact || prospect.status === "rejected")
    return reply({ error: "Negocio descartado o No contactar; no se investigará automáticamente." }, 409);
  // Autonomous checks can only use the stored business website, never a caller-supplied URL.
  const automated = payload.automated === true;
  const website = String(automated ? prospect.website : (payload.website || prospect.website || "")).trim();
  const target = websiteUrl(website);
  if (!target) return reply({
    error: "Falta una web oficial HTTPS verificable. Puedes introducirla, pero no supondremos que el negocio carece de web.",
  }, 422);

  const db = session.supabase;
  const { data: latest, error: latestError } = await db.from("crm_radar_research_reports")
    .select("report,scanned_at,website").eq("prospect_id", prospect.id)
    .order("scanned_at", { ascending: false }).limit(1).maybeSingle();
  if (latestError) return reply({ error: "No se pudo consultar el historial de investigación." }, 503);
  if (latest && latest.website === target.href &&
      Date.now() - new Date(latest.scanned_at).getTime() < CACHE_MS)
    return reply({ ok: true, cached: true, report: latest.report as ResearchReport });

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count, error: quotaError } = await db.from("crm_radar_research_reports")
    .select("id", { count: "exact", head: true })
    .eq("created_by", session.userId)
    .gte("scanned_at", since.toISOString());
  if (quotaError) return reply({ error: "No fue posible comprobar el límite de investigaciones." }, 503);
  if ((count ?? 0) >= MAX_DAILY_PER_OWNER)
    return reply({ error: "Límite de 12 investigaciones diarias por propietario. No hacemos consultas masivas ni gastos automáticos." }, 429);

  const key = session.userId + ":" + prospect.id;
  if (inFlight.has(key)) return reply({ error: "Ya existe una investigación activa para este negocio." }, 429);
  inFlight.add(key);
  try {
    let report: ResearchReport;
    try { report = await investigateOfficialWebsite(target.href, prospect.company); }
    catch (cause) {
      // Preserve a truthful, dated no-evidence record so autonomous research
      // does not hammer blocked sites again on every dashboard visit.
      const error = cause instanceof ResearchBlocked ? cause : null;
      report = {
        status: "blocked", website: target.href, researched_at: new Date().toISOString(),
        pages: [], signals: [], confidence: "none", identity_matched: false,
        unverified: ["La web no se pudo verificar. No inferir carencias comerciales."],
        suggested_needs: [],
        warnings: [error?.message ?? "Sitio no disponible. No se alteraron las estrellas."],
      };
    }

    const { error: writeError } = await db.from("crm_radar_research_reports").insert({
      prospect_id: prospect.id, website: target.href, status: report.status,
      report, created_by: session.userId,
    });
    if (writeError) return reply({ error: "No se pudo guardar el informe de fuentes. No se modificó la calificación." }, 503);

    // Objective, positive evidence only. Never auto-label missing CRM, AI,
    // marketing or booking from the absence of HTML on a single page.
    let recordedWebsite = false;
    if (report.identity_matched && report.suggested_needs.length && prospect.status !== "converted") {
      const { data: existing, error } = await db.from("crm_prospect_needs")
        .select("id,method,state,note").eq("prospect_id", prospect.id).eq("service", "website").maybeSingle();
      const need = report.suggested_needs.find(x => x.service === "website");
      if (!error && need) {
        if (!existing) {
          const inserted = await db.from("crm_prospect_needs").insert({ prospect_id: prospect.id, ...need });
          recordedWebsite = !inserted.error;
        } else if (existing.method === "website_review" &&
                   typeof existing.note === "string" &&
                   existing.note.startsWith("Web oficial accesible por HTTPS") &&
                   existing.state === "verified_present" &&
                   need.state === "opportunity_to_improve") {
          // May upgrade only the previous explicitly automated website-presence
          // note; a human-entered finding must never be overwritten.
          const updated = await db.from("crm_prospect_needs")
            .update(need).eq("id", existing.id).eq("state", "verified_present");
          recordedWebsite = !updated.error;
        }
      }
      // An owner-entered official website is saved only after the website's
      // title/heading matches this business; existing Geoapify data is not overwritten.
      if (!prospect.website) await db.from("crm_prospects")
        .update({ website: target.href }).eq("id", prospect.id).eq("website", "");
    }
    const { data: current } = await db.from("crm_prospects")
      .select("stars,confidence,stars_reasons,stars_override").eq("id", prospect.id).maybeSingle();
    return reply({ ok: true, cached: false, report, recorded_website: recordedWebsite,
      stars: current?.stars_override ?? current?.stars ?? null,
      confidence: current?.confidence ?? "none" });
  } finally {
    inFlight.delete(key);
  }
}
