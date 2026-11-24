import { loadOwnerDirectory } from "@/lib/identity/directory";
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
      loadOwnerDirectory(db),
      db.from("crm_activities").select("lead_id,due_at").eq("status", "pending").not("lead_id", "is", null).order("due_at", { ascending: true, nullsFirst: false }).limit(2000),
    ]);
    const next: Record<string, string | null> = {};
    for (const a of (pending.data ?? []) as { lead_id: string; due_at: string | null }[]) if (!(a.lead_id in next)) next[a.lead_id] = a.due_at;
    return reply({ owners: owners.data ?? [], next, userId: session.user.id });
  }
  if (!UUID.test(lead)) return reply({ error: "Lead inválido" }, 400);
  const limit = timelineLimit(request.nextUrl.searchParams.get("limit"));
  // limit + 1 rows reveal truncation without a second count query.
  const [history, activities, files, leadEdits] = await Promise.all([
    db.from("crm_lead_stage_history").select("id,from_stage,to_stage,actor_id,seconds_in_previous,changed_at").eq("lead_id", lead).order("changed_at", { ascending: false }).limit(limit + 1),
    db.from("crm_activities").select("id,kind,body,status,due_at,created_by,created_at").eq("lead_id", lead).order("created_at", { ascending: false }).limit(limit + 1),
    db.from("crm_attachments").select("id,filename,mime,size_bytes,note,created_by,created_at").eq("lead_id", lead).order("created_at", { ascending: false }).limit(limit + 1),
    db.from("crm_audit").select("id,entity,record_id,actor_id,created_at,before_data,after_data").eq("entity", "crm_leads").eq("record_id", lead).eq("operation", "UPDATE").order("created_at", { ascending: false }).limit(limit + 1),
  ]);
  const activityIds = ((activities.data ?? []) as { id: string }[]).slice(0, limit).map(a => a.id);
  const activityEdits = activityIds.length
    ? await db.from("crm_audit").select("id,entity,record_id,actor_id,created_at,before_data,after_data").eq("entity", "crm_activities").in("record_id", activityIds).eq("operation", "UPDATE").order("created_at", { ascending: false }).limit(limit + 1)
    : { data: [], error: null };
  const sources: Record<string, { error: { code?: string } | null }> = { history, activities, files, edits: leadEdits };
  if (activityIds.length) sources.activityEdits = activityEdits; // not queried when there is nothing to audit
  // A failed source is reported, never rendered as an empty-but-complete list.
  const incomplete = Object.entries(sources).filter(([, r]) => r.error && !missing(r.error)).map(([name]) => name);
  if (incomplete.length === Object.keys(sources).length) return reply({ error: "No se pudo cargar el historial." }, 503);
  const page = <T,>(r: { data: unknown; error: unknown }) => {
    const rows = (r.error ? [] : ((r.data ?? []) as T[]));
    return { rows: rows.slice(0, limit), truncated: rows.length > limit };
  };
  const h = page<Record<string, unknown>>(history), a = page<Record<string, unknown>>(activities), f = page<Record<string, unknown>>(files);
  const le = page<AuditRow>(leadEdits), ae = page<AuditRow>(activityEdits);
  const edits = [...le.rows, ...ae.rows].map(editSummary).filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((x, y) => String(y.at).localeCompare(String(x.at)));
  return reply({
    history: h.rows, activities: a.rows, files: f.rows, edits,
    truncated: { history: h.truncated, activities: a.truncated, files: f.truncated, edits: le.truncated || ae.truncated },
    limit, maxLimit: MAX_LIMIT, incomplete,
    unavailable: missing(history.error) || missing(files.error) ? PENDING_MIGRATION : null,
  });
}

type AuditRow = { id: string; entity: string; record_id: string; actor_id: string | null; created_at: string; before_data: Record<string, unknown> | null; after_data: Record<string, unknown> | null };
const DEFAULT_LIMIT = 200, MAX_LIMIT = 1000;
function timelineLimit(raw: string | null) {
  const n = Number(raw ?? DEFAULT_LIMIT);
  return Number.isInteger(n) ? Math.min(MAX_LIMIT, Math.max(50, n)) : DEFAULT_LIMIT;
}
// Bookkeeping columns never shown as edits; stage moves already appear as stage history.
// Derived columns maintained by triggers (last_interaction_at on every note/activity, the computed lead_score)
// are not owner edits: the note/activity itself is the event. The audit rows are kept untouched in the database.
const IGNORED = new Set(["id", "agency_key", "version", "updated_at", "created_at", "created_by", "stage_id", "stage_entered_at", "search_vector",
  "last_interaction_at", "lead_score"]);
const FIELD_LABEL: Record<string, string> = {
  company: "Empresa", contact: "Contacto", email: "Correo", phone: "Teléfono", website: "Website", city: "Ciudad", zip: "ZIP",
  source: "Origen", value: "Valor estimado", priority: "Prioridad", owner_id: "Responsable", follow_up_at: "Próximo contacto",
  next_action: "Próxima acción", notes: "Notas", loss_reason: "Motivo de pérdida", industry: "Industria", archived: "Archivado",
  body: "Texto", status: "Estado", due_at: "Fecha", kind: "Tipo", contract_status: "Estado del contrato", industry_key: "Industria",
};
/** Only changed field NAMES leave the server: never the before/after values (they can hold private content). */
function editSummary(row: AuditRow) {
  const before = row.before_data ?? {}, after = row.after_data ?? {};
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => !IGNORED.has(key) && JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
    .map(key => FIELD_LABEL[key] ?? "Otro campo");
  if (!fields.length) return null;
  return { id: row.id, at: row.created_at, actor_id: row.actor_id, target: row.entity === "crm_activities" ? "activity" : "lead", fields: [...new Set(fields)] };
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
