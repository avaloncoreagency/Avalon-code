import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { normalizeObservation } from "@/lib/ai-credits/model";

export const dynamic = "force-dynamic";
const send = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET() {
  const owner = await getOwnerSession();
  if (!owner) return send({ error: "No autorizado" }, 403);
  const { data, error } = await owner.supabase
    .from("avalon_ai_credit_snapshots")
    .select("id,account_key,seat_key,metric_key,quota_window,unit,amount,limit_value,period_start,period_end,source_label,observed_at,mode")
    .eq("agency_key", "avalon")
    .order("observed_at", { ascending: false })
    .limit(250);
  if (error) return send({ error: "Centro de créditos no disponible. La migración debe aprobarse y aplicarse en el entorno." }, 503);
  return send({ rows: data, connectedProviders: [], note: "Observaciones manuales, no balances en vivo" });
}
export async function POST(request: NextRequest) {
  const owner = await getOwnerSession();
  if (!owner) return send({ error: "No autorizado" }, 403);
  const origin = process.env.APP_ORIGIN;
  if (!origin || request.headers.get("origin") !== new URL(origin).origin)
    return send({ error: "Origen no autorizado" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return send({ error: "JSON requerido" }, 415);
  const raw = await request.text();
  if (raw.length > 4096) return send({ error: "Solicitud demasiado grande" }, 413);
  let values;
  try {
    values = normalizeObservation(JSON.parse(raw));
  } catch (e) {
    return send({ error: e instanceof Error ? e.message : "Datos inválidos" }, 400);
  }
  const { data, error } = await owner.supabase
    .from("avalon_ai_credit_snapshots")
    .insert(values)
    .select("id")
    .single();
  if (error) return send({ error: "No se pudo guardar la lectura. Verifica la migración y tus permisos." }, 503);
  return send({ id: data.id }, 201);
}
