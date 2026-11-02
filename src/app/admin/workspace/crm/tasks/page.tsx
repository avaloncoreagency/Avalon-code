import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, OkFlash, ErrorFlash, Tag, Unavailable, ownerName, q, UUID_RE, type Query } from "@/components/sales/ui";
import { TzOffset } from "@/components/sales/tz-offset";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import { label, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/sales/domain";
import { commentTask, createTask, updateTask } from "./actions";
import { taskLink } from "@/lib/crm/task-links";
import s from "@/components/sales/sales.module.css";
export const dynamic = "force-dynamic";

type Task = { id: string; title: string; description: string; assignee_id: string; created_by: string; client_id: string | null; project_id: string | null; sale_id: string | null; work_order_id: string | null; department_id: string | null; priority: string; status: string; due_at: string | null; completed_at: string | null; source: string; version: number; created_at: string; crm_clients: { legal_name: string } | null; crm_departments: { label: string } | null };
const COLS = "id,title,description,assignee_id,created_by,client_id,project_id,sale_id,work_order_id,department_id,priority,status,due_at,completed_at,source,version,created_at,crm_clients(legal_name),crm_departments(label)";
const OPEN = ["todo", "in_progress", "blocked"];
const PAGE = 50;

export default async function TasksPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { supabase, userId } = await requireOwner();
  const lang = await getLang();
  const p = await searchParams;
  const view = ["mine", "all", "overdue", "done", "assigned"].includes(q(p, "view") ?? "") ? q(p, "view")! : "mine";
  const client = q(p, "client"), workOrder = q(p, "work_order"), taskId = q(p, "task");
  const page = Math.min(Number(/^\d{1,4}$/.test(q(p, "page") ?? "") ? q(p, "page") : 0), 2000);
  const now = new Date().toISOString();

  let query = supabase.from("crm_tasks").select(COLS, { count: "exact" });
  if (view === "mine") query = query.eq("assignee_id", userId).in("status", OPEN);
  if (view === "assigned") query = query.eq("created_by", userId).neq("assignee_id", userId).in("status", OPEN);
  if (view === "overdue") query = query.in("status", OPEN).lt("due_at", now);
  if (view === "done") query = query.in("status", ["done", "cancelled"]);
  if (view === "all") query = query.in("status", OPEN);
  if (client && UUID_RE.test(client)) query = query.eq("client_id", client);
  if (workOrder && UUID_RE.test(workOrder)) query = query.eq("work_order_id", workOrder);
  const [tasks, owners, clients, detail, orderContext] = await Promise.all([
    run<Task[]>(query.order("due_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)),
    run<{ user_id: string; email: string }[]>(supabase.rpc("crm_owner_directory")),
    run<{ id: string; legal_name: string }[]>(supabase.from("crm_clients").select("id,legal_name").neq("status", "archived").order("legal_name").limit(500)),
    taskId && UUID_RE.test(taskId) ? run<Task | null>(supabase.from("crm_tasks").select(COLS).eq("id", taskId).maybeSingle()) : Promise.resolve(null),
    workOrder && UUID_RE.test(workOrder)
      ? run<{ id: string; client_id: string; sale_id: string; project_id: string | null; department_id: string } | null>(
        supabase.from("crm_work_orders").select("id,client_id,sale_id,project_id,department_id").eq("id", workOrder).maybeSingle())
      : Promise.resolve(null),
  ]);
  const [comments, history] = detail?.data ? await Promise.all([
    run<{ id: string; body: string; created_by: string; created_at: string }[]>(supabase.from("crm_task_comments").select("id,body,created_by,created_at").eq("task_id", detail.data.id).order("created_at")),
    run<{ id: number; event_type: string; from_state: string | null; to_state: string | null; actor_id: string | null; created_at: string }[]>(supabase.from("crm_timeline").select("id,event_type,from_state,to_state,actor_id,created_at").eq("task_id", detail.data.id).order("id")),
  ]) : [null, null];
  const ownerList = owners.data ?? [];
  const activeOrder = orderContext?.data ?? null;
  const mismatchedClient = Boolean(activeOrder && client && UUID_RE.test(client) && client !== activeOrder.client_id);
  const tabs: [string, string, string][] = [["mine", "Mis tareas", "My tasks"], ["assigned", "Asignadas por mí", "Assigned by me"], ["overdue", "Vencidas", "Overdue"], ["all", "Todas abiertas", "All open"], ["done", "Cerradas", "Closed"]];
  const isOverdue = (t: Task) => OPEN.includes(t.status) && t.due_at !== null && t.due_at < now;
  const taskHref = (task?: string, pageNumber = page, viewName = view) => taskLink({
    view: viewName, page: pageNumber,
    client: client && UUID_RE.test(client) ? client : null,
    workOrder: workOrder && UUID_RE.test(workOrder) ? workOrder : null,
    task,
  });
  const taskContextFields = <>
    <input type="hidden" name="view" value={view} />
    <input type="hidden" name="page" value={page} />
    <input type="hidden" name="client" value={client && UUID_RE.test(client) ? client : ""} />
    <input type="hidden" name="work_order" value={workOrder && UUID_RE.test(workOrder) ? workOrder : ""} />
  </>;
  const statusForm = (t: Task, ret?: string) => <form action={updateTask} className={s.inline}>{taskContextFields}
    <input type="hidden" name="task_id" value={t.id} /><input type="hidden" name="version" value={t.version} />{ret && <input type="hidden" name="return" value={ret} />}
    <label className={s.srOnly} htmlFor={`ts-${t.id}${ret ?? ""}`}>{pick(lang, "Estado", "Status")}</label>
    <select id={`ts-${t.id}${ret ?? ""}`} name="status" defaultValue={t.status}>{TASK_STATUSES.map(x => <option key={x} value={x}>{label(lang, x)}</option>)}</select>
    <label className={s.srOnly} htmlFor={`ta-${t.id}${ret ?? ""}`}>{pick(lang, "Responsable", "Assignee")}</label>
    <select id={`ta-${t.id}${ret ?? ""}`} name="assignee_id" defaultValue={t.assignee_id}>{ownerList.map(o => <option key={o.user_id} value={o.user_id}>{o.email.split("@")[0]}</option>)}</select>
    <button className={s.button}>{pick(lang, "Guardar", "Save")}</button></form>;

  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} active="tasks" crm="tasks" eyebrow="CRM / Tareas" title={pick(lang, "Tareas internas", "Internal tasks")}
      lead={pick(lang, "Asigna trabajo entre Miguel y Samuel, sigue el progreso de cada proyecto y revisa lo vencido. Todo se guarda y queda en el historial.", "Assign work between Miguel and Samuel, follow each project's progress and review what's overdue. Everything persists with history.")} />
    <OkFlash lang={lang} code={q(p, "ok")} /><ErrorFlash lang={lang} code={q(p, "error")} />
    {detail?.data && <section className={s.panel} aria-labelledby="task-detail"><header><h2 id="task-detail">{detail.data.title}</h2><Link href={taskHref()}>{pick(lang, "Cerrar", "Close")}</Link></header>
      <div className={s.columns}><div>
        <dl className={s.detail}>
          <dt>{pick(lang, "Estado", "Status")}</dt><dd><Tag lang={lang} value={detail.data.status} /> <Tag lang={lang} value={detail.data.priority} /></dd>
          <dt>{pick(lang, "Responsable", "Assignee")}</dt><dd>{ownerName(ownerList, detail.data.assignee_id)}</dd>
          <dt>{pick(lang, "Creada por", "Created by")}</dt><dd>{ownerName(ownerList, detail.data.created_by)} · {formatDate(lang, detail.data.created_at, true)}</dd>
          <dt>{pick(lang, "Vence", "Due")}</dt><dd>{detail.data.due_at ? formatDate(lang, detail.data.due_at, true) : "—"}</dd>
          <dt>{pick(lang, "Cliente", "Client")}</dt><dd>{detail.data.client_id ? <Link href={`/admin/workspace/crm/clients/${detail.data.client_id}`}>{detail.data.crm_clients?.legal_name}</Link> : "—"}</dd>
          <dt>{pick(lang, "Proyecto", "Project")}</dt><dd>{detail.data.project_id ? <Link href={`/admin/workspace/products/${detail.data.project_id}`}>{pick(lang, "Abrir proyecto", "Open project")}</Link> : "—"}</dd>
          <dt>{pick(lang, "Venta", "Sale")}</dt><dd>{detail.data.sale_id ? <Link href={`/admin/workspace/crm/sales/${detail.data.sale_id}`}>{pick(lang, "Abrir venta", "Open sale")}</Link> : "—"}</dd>
        </dl>
        {detail.data.description && <p className={s.muted} style={{ whiteSpace: "pre-wrap" }}>{detail.data.description}</p>}
        <div style={{ marginTop: 12 }}>{statusForm(detail.data, "detail")}</div>
        <h3>{pick(lang, "Comentarios", "Comments")}</h3>
        {comments?.error ? <Unavailable lang={lang} code={comments.error} /> : <ul className={s.list}>{(comments?.data ?? []).map(c => <li key={c.id}><span style={{ whiteSpace: "pre-wrap" }}>{c.body}</span><small className={s.muted}>{ownerName(ownerList, c.created_by)} · {formatDate(lang, c.created_at, true)}</small></li>)}</ul>}
        <form action={commentTask} className={s.form} style={{ marginTop: 10 }}>{taskContextFields}<input type="hidden" name="task_id" value={detail.data.id} />
          <label className={s.field}>{pick(lang, "Añadir comentario", "Add comment")}<textarea name="body" required maxLength={4000} rows={3} /></label>
          <button className={s.button}>{pick(lang, "Comentar", "Comment")}</button></form>
      </div><div>
        <h3>{pick(lang, "Historial", "History")}</h3>
        {history?.error ? <Unavailable lang={lang} code={history.error} /> : <ol className={s.timeline}>{(history?.data ?? []).map(h => <li key={h.id}><strong>{h.event_type}</strong><div className={s.muted}>{h.from_state && h.to_state ? `${label(lang, h.from_state)} → ${label(lang, h.to_state)} · ` : ""}{ownerName(ownerList, h.actor_id)} · {formatDate(lang, h.created_at, true)}</div></li>)}</ol>}
        {detail.data.source === "template" && <p className={s.muted}>{pick(lang, "Creada automáticamente desde la plantilla del servicio vendido.", "Created automatically from the sold service's template.")}</p>}
      </div></div>
    </section>}

    <div className={s.columns}>
      <section className={s.panel} aria-labelledby="task-list"><header><h2 id="task-list">{pick(lang, "Trabajo", "Work")}</h2>
        <nav className={s.subnav} aria-label={pick(lang, "Vistas de tareas", "Task views")}>{tabs.map(([k, es, en]) => <Link key={k} href={taskHref(undefined, 0, k)} aria-current={view === k ? "page" : undefined}>{pick(lang, es, en)}</Link>)}</nav></header>
        {(client || workOrder) && <p className={s.muted}>{pick(lang, "Filtro activo.", "Filter active.")} <Link href={`?view=${view}`}>{pick(lang, "Quitar filtro", "Clear filter")}</Link></p>}
        {tasks.error ? <Unavailable lang={lang} code={tasks.error} /> : tasks.data.length === 0 ? <p className={s.empty}>{pick(lang, "No hay tareas en esta vista.", "No tasks in this view.")}</p> :
        <ul className={s.list}>{tasks.data.map(t => <li key={t.id} className={s.notice} data-severity={isOverdue(t) || t.status === "blocked" ? "urgent" : "normal"}>
          <div className={s.actions} style={{ justifyContent: "space-between" }}><Link href={taskHref(t.id)}><strong>{t.title}</strong></Link><span className={s.inline}><Tag lang={lang} value={t.priority} /><Tag lang={lang} value={t.status} />{isOverdue(t) && <span className={s.tag} data-tone="danger">{pick(lang, "Vencida", "Overdue")}</span>}</span></div>
          <span className={s.muted}>{[t.crm_clients?.legal_name, t.crm_departments?.label, t.due_at ? `${pick(lang, "vence", "due")} ${formatDate(lang, t.due_at, true)}` : null, `${pick(lang, "resp.", "owner")} ${ownerName(ownerList, t.assignee_id)}`].filter(Boolean).join(" · ")}</span>
          {statusForm(t)}
        </li>)}</ul>}
        <div className={s.actions} style={{ marginTop: 12 }}>{page > 0 && <Link className={s.button} href={taskHref(undefined, page - 1)}>{pick(lang, "Anterior", "Previous")}</Link>}{(page + 1) * PAGE < (tasks.count ?? 0) && <Link className={s.button} href={taskHref(undefined, page + 1)}>{pick(lang, "Siguiente", "Next")}</Link>}</div>
      </section>
      <section className={s.panel} aria-labelledby="new-task"><h2 id="new-task">{pick(lang, "Nueva tarea", "New task")}</h2>
        {workOrder && (orderContext?.error
          ? <Unavailable lang={lang} code={orderContext.error} />
          : activeOrder
            ? <p className={s.muted}>{pick(lang, "La tarea quedará vinculada a la orden, venta y cliente. Ver", "The task will be linked to the work order, sale and client. View")} <Link href={`/admin/workspace/crm/sales/${activeOrder.sale_id}`}>{pick(lang, "venta", "sale")}</Link> · <Link href={`/admin/workspace/crm/clients/${activeOrder.client_id}`}>{pick(lang, "cliente", "client")}</Link>{activeOrder.project_id && <> · <Link href={`/admin/workspace/products/${activeOrder.project_id}`}>{pick(lang, "proyecto", "project")}</Link></>}.</p>
            : <p className={s.muted}>{pick(lang, "La orden de trabajo no está disponible. Quita el filtro para crear una tarea sin orden.", "Work order unavailable. Clear the filter to create a task without an order.")}</p>)}
        {mismatchedClient && <p className={s.muted}>{pick(lang, "El filtro de cliente no corresponde a esta orden.", "The client filter does not match this order.")} <Link href={taskLink({ view, page: 0, workOrder: activeOrder?.id })}>{pick(lang, "Quitar solo filtro de cliente", "Clear client filter only")}</Link></p>}
        <form action={createTask} className={s.form}>{taskContextFields}<TzOffset />
          <label className={s.field}>{pick(lang, "Título *", "Title *")}<input name="title" required maxLength={200} /></label>
          <label className={s.field}>{pick(lang, "Descripción", "Description")}<textarea name="description" maxLength={4000} rows={3} /></label>
          <div className={s.row}>
            <label className={s.field}>{pick(lang, "Responsable *", "Assignee *")}<select name="assignee_id" required defaultValue={userId}>{ownerList.map(o => <option key={o.user_id} value={o.user_id}>{o.email}</option>)}</select></label>
            <label className={s.field}>{pick(lang, "Prioridad", "Priority")}<select name="priority" defaultValue="normal">{TASK_PRIORITIES.map(x => <option key={x} value={x}>{label(lang, x)}</option>)}</select></label>
          </div>
          <div className={s.row}>
            <label className={s.field}>{pick(lang, "Vencimiento (hora local)", "Due (local time)")}<input name="due_at" type="datetime-local" /></label>
            <label className={s.field}>{pick(lang, "Departamento", "Department")}<select name="department_id" defaultValue={activeOrder?.department_id ?? ""} disabled={Boolean(activeOrder)}><option value="">—</option>{[["website", "Website Designer"], ["ecommerce", "E-commerce Designer"], ["crm_creator", "CRM Creator"], ["receptionist", "AI Receptionist"], ["marketing", "Marketing Hub"], ["sales", pick(lang, "Comercial", "Sales")]].map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          </div>
          <label className={s.field}>{pick(lang, "Cliente", "Client")}<select name="client_id" defaultValue={activeOrder?.client_id ?? (client && UUID_RE.test(client) ? client : "")} disabled={Boolean(activeOrder)}><option value="">—</option>{(clients.data ?? []).map(c => <option key={c.id} value={c.id}>{c.legal_name}</option>)}</select></label>
          <button className={`${s.button} ${s.primary}`} disabled={Boolean(workOrder && !activeOrder) || mismatchedClient}>{pick(lang, "Crear y asignar", "Create and assign")}</button>
        </form>
      </section>
    </div>
  </div></Suite>;
}
