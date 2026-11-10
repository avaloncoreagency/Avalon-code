import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const COLS = "id,trigger,status,query_kind,label,center_lat,center_lon,radius_m,industries,found,inserted,updated,error,started_at,finished_at,campaign_id";

/** Persistent search history (owners only, RLS): what was searched, where, and how many businesses each run found. */
export async function GET() {
  const session = await getOwnerSession();
  if (!session) return reply({ error: "No autorizado" }, 403);
  const { data, error } = await session.supabase.from("crm_radar_runs").select(COLS).order("started_at", { ascending: false }).limit(30);
  if (error) return reply({ error: error.code === "42703" || error.code === "PGRST204"
    ? "La migración 20261110140000 (historial de búsquedas) no está aplicada en este entorno." : "No se pudo cargar el historial.", blocked: error.code === "42703" ? "migration" : undefined }, 503);
  return reply({ runs: data });
}
