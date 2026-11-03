import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, OkFlash, ErrorFlash, Tag, Unavailable, ownerName, q, UUID_RE, type Query } from "@/components/sales/ui";
import { TaskEditForm } from "@/components/sales/task-edit-form";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import { transitionTask } from "./actions";
import s from "@/components/sales/sales.module.css";

export const dynamic = "force-dynamic";
type Task = {
  id: string; title: string; description: string; assignee_id: string; created_by: string;
  priority: string; status: string; due_at: string | null; completed_at: string | null;
  version: number; created_at: string; updated_at: string;
};
const FIELDS = "id,title,description,assignee_id,created_by,priority,status,due_at,completed_at,version,created_at,updated_at";
const OPEN = ["todo", "in_progress", "blocked"];
const VIEWS = ["mine", "assigned", "open", "done", "archived"] as const;
const PAGE_SIZE = 50;

export default async function TaskCenterPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { supabase, userId } = await requireOwner();
  const lang = await getLang();
  const params = await searchParams;
  const requestedView = q(params, "view") || "mine";
  const view = (VIEWS as readonly string[]).includes(requestedView) ? requestedView : "mine";
  const taskId = q(params, "task");
  const pageText = q(params, "page") || "0";
  const page = /^\d{1,4}$/.test(pageText) ? Math.min(Number(pageText), 2000) : 0;
  let query = supabase.from("crm_tasks").select(FIELDS, { count: "exact" });
  if (view === "mine") query = query.eq("assignee_id", userId).in("status", OPEN);
  if (view === "assigned") query = query.eq("created_by", userId).neq("assignee_id", userId).in("status", OPEN);
  if (view === "open") query = query.in("status", OPEN);
  if (view === "done") query = query.eq("status", "done");
  if (view === "archived") query = query.eq("status", "cancelled");
  const ordering = view === "done" ? "completed_at" : "created_at";
  const [tasks, owners, detail] = await Promise.all([
    run<Task[]>(query.order(ordering, { ascending: false, nullsFirst: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)),
    run<{ user_id: string; email: string }[]>(supabase.rpc("crm_owner_directory")),
    taskId && UUID_RE.test(taskId)
      ? run<Task | null>(supabase.from("crm_tasks").select(FIELDS).eq("id", taskId).maybeSingle())
      : Promise.resolve(null),
  ]);
  const ownerList = owners.data ?? [];
  const selected = detail?.data ?? null;
  const href = (targetView: string, targetPage = 0, id?: string) => {
    const search = new URLSearchParams({ view: targetView });
    if (targetPage) search.set("page", String(targetPage));
    if (id) search.set("task", id);
    return "/admin/workspace/crm/tasks/manage?" + search.toString();
  };
  const categories = [
    ["mine", "Mis pendientes", "My open"],
    ["assigned", "Asignadas por mí", "Assigned by me"],
    ["open", "Todas abiertas", "All open"],
    ["done", "Completadas", "Completed"],
    ["archived", "Eliminadas", "Archived"],
  ];
  const transition = (task: Task, operation: "complete" | "archive" | "reopen", es: string, en: string) =>
    <form action={transitionTask} className={s.inline}>
      <input type="hidden" name="task_id" value={task.id} />
      <input type="hidden" name="version" value={task.version} />
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="view" value={view} />
      <button type="submit" className={s.button}>{pick(lang, es, en)}</button>
    </form>;
  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} crm="tasks" active="task-manage" eyebrow="CRM / Tareas"
      title={pick(lang, "Centro de tareas", "Task Center")}
      lead={pick(lang,
        "Asigna desde Tareas. Aquí puedes editar, completar, archivar y consultar todas las completadas. Los avisos aparecen en el buzón privado del destinatario.",
        "Assign from Tasks. Edit, complete, archive and view completed history here. Notifications appear in the recipient's private inbox.")}
      actions={<Link href="/admin/workspace/crm/tasks" className={s.button}>{pick(lang, "Crear / asignar tarea", "Create / assign task")}</Link>} />
    <OkFlash lang={lang} code={q(params, "ok")} />
    <ErrorFlash lang={lang} code={q(params, "error")} />
    {owners.error && <Unavailable lang={lang} code={owners.error} />}
    <div className={s.columns}>
      <section className={s.panel} aria-labelledby="task-center-list">
        <header><h2 id="task-center-list">{pick(lang, "Tareas", "Tasks")} ({tasks.count ?? 0})</h2></header>
        <nav className={s.subnav} aria-label={pick(lang, "Filtros de tareas", "Task filters")}>
          {categories.map(([name, es, en]) => <Link key={name} href={href(name)}
            aria-current={view === name ? "page" : undefined}>{pick(lang, es, en)}</Link>)}
        </nav>
        {tasks.error ? <Unavailable lang={lang} code={tasks.error} /> :
          (tasks.data ?? []).length === 0 ? <p className={s.empty}>{pick(lang, "No hay tareas en esta vista.", "No tasks in this view.")}</p> :
          <ul className={s.list}>{(tasks.data ?? []).map(task => <li key={task.id}>
            <div className={s.actions} style={{ justifyContent: "space-between" }}>
              <Link href={href(view, page, task.id)}><strong>{task.title}</strong></Link>
              <span className={s.inline}><Tag lang={lang} value={task.priority} /><Tag lang={lang} value={task.status} /></span>
            </div>
            <p className={s.muted}>{pick(lang, "Responsable", "Assignee")}: {ownerName(ownerList, task.assignee_id)}</p>
            {task.status === "done" && <small className={s.muted}>
              {pick(lang, "Completada", "Completed")}: {task.completed_at ? formatDate(lang, task.completed_at, true) : "—"}
            </small>}
            {task.status !== "done" && task.status !== "cancelled" && task.due_at && <small className={s.muted}>
              {pick(lang, "Vence", "Due")}: {formatDate(lang, task.due_at, true)}
            </small>}
            {OPEN.includes(task.status) && transition(task, "complete", "✓ Marcar completada", "✓ Mark complete")}
            {(task.status === "done" || task.status === "cancelled") && transition(task, "reopen", "Reabrir", "Reopen")}
          </li>)}</ul>}
        <div className={s.actions} style={{ marginTop: 12 }}>
          {page > 0 && <Link href={href(view, page - 1)} className={s.button}>{pick(lang, "Anterior", "Previous")}</Link>}
          {(page + 1) * PAGE_SIZE < (tasks.count ?? 0) &&
            <Link href={href(view, page + 1)} className={s.button}>{pick(lang, "Siguiente", "Next")}</Link>}
        </div>
      </section>
      <section className={s.panel} aria-labelledby="task-center-editor">
        <header><h2 id="task-center-editor">{pick(lang, "Editar tarea", "Edit task")}</h2></header>
        {detail?.error ? <Unavailable lang={lang} code={detail.error} /> : !selected ?
          <p className={s.muted}>{pick(lang, "Selecciona una tarea de la lista para editarla.", "Select a task to edit.")}</p> :
          <>
            <p className={s.muted}>{pick(lang, "Creada por", "Created by")}: {ownerName(ownerList, selected.created_by)} · {formatDate(lang, selected.created_at, true)}</p>
            <TaskEditForm key={selected.id} task={selected} owners={ownerList} view={view} lang={lang} />
            <div className={s.actions} style={{ marginTop: 14 }}>
              {OPEN.includes(selected.status) && transition(selected, "complete", "✓ Completar", "✓ Complete")}
              {(selected.status === "done" || selected.status === "cancelled") &&
                transition(selected, "reopen", "Reabrir", "Reopen")}
              <Link href={"/admin/workspace/crm/tasks?task=" + selected.id}>
                {pick(lang, "Comentarios e historial de cambios", "Comments and change history")}
              </Link>
            </div>
            {OPEN.includes(selected.status) && <details style={{ marginTop: 18 }}>
              <summary>{pick(lang, "Eliminar tarea de las listas activas", "Remove task from active lists")}</summary>
              <p className={s.muted}>{pick(lang,
                "La eliminación es reversible: se marca como cancelada y permanece en el registro para auditoría.",
                "Removal is reversible: it is marked cancelled and kept for audit.")}</p>
              <form action={transitionTask} className={s.form}>
                <input type="hidden" name="task_id" value={selected.id} />
                <input type="hidden" name="version" value={selected.version} />
                <input type="hidden" name="view" value={view} />
                <input type="hidden" name="operation" value="archive" />
                <label className={s.field}><span>
                  <input type="checkbox" required /> {pick(lang, "Confirmo eliminar de activas", "Confirm removal from active")}
                </span></label>
                <button className={s.button} type="submit">{pick(lang, "Eliminar (archivar)", "Remove (archive)")}</button>
              </form>
            </details>}
          </>}
      </section>
    </div>
  </div></Suite>;
}
