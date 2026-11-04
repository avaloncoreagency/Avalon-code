import Link from "next/link";
import { formatDate, pick, type Lang } from "@/lib/i18n";
import { label } from "@/lib/sales/domain";
import { OPEN_TASK_STATUSES, type ProjectContext } from "@/lib/os/project-context";
import s from "./client-hud.module.css";

/** Shared spine shown inside every module project: client 360°, sale, work order and tasks (read-only links). */
export function ProjectContextPanel({ lang, context, owners }: { lang: Lang; context: ProjectContext | null; owners: { user_id: string; email: string }[] }) {
  if (!context) return null;
  const { client, order, tasks } = context;
  const name = (id: string) => { const o = owners.find(x => x.user_id === id); return o ? o.email.split("@")[0] || o.email : id.slice(0, 8); };
  const openTasks = tasks.filter(t => OPEN_TASK_STATUSES.includes(t.status));
  const now = Date.now();
  return (
    <section className={s.panel} aria-labelledby="commercial-context" data-testid="project-context">
      <h2 id="commercial-context">{pick(lang, "Contexto comercial", "Commercial context")}</h2>
      {!client && !order && tasks.length === 0 ? (
        <p className={s.muted}>{pick(lang,
          "Este proyecto se creó a mano: no tiene cliente, venta ni orden de trabajo asociadas. Los proyectos que nacen de una venta aparecen aquí con todo su contexto.",
          "This project was created manually: it has no client, sale or work order. Projects that come from a sale show their full context here.")}</p>
      ) : (
        <>
          <dl className={s.detail}>
            <dt>{pick(lang, "Cliente 360°", "Client 360°")}</dt>
            <dd>{client ? <Link href={`/admin/workspace/crm/clients/${client.id}`}>{client.legal_name} · {client.client_code}</Link> : pick(lang, "Sin cliente vinculado", "No linked client")}</dd>
            <dt>{pick(lang, "Venta", "Sale")}</dt>
            <dd>{order ? <Link href={`/admin/workspace/crm/sales/${order.sale_id}`}>{order.sale_number ?? order.sale_id.slice(0, 8)}</Link> : "—"}</dd>
            <dt>{pick(lang, "Orden de trabajo", "Work order")}</dt>
            <dd>{order
              ? <>{label(lang, order.status)} · {pick(lang, "entrega", "delivery")} {order.due_on ? formatDate(lang, order.due_on) : "—"} · {pick(lang, "responsable", "owner")} {name(order.assignee_id)}</>
              : "—"}</dd>
            <dt>{pick(lang, "Tareas", "Tasks")}</dt>
            <dd>{context.open} {pick(lang, "abiertas", "open")} · {context.overdue} {pick(lang, "vencidas", "overdue")} · {context.closed} {pick(lang, "hechas", "done")}</dd>
          </dl>
          {openTasks.length > 0 && (
            <ul className={s.list}>
              {openTasks.slice(0, 8).map(t => (
                <li key={t.id}>
                  <Link href={`/admin/workspace/crm/tasks?task=${t.id}`}>{t.title}</Link>{" "}
                  <span className={s.muted}>
                    {label(lang, t.status)}{t.due_at ? ` · ${pick(lang, "vence", "due")} ${formatDate(lang, t.due_at, true)}${Date.parse(t.due_at) < now ? ` · ${pick(lang, "vencida", "overdue")}` : ""}` : ""} · {name(t.assignee_id)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {order && (
            <p><Link className={s.button} href={`/admin/workspace/crm/tasks?work_order=${order.id}&view=all`}>{pick(lang, "Ver y crear tareas de esta orden", "View and create tasks for this order")}</Link></p>
          )}
        </>
      )}
    </section>
  );
}
