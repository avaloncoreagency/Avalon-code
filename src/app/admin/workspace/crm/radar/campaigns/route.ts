import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { INDUSTRIES, LICENSED_MAX_RADIUS_M, PUBLIC_MAX_RADIUS_M, type IndustryId } from "@/lib/crm/radar";
import { radarEndpoint, searchAndIngest } from "@/lib/crm/radar-search";
import { GEOAPIFY_FREE_MAX_RADIUS_M } from "@/lib/crm/radar-geoapify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLS = "id,name,center_lat,center_lon,radius_m,place_label,categories,frequency,run_hour,timezone,source,max_results,monthly_budget_usd,status,last_run_at,next_run_at,crm_radar_runs(status,found,inserted,updated,error,started_at)";

export async function GET() {
  const session = await getOwnerSession();
  if (!session) return reply({ error: "No autorizado" }, 403);
  const { data, error } = await session.supabase.from("crm_radar_campaigns").select(COLS).order("created_at", { ascending: false }).limit(50);
  if (error) return reply({ error: "La migración del radar (20261102190000) no está aplicada en este entorno." }, 503);
  const endpoint = radarEndpoint();
  // The scheduler needs a server credential that Avalon deliberately does not hold (no service-role key in app code).
  return reply({ campaigns: data, scheduler: { available: false, reason: "Programación automática pendiente: requiere proveedor con licencia y una credencial de servidor aprobada por los propietarios. Usa «Ejecutar ahora».", licensedProvider: !("error" in endpoint) && endpoint.licensed } });
}

export async function POST(request: NextRequest) {
  const session = await getOwnerSession();
  if (!session) return reply({ error: "No autorizado" }, 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return reply({ error: "Origen no permitido" }, 403);
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return reply({ error: "JSON inválido" }, 400); }
  const db = session.supabase;
  if (b.op === "create") {
    const lat = Number(b.lat), lon = Number(b.lon), radius = Math.round(Number(b.radius_m));
    const name = String(b.name ?? "").trim().slice(0, 120);
    const categories = (Array.isArray(b.categories) ? b.categories : []).map(String).filter((x): x is IndustryId => Object.hasOwn(INDUSTRIES, x)).slice(0, 10);
    const frequency = ["daily", "weekly", "monthly"].includes(String(b.frequency)) ? String(b.frequency) : "weekly";
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isSafeInteger(radius) || radius < 100 || radius > LICENSED_MAX_RADIUS_M) return reply({ error: "Campaña inválida" }, 400);
    const { data, error } = await db.from("crm_radar_campaigns").insert({ name, center_lat: lat, center_lon: lon, radius_m: radius, place_label: String(b.place_label ?? "").slice(0, 200), categories, frequency, owner_id: session.userId, status: "paused" }).select("id").single();
    return error ? reply({ error: "No se pudo crear la campaña." }, 400) : reply({ ok: true, id: data.id });
  }
  const id = String(b.id ?? "");
  if (!UUID.test(id)) return reply({ error: "Campaña inválida" }, 400);
  if (b.op === "status") {
    const status = b.status === "active" ? "active" : "paused";
    const { error } = await db.from("crm_radar_campaigns").update({ status }).eq("id", id);
    return error ? reply({ error: "No se pudo actualizar." }, 400) : reply({ ok: true });
  }
  if (b.op === "run") {
    const { data: c, error } = await db.from("crm_radar_campaigns").select("id,center_lat,center_lon,radius_m,place_label,categories,max_results").eq("id", id).maybeSingle();
    if (error || !c) return reply({ error: "Campaña no encontrada." }, 404);
    const endpoint = radarEndpoint();
    if ("error" in endpoint) return reply({ error: endpoint.error, blocked: "provider" }, 503);
    if (endpoint.provider === "geoapify" && c.radius_m > GEOAPIFY_FREE_MAX_RADIUS_M)
      return reply({ error: "Geoapify Free: la ejecución manual de campañas admite hasta 5 km.", blocked: "provider" }, 400);
    if (!endpoint.licensed && c.radius_m > PUBLIC_MAX_RADIUS_M)
      return reply({ error: "Esta campaña supera 5 km: necesita un proveedor con licencia o propio.", blocked: "provider" }, 503);
    // One run per campaign per hour: repeated clicks replay the same run instead of re-querying.
    const runKey = `campaign:${c.id}:${new Date().toISOString().slice(0, 13)}`;
    const out = await searchAndIngest(db, { lat: c.center_lat, lon: c.center_lon, radiusM: c.radius_m, industries: c.categories as IndustryId[], label: c.place_label }, runKey, c.id, c.max_results);
    return out.ok ? reply({ ok: true, run: out.run }) : reply({ error: out.error, blocked: out.blocked }, out.status);
  }
  return reply({ error: "Operación desconocida" }, 400);
}
