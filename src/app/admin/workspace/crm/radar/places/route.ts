import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { isValidRadarEmail } from "@/lib/crm/radar";
import { qualifyRadarProspect } from "@/lib/crm/radar-qualification";

export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const COLS = "id,company,contact,email,phone,source,industry,category,location,opportunity,status,source_kind,source_ref,lat,lon,website,license,first_seen_at,last_seen_at,do_not_contact,research_status,stars,stars_reasons,confidence,stars_override,override_reason,lead_id,owner_id,version,crm_prospect_needs(service,state,evidence_url,method,note,confidence,verified_at)";
const VIEWS = ["all", "new", "unrated", "preliminary", "qualified", "approved", "pipeline", "discarded", "dnc"];
const SERVICES = ["website", "ecommerce", "crm", "receptionist", "marketing", "automation"];
const STATES = ["verified_missing", "verified_present", "opportunity_to_improve", "unverified", "not_applicable"];
const METHODS = ["call", "website_review", "public_listing", "owner_statement", "visit", "other"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accumulated radar inbox: persisted businesses, filterable by view, stars and bounding box. */
export async function GET(request: NextRequest) {
  const session = await getOwnerSession();
  if (!session) return reply({ error: "No autorizado" }, 403);
  const p = request.nextUrl.searchParams;
  const view = VIEWS.includes(p.get("view") ?? "") ? p.get("view") : "all";
  let q = session.supabase.from("crm_prospects").select(COLS, { count: "exact" }).not("source_ref", "is", null);
  switch (view) {
    case "new": q = q.eq("research_status", "new").eq("status", "pending").eq("do_not_contact", false); break;
    case "unrated": q = q.is("stars", null).is("stars_override", null).eq("status", "pending").eq("do_not_contact", false); break;
    case "preliminary": q = q.gte("stars", 1).lte("stars", 2).is("stars_override", null).eq("status", "pending").eq("do_not_contact", false); break;
    case "qualified": q = q.or("stars.gte.3,stars_override.not.is.null").eq("status", "pending").eq("do_not_contact", false); break;
    case "approved": q = q.eq("status", "approved"); break;
    case "pipeline": q = q.eq("status", "converted"); break;
    case "discarded": q = q.eq("status", "rejected").eq("do_not_contact", false); break;
    case "dnc": q = q.eq("do_not_contact", true); break;
    default: q = q.eq("do_not_contact", false);
  }
  const minStars = Number(p.get("stars"));
  // Filter by the effective tier (manual override takes precedence over computed stars).
  if (Number.isInteger(minStars) && minStars >= 1 && minStars <= 5)
    q = q.or(`stars_override.gte.${minStars},and(stars_override.is.null,stars.gte.${minStars})`);
  const refs = (p.get("refs") ?? "").split(",").filter(r => /^[a-z0-9_]+:[A-Za-z0-9/_.:-]{1,120}$/.test(r)).slice(0, 200);
  if (refs.length) q = q.in("source_ref", refs);
  const bbox = (p.get("bbox") ?? "").split(",").map(Number);
  if (bbox.length === 4 && bbox.every(Number.isFinite)) q = q.gte("lat", bbox[0]).lte("lat", bbox[2]).gte("lon", bbox[1]).lte("lon", bbox[3]);
  const { data, error, count } = await q.order("stars", { ascending: false, nullsFirst: false }).order("last_seen_at", { ascending: false }).limit(300);
  if (error) return reply({ error: error.code === "42703" || error.code === "PGRST204" ? "La migración del radar (20261102190000) no está aplicada en este entorno." : "No se pudieron cargar los negocios." }, 503);
  return reply({ places: data, count });
}

/** Owner-only actions; a confirmed score creates the pipeline lead in one action. */
export async function POST(request: NextRequest) {
  const session = await getOwnerSession();
  if (!session) return reply({ error: "No autorizado" }, 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return reply({ error: "Origen no permitido" }, 403);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply({ error: "JSON inválido" }, 400); }
  const id = String(body.id ?? "");
  if (!UUID.test(id)) return reply({ error: "Negocio inválido" }, 400);
  const db = session.supabase;
  const qualifiedReply = async () => {
    const result = await qualifyRadarProspect(db, id);
    if (result.kind === "pipeline")
      return reply({ ok: true, qualified: true, stars: result.stars,
        lead_id: result.leadId, created: result.created, link_warning: result.linkWarning });
    if (result.kind === "unrated")
      return reply({ error: "Calificación insuficiente o preliminar: investiga necesidades reales o confirma una calificación manual justificada antes de crear la tarjeta.", code: "unrated" }, 422);
    if (result.kind === "blocked") return reply({ error: result.message }, result.status);
    return reply({ error: result.message, code: result.code, saved: true }, result.status);
  };
  const fail = (e: { code?: string; message?: string } | null, fallback = "No se pudo guardar.") => reply({ error:
    e?.message?.includes("radar_do_not_contact") ? "Marcado como No contactar: no puede aprobarse." :
    e?.message?.includes("aprueba") ? "Aprueba el prospecto antes de pasarlo al pipeline." :
    e?.code === "23514" ? "Datos no válidos (una necesidad verificada requiere método; el ajuste de estrellas requiere motivo de 10+ caracteres)." : fallback }, 400);
  switch (body.op) {
    case "need": {
      const service = String(body.service), state = String(body.state), method = String(body.method ?? ""), evidence = String(body.evidence_url ?? "").trim();
      if (!SERVICES.includes(service) || !STATES.includes(state) || (method && !METHODS.includes(method))) return reply({ error: "Necesidad inválida" }, 400);
      const conf = ["low", "medium", "high"].includes(String(body.confidence)) ? String(body.confidence) : "medium";
      const row = { prospect_id: id, service, state, method: ["unverified", "not_applicable"].includes(state) ? (method || "") : method, evidence_url: evidence, note: String(body.note ?? "").slice(0, 2000), confidence: conf, verified_at: state === "unverified" ? null : new Date().toISOString() };
      const existing = await db.from("crm_prospect_needs").select("id").eq("prospect_id", id).eq("service", service).maybeSingle();
      if (existing.error) return fail(existing.error);
      const { error } = existing.data ? await db.from("crm_prospect_needs").update(row).eq("id", existing.data.id) : await db.from("crm_prospect_needs").insert(row);
      if (error) return fail(error);
      // Database trigger recalculates evidence-based stars; evidence entry alone
      // never finalizes a partially investigated business.
      const { data: score } = await db.from("crm_prospects").select("stars,stars_override,stars_reasons").eq("id", id).maybeSingle();
      return reply({ ok: true, qualified: (score?.stars_override != null) ||
        ((score?.stars != null) && !score.stars_reasons?.some((reason: string) =>
          reason.startsWith("Precalificación automática:"))),
        stars: score?.stars_override ?? score?.stars ?? null });
    }
    case "override": {
      const stars = body.stars === null ? null : Number(body.stars);
      if (stars !== null && !(Number.isInteger(stars) && stars >= 1 && stars <= 5)) return reply({ error: "Estrellas inválidas" }, 400);
      const reason = String(body.reason ?? "").trim().slice(0, 1000);
      if (stars !== null && reason.length < 10)
        return reply({ error: "Explica la calificación en al menos 10 caracteres; no asignes estrellas sin fundamento." }, 400);
      const { error } = await db.from("crm_prospects").update({ stars_override: stars, override_reason: reason }).eq("id", id);
      if (error) return fail(error);
      // A saved manual rating is the owner's explicit qualification decision:
      // immediately create (or reuse) the CRM lead; no separate approval click.
      if (stars !== null) return qualifiedReply();
      return reply({ ok: true, qualified: false });
    }
    case "qualify":
      // Confirm the computed evidence-based tier and create its pipeline card.
      return qualifiedReply();
    case "contact": {
      const email = String(body.email ?? "").trim().toLowerCase();
      if (email && !isValidRadarEmail(email)) return reply({ error: "Correo inválido" }, 400);
      const { error } = await db.from("crm_prospects").update({ contact: String(body.contact ?? "").slice(0, 160), phone: String(body.phone ?? "").slice(0, 40), email: email || null }).eq("id", id);
      return error ? fail(error) : reply({ ok: true });
    }
    case "status": {
      const map: Record<string, Record<string, unknown>> = {
        approve: { status: "approved", research_status: "qualified" }, discard: { status: "rejected" },
        reopen: { status: "pending" }, dnc: { do_not_contact: true, status: "rejected" }, allow: { do_not_contact: false },
      };
      const patch = map[String(body.action)];
      if (!patch) return reply({ error: "Acción inválida" }, 400);
      const { error } = await db.from("crm_prospects").update(patch).eq("id", id);
      return error ? fail(error) : reply({ ok: true });
    }
    case "pipeline": {
      // The existing audited conversion: requires prior human approval, idempotent per prospect.
      const { data, error } = await db.rpc("crm_convert_prospect", { prospect_id: id });
      return error ? fail(error, "No se pudo pasar al pipeline.") : reply({ ok: true, lead_id: data });
    }
    default: return reply({ error: "Operación desconocida" }, 400);
  }
}
