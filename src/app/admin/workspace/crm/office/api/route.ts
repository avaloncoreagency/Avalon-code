import { NextRequest, NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/session";
import { MANAGERS, MANAGER_INTEGRATION, isManagerKey } from "@/lib/office/managers";
import { PERIODS, completedSeries, memberStats, teamStats, type Period, type TaskLite } from "@/lib/office/stats";
import { INACTIVE, staffPresence, type StaffCalendarEvent } from "@/lib/office/presence";

export const dynamic = "force-dynamic";
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF_TYPES = ["lead", "client", "sale", "project", "task"];
const PRIORITIES = ["low", "normal", "high", "urgent"];
const missing = (e: { code?: string } | null) => !!e && ["42P01", "42883", "PGRST202", "PGRST205", "42703"].includes(e.code ?? "");
const OFFLINE = "Agente sin conexión de ejecución. La solicitud quedó registrada, pero no se ha ejecutado.";

type Member = { user_id: string; role: string; email: string; joined_at: string | null; display_name: string; title: string; department: string; bio: string; specialties: string[]; has_photo: boolean; profile_updated_at: string | null };

/**
 * Office data. Default: directory + stats. ?member=<id>: recent activity and open tasks.
 * ?thread=<id>: private messages with that member (marks incoming as read). ?agent=<key>: requests registered for a manager.
 */
export async function GET(request: NextRequest) {
  const session = await getOwnerSession();
  if (!session) return reply({ error: "No autorizado" }, 403);
  const db = session.supabase, me = session.user.id, p = request.nextUrl.searchParams;

  const member = p.get("member");
  if (member) {
    if (!UUID.test(member)) return reply({ error: "Miembro inválido" }, 400);
    const [activity, open, workOrders, assignedTasks] = await Promise.all([
      db.from("crm_timeline").select("id,event_type,module,entity,detail,result,created_at").eq("actor_id", member).order("created_at", { ascending: false }).limit(15),
      db.from("crm_tasks").select("id,title,priority,status,due_at").eq("assignee_id", member).in("status", ["todo", "in_progress", "blocked"]).order("due_at", { ascending: true, nullsFirst: false }).limit(20),
      db.from("crm_work_orders").select("project_id,client_id,status").eq("assignee_id", member).limit(500),
      db.from("crm_tasks").select("project_id,client_id,status").eq("assignee_id", member).limit(1000),
    ]);
    // A project is associated with a member only through an actual assigned work order or task.
    // Never infer assignments from the client name or expose all projects as "assigned".
    type Assignment = { project_id: string | null; client_id: string | null; work_orders: number; open_tasks: number };
    const assigned = new Map<string, Assignment>();
    const add = (r: { project_id: string | null; client_id: string | null }, source: "order" | "task", status: string) => {
      if (!r.project_id && !r.client_id) return;
      const key = r.project_id ? `project:${r.project_id}` : `client:${r.client_id}`;
      const current = assigned.get(key) ?? { project_id: r.project_id, client_id: r.client_id, work_orders: 0, open_tasks: 0 };
      if (!current.client_id) current.client_id = r.client_id;
      if (source === "order") current.work_orders += 1;
      if (source === "task" && ["todo", "in_progress", "blocked"].includes(status)) current.open_tasks += 1;
      assigned.set(key, current);
    };
    for (const r of workOrders.data ?? []) add(r, "order", r.status);
    for (const r of assignedTasks.data ?? []) add(r, "task", r.status);
    const items = [...assigned.values()];
    const projectIds = [...new Set(items.map(r => r.project_id).filter((id): id is string => !!id))];
    const clientIds = [...new Set(items.map(r => r.client_id).filter((id): id is string => !!id))];
    const [projectMeta, clientMeta] = await Promise.all([
      projectIds.length ? db.from("os_projects").select("id,name,module,status,client_id").in("id", projectIds).limit(500) : Promise.resolve({ data: [] as { id: string; name: string; module: string; status: string; client_id: string | null }[], error: null }),
      clientIds.length ? db.from("crm_clients").select("id,legal_name").in("id", clientIds).limit(500) : Promise.resolve({ data: [] as { id: string; legal_name: string }[], error: null }),
    ]);
    const projectById = new Map((projectMeta.data ?? []).map(r => [r.id, r]));
    const clientById = new Map((clientMeta.data ?? []).map(r => [r.id, r.legal_name]));
    // Some older projects carry the client link only on os_projects.
    const linkedClientIds = [...new Set((projectMeta.data ?? []).map(r => r.client_id).filter((id): id is string => !!id && !clientById.has(id)))];
    const linkedClients = linkedClientIds.length ? await db.from("crm_clients").select("id,legal_name").in("id", linkedClientIds).limit(500) : { data: [] as { id: string; legal_name: string }[], error: null };
    for (const r of linkedClients.data ?? []) clientById.set(r.id, r.legal_name);
    const projects = items.flatMap(item => {
      const p = item.project_id ? projectById.get(item.project_id) : null;
      const clientId = p?.client_id ?? item.client_id;
      if ((!p && item.project_id) || (!p && !clientId) || (clientId && !clientById.has(clientId))) return [];
      return [{
        id: p?.id ?? null, name: p?.name ?? clientById.get(clientId!) ?? "",
        module: p?.module ?? null, status: p?.status ?? null,
        client_id: clientId, client_name: clientId ? clientById.get(clientId) ?? null : null,
        work_orders: item.work_orders, open_tasks: item.open_tasks,
      }];
    }).sort((a, b) => a.name.localeCompare(b.name));
    return reply({
      activity: activity.data ?? [], tasks: open.data ?? [], projects,
      activityUnavailable: !!activity.error,
      projectsUnavailable: !!(workOrders.error || assignedTasks.error || projectMeta.error || clientMeta.error || linkedClients.error),
    });
  }

  const thread = p.get("thread");
  if (thread) {
    if (!UUID.test(thread) || thread === me) return reply({ error: "Miembro inválido" }, 400);
    // RLS already limits rows to messages where the caller is sender or recipient; this narrows to the pair.
    const { data, error } = await db.from("office_messages").select("id,sender_id,recipient_id,body,ref_type,ref_id,read_at,created_at")
      .or(`sender_id.eq.${thread},recipient_id.eq.${thread}`)
      .order("created_at", { ascending: true }).limit(200);
    if (error) return reply({ messages: [], unavailable: missing(error) ? "schema" : "error" });
    if (data.some(m => m.recipient_id === me && !m.read_at)) await db.from("office_messages").update({ read_at: new Date().toISOString() }).eq("sender_id", thread).eq("recipient_id", me).is("read_at", null);
    return reply({ messages: data });
  }

  const agent = p.get("agent");
  if (agent) {
    if (!isManagerKey(agent)) return reply({ error: "Manager inválido" }, 400);
    const { data, error } = await db.from("office_agent_requests").select("id,body,ref_type,ref_id,status,created_by,created_at,cancelled_at").eq("agent", agent).order("created_at", { ascending: false }).limit(50);
    return reply({ requests: data ?? [], unavailable: error ? (missing(error) ? "schema" : "error") : null, notice: OFFLINE });
  }

  const period: Period = (PERIODS as readonly string[]).includes(p.get("period") ?? "") ? (p.get("period") as Period) : "30";
  let profilesReady = true;
  let directory = await db.rpc("office_directory");
  let members: Member[];
  if (directory.error && missing(directory.error)) {
    profilesReady = false;
    directory = await db.rpc("crm_owner_directory");
    members = ((directory.data ?? []) as { user_id: string; email: string }[]).map(o => ({ user_id: o.user_id, email: o.email, role: "owner", joined_at: null, display_name: "", title: "", department: "", bio: "", specialties: [], has_photo: false, profile_updated_at: null }));
  } else members = (directory.data ?? []) as Member[];
  if (directory.error) return reply({ error: "No se pudo cargar el directorio." }, 503);

  const now = Date.now();
  const [tasks, projects, timeline, unread, pendingRequests, availability, timeOff, busyCalendar] = await Promise.all([
    db.from("crm_tasks").select("assignee_id,status,due_at,completed_at,created_at,project_id").limit(5000),
    db.from("os_projects").select("id", { count: "exact", head: true }).eq("status", "active"),
    db.from("crm_timeline").select("id,event_type,module,actor_id,detail,result,created_at").order("created_at", { ascending: false }).limit(12),
    db.from("office_messages").select("sender_id").eq("recipient_id", me).is("read_at", null).limit(1000),
    db.from("office_agent_requests").select("agent").eq("status", "registered").limit(1000),
    db.from("office_availability").select("user_id,timezone,weekly_hours").limit(100),
    db.from("office_time_off").select("user_id,starts_on,ends_on,reason").gte("ends_on",new Date(now - 2 * 86400000).toISOString().slice(0,10)).order("starts_on").limit(100),
    db.from("crm_events").select("owner_id,attendee_ids,starts_at,ends_at,status")
      .eq("status", "scheduled").lte("starts_at",new Date(now).toISOString()).gt("ends_at",new Date(now).toISOString()).limit(300),
  ]);
  const scheduleBy = new Map((availability.data ?? []).map(a => [a.user_id, { timezone:a.timezone, weekly_hours:a.weekly_hours }]));
  const absentBy = new Map<string, { starts_on:string; ends_on:string; reason:string }[]>();
  for (const entry of timeOff.data ?? []) absentBy.set(entry.user_id,[...(absentBy.get(entry.user_id) ?? []),entry]);
  const calendarEvents = (busyCalendar.data ?? []) as StaffCalendarEvent[];
  const presenceUnavailable = !!(availability.error || timeOff.error || busyCalendar.error);
  const taskRows = (tasks.data ?? []) as TaskLite[];
  const lastActivity: Record<string, string> = {};
  const recentAll = await db.from("crm_timeline").select("actor_id,created_at").in("actor_id", members.map(m => m.user_id)).order("created_at", { ascending: false }).limit(500);
  for (const r of (recentAll.data ?? []) as { actor_id: string; created_at: string }[]) if (!(r.actor_id in lastActivity)) lastActivity[r.actor_id] = r.created_at;
  const unreadBy: Record<string, number> = {};
  for (const r of (unread.data ?? []) as { sender_id: string }[]) unreadBy[r.sender_id] = (unreadBy[r.sender_id] ?? 0) + 1;
  const requestsBy: Record<string, number> = {};
  for (const r of (pendingRequests.data ?? []) as { agent: string }[]) requestsBy[r.agent] = (requestsBy[r.agent] ?? 0) + 1;

  return reply({
    me, period, profilesReady, messagingReady: !missing(unread.error) && !unread.error,
    tasksReady: !tasks.error,
    members: members.map(m => ({ ...m, availability: scheduleBy.get(m.user_id) ?? null, timeOff: absentBy.get(m.user_id) ?? [],
      presence: presenceUnavailable ? INACTIVE : staffPresence(m.user_id, scheduleBy.get(m.user_id), absentBy.get(m.user_id) ?? [], calendarEvents, new Date(now)),
      stats: memberStats(taskRows, m.user_id, period, now), lastActivity: lastActivity[m.user_id] ?? null, unread: unreadBy[m.user_id] ?? 0 })),
    managers: MANAGERS.map(m => ({ ...m, status: MANAGER_INTEGRATION.status, registered: requestsBy[m.key] ?? 0 })),
    integration: MANAGER_INTEGRATION,
    team: { ...teamStats(taskRows, period, now), projects: projects.error ? null : projects.count ?? 0, series: completedSeries(taskRows, 14, now) },
    recent: timeline.data ?? [],
  });
}

/** Writes from the Office: message, agent request (registered only), cancel request, task, own profile. */
export async function POST(request: NextRequest) {
  const session = await getOwnerSession();
  if (!session) return reply({ error: "No autorizado" }, 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return reply({ error: "Origen no permitido" }, 403);
  if (Number(request.headers.get("content-length") ?? 0) > 32768) return reply({ error: "Solicitud demasiado grande" }, 413);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply({ error: "JSON inválido" }, 400); }
  const db = session.supabase;
  const text = (k: string, max: number) => String(body[k] ?? "").trim().slice(0, max);
  const ref = () => {
    const type = String(body.ref_type ?? ""), id = String(body.ref_id ?? "");
    if (!type && !id) return { ref_type: null, ref_id: null };
    return REF_TYPES.includes(type) && UUID.test(id) ? { ref_type: type, ref_id: id } : undefined;
  };
  const fail = (e: { code?: string; message?: string } | null, fallback: string) => reply({ error:
    missing(e) ? "La migración de Oficina (20261103100000) no está aplicada en este entorno." :
    e?.message?.includes("office_ref_missing") ? "El registro vinculado no existe o no es visible." :
    e?.message?.includes("office_rate_limited") ? "Demasiados envíos en una hora. Intenta más tarde." : fallback }, missing(e) ? 503 : 400);

  switch (body.op) {
    case "message": {
      const to = String(body.to ?? ""), msg = text("body", 4000), r = ref();
      if (!UUID.test(to) || to === session.user.id) return reply({ error: "Destinatario inválido" }, 400);
      if (!msg) return reply({ error: "Escribe un mensaje." }, 400);
      if (!r) return reply({ error: "Referencia inválida" }, 400);
      const { data, error } = await db.from("office_messages").insert({ recipient_id: to, body: msg, ...r }).select("id,created_at").single();
      return error ? fail(error, "No se pudo enviar el mensaje.") : reply(data, 201);
    }
    case "agent_request": {
      const agent = String(body.agent ?? ""), msg = text("body", 2000), r = ref();
      if (!isManagerKey(agent)) return reply({ error: "Manager inválido" }, 400);
      if (!msg) return reply({ error: "Escribe la solicitud." }, 400);
      if (!r) return reply({ error: "Referencia inválida" }, 400);
      const { data, error } = await db.from("office_agent_requests").insert({ agent, body: msg, ...r }).select("id,status,created_at").single();
      return error ? fail(error, "No se pudo registrar la solicitud.") : reply({ ...data, notice: OFFLINE }, 201);
    }
    case "cancel_request": {
      const id = String(body.id ?? "");
      if (!UUID.test(id)) return reply({ error: "Solicitud inválida" }, 400);
      const { data, error } = await db.from("office_agent_requests").update({ status: "cancelled" }).eq("id", id).eq("created_by", session.user.id).select("id").maybeSingle();
      return error ? fail(error, "No se pudo cancelar.") : data ? reply(data) : reply({ error: "Solo quien la creó puede cancelarla." }, 403);
    }
    case "task": {
      const assignee = String(body.assignee ?? ""), title = text("title", 200), priority = String(body.priority ?? "normal");
      if (!UUID.test(assignee) || !title || !PRIORITIES.includes(priority)) return reply({ error: "Tarea inválida" }, 400);
      let due: string | null = null;
      if (body.due_at) { const d = new Date(String(body.due_at)); if (Number.isNaN(d.getTime())) return reply({ error: "Fecha inválida" }, 400); due = d.toISOString(); }
      const { data, error } = await db.from("crm_tasks").insert({ title, description: text("description", 4000), assignee_id: assignee, priority, due_at: due }).select("id").single();
      return error ? fail(error, "No se pudo crear la tarea (solo miembros autorizados pueden recibir tareas).") : reply(data, 201);
    }
    case "profile": {
      const specialties = (Array.isArray(body.specialties) ? body.specialties : String(body.specialties ?? "").split(","))
        .map(s => String(s).trim().slice(0, 40)).filter(Boolean).slice(0, 8);
      const values = { display_name: text("display_name", 80), title: text("title", 80), department: text("department", 80), bio: text("bio", 600), specialties };
      const { error } = await db.from("office_profiles").upsert({ user_id: session.user.id, ...values }, { onConflict: "user_id" });
      return error ? fail(error, "No se pudo guardar el perfil.") : reply({ ok: true });
    }
    default: return reply({ error: "Operación inválida" }, 400);
  }
}
