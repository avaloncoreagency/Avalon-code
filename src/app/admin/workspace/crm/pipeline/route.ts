import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ["note", "call", "email", "whatsapp", "meeting", "task"];
const PENDING_MIGRATION = "La migración del tablero (20261102210000) no está aplicada en este entorno.";
const missing = (e: { code?: string } | null) => e?.code === "42P01" || e?.code === "PGRST205" || e?.code === "42703";

/**
 * Board metadata (owners + next pending activity per lead) or, with ?lead=, the card timeline:
 * stage history, activities/notes and attachment metadata (never file content).
 */
export async function GET(request: NextRequest) {
  const session = await getOwnerSession();
  if (!session) return reply({ error: "No autorizado" }, 403);
  const db = session.supabase;
  const lead = request.nextUrl.searchParams.get("lead");
  if (!lead) {
    const [owners, pending] = await Promise.all([
      db.rpc("crm_owner_directory"),
      db.from("crm_activities").select("lead_id,due_at").eq("status", "pending").not("lead_id", "is", null).order("due_at", { ascending: true, nullsFirst: false }).limit(2000),
    ]);
    const next: Record<string, string | null> = {};
    for (const a of (pending.data ?? []) as { lead_id: string; due_at: string | null }[]) if (!(a.lead_id in next)) next[a.lead_id] = a.due_at;
    return reply({ owners: owners.data ?? [], next, userId: session.user.id });
  }
  if (!UUID.test(lead)) return reply({ error: "Lead inválido" }, 400);
  const [history, activities, files] = await Promise.all([
    db.from("crm_lead_stage_history").select("id,from_stage,to_stage,actor_id,seconds_in_previous,changed_at").eq("lead_id", lead).order("changed_at", { ascending: false }).limit(200),
    db.from("crm_activities").select("id,kind,body,status,due_at,created_by,created_at").eq("lead_id", lead).order("created_at", { ascending: false }).limit(200),
    db.from("crm_attachments").select("id,filename,mime,size_bytes,note,created_by,created_at").eq("lead_id", lead).order("created_at", { ascending: false }).limit(500),
  ]);
  if (activities.error) return reply({ error: "No se pudo cargar el historial." }, 503);
  return reply({
    history: history.data ?? [], activities: activities.data ?? [], files: files.data ?? [],
    unavailable: missing(history.error) || missing(files.error) ? PENDING_MIGRATION : null,
  });
}

/** Add a note (done) or schedule an activity (pending) on a lead's timeline. */
export async function POST(request: NextRequest) {
  const session = await getOwnerSession();
  if (!session) return reply({ error: "No autorizado" }, 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return reply({ error: "Origen no permitido" }, 403);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply({ error: "JSON inválido" }, 400); }
  const lead = String(body.lead ?? ""), text = String(body.body ?? "").trim(), kind = String(body.kind ?? "note");
  if (!UUID.test(lead)) return reply({ error: "Lead inválido" }, 400);
  if (text.length < 1 || text.length > 4000) return reply({ error: "Escribe entre 1 y 4000 caracteres." }, 400);
  if (!KINDS.includes(kind)) return reply({ error: "Tipo inválido" }, 400);
  let due: string | null = null;
  if (body.due_at) {
    const d = new Date(String(body.due_at));
    if (Number.isNaN(d.getTime())) return reply({ error: "Fecha inválida" }, 400);
    due = d.toISOString();
  }
  const { data, error } = await session.supabase.from("crm_activities")
    .insert({ lead_id: lead, kind, body: text, status: due ? "pending" : "completed", due_at: due }).select("id").single();
  return error ? reply({ error: "No se pudo guardar la nota." }, 400) : reply(data, 201);
}
