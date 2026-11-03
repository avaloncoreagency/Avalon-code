import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, Tag, Unavailable, ownerName, q, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import { summarizeDelivery, ACTIVE_ORDER_STATUSES, type DeliveryOrder, type DeliveryTask } from "@/lib/crm/delivery-overview";
import s from "@/components/sales/sales.module.css";

export const dynamic = "force-dynamic";
const MAX_ORDERS = 100;
const MAX_TASKS = 2000;

type Order = DeliveryOrder & {
  sale_id: string; project_id: string | null; assignee_id: string;
  crm_departments: { label: string } | null;
  os_projects: { name: string } | null;
};
type Sale = {
  id: string; sale_number: string; client_id: string;
  crm_clients: { legal_name: string } | null;
};
type Owner = { user_id: string; email: string };

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const params = await searchParams;
  const view = ["active", "attention", "all", "closed"].includes(q(params, "view") ?? "") ? q(params, "view")! : "active";

  // Existing owner RLS applies to every read. Nothing is inserted or updated here.
  const orders = await run<Order[]>(supabase.from("crm_work_orders")
    .select("id,sale_id,project_id,assignee_id,status,due_on,crm_departments(label),os_projects(name)", { count: "exact" })
    .order("created_at", { ascending: false }).range(0, MAX_ORDERS - 1));
  const rows = orders.data ?? [];
  const orderIds = [...new Set(rows.map(o => o.id))];
  const saleIds = [...new Set(rows.map(o => o.sale_id))];
  const [sales, tasks, owners] = await Promise.all([
    saleIds.length
      ? run<Sale[]>(supabase.from("crm_sales").select("id,sale_number,client_id,crm_clients(legal_name)").in("id", saleIds))
      : Promise.resolve({ data: [] as Sale[], error: null, count: 0 }),
    orderIds.length
      ? run<DeliveryTask[]>(supabase.from("crm_tasks").select("work_order_id,status", { count: "exact" })
        .in("work_order_id", orderIds).limit(MAX_TASKS))
      : Promise.resolve({ data: [] as DeliveryTask[], error: null, count: 0 }),
    run<Owner[]>(supabase.rpc("crm_owner_directory")),
  ]);
  const failure = orders.error ?? sales.error ?? tasks.error ?? owners.error;
  const completeTasks = !tasks.error && tasks.count !== null && tasks.count === (tasks.data?.length ?? 0);
  const summary = summarizeDelivery(rows, tasks.data ?? [], new Date().toISOString().slice(0, 10));
  const overdue = new Set(summary.overdueIds);
  const attention = new Set(summary.attentionIds);
  const salesById = new Map((sales.data ?? []).map(sale => [sale.id, sale]));
  const visible = rows.filter(order => view === "all"
    || (view === "active" && (ACTIVE_ORDER_STATUSES as readonly string[]).includes(order.status))
    || (view === "attention" && attention.has(order.id))
    || (view === "closed" && ["delivered", "cancelled"].includes(order.status)));
  const limited = orders.count !== null && orders.count > rows.length;
  const views: [string, string, string][] = [
    ["active", "En curso", "Active"],
    ["attention", "Requieren atención", "Needs attention"],
    ["all", "Todas", "All"],
    ["closed", "Cerradas", "Closed"],
  ];

  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} active="sales" crm="sales" eyebrow="CRM / Operaciones"
      title={pick(lang, "Centro de entregas", "Delivery center")}
      lead={pick(lang,
        "Supervisa las ordenes de trabajo creadas por ventas, los responsables, fechas y tareas. Datos reales del CRM, sin crear registros nuevos.",
        "Monitor work orders created by sales, owners, due dates and tasks. Existing CRM data only; no new records are created.")}
      actions={<Link className={s.button} href="/admin/workspace/crm/sales">{pick(lang, "Volver a ventas", "Back to sales")}</Link>} />
    {failure ? <Unavailable lang={lang} code={failure} /> : <>
      <section className={s.stats} aria-label={pick(lang, "Resumen de entregas", "Delivery summary")}>
        <div className={s.stat}><span>{pick(lang, "Ordenes activas", "Active orders")}</span><strong>{summary.active}</strong></div>
        <div className={s.stat}><span>{pick(lang, "Bloqueadas", "Blocked")}</span><strong>{summary.blocked}</strong></div>
        <div className={s.stat}><span>{pick(lang, "Vencidas (fecha UTC)", "Overdue (UTC date)")}</span><strong>{summary.overdue}</strong></div>
        <div className={s.stat}><span>{pick(lang, "Requieren atención", "Needs attention")}</span><strong>{summary.attention}</strong><small>{pick(lang, "Bloqueadas o vencidas, sin contar dos veces.", "Blocked or overdue, counted once.")}</small></div>
        <div className={s.stat}><span>{pick(lang, "Entregadas", "Delivered")}</span><strong>{summary.delivered}</strong></div>
      </section>
      <section className={s.panel} aria-labelledby="delivery-list">
        <header>
          <h2 id="delivery-list">{pick(lang, "Ordenes de trabajo", "Work orders")}</h2>
          <nav className={s.subnav} aria-label={pick(lang, "Filtrar entregas", "Filter deliveries")}>
            {views.map(([key, es, en]) => <Link key={key} href={"/admin/workspace/crm/deliveries?view=" + key}
              aria-current={view === key ? "page" : undefined}>{pick(lang, es, en)}</Link>)}
          </nav>
        </header>
        <p className={s.muted}>
          {pick(lang, "Mostrando las ultimas", "Showing the latest")} {rows.length}
          {orders.count !== null ? " / " + orders.count : ""} {pick(lang, "ordenes.", "orders.")}
          {limited && " " + pick(lang, "Los indicadores se limitan a este grupo; consulta Ventas para el historial completo.",
            "Indicators cover only this subset; see Sales for the full history.")}
          {!completeTasks && " " + pick(lang, "El conteo de tareas es incompleto y se omite.",
            "Task counts are incomplete and have been hidden.")}
        </p>
        {visible.length === 0 ? <p className={s.muted}>{pick(lang, "No hay ordenes en esta vista.", "No orders in this view.")}</p> :
          <div className={s.tableWrap}><table className={s.table}>
            <thead><tr>
              <th>{pick(lang, "Venta / cliente", "Sale / client")}</th>
              <th>{pick(lang, "Proyecto", "Project")}</th>
              <th>{pick(lang, "Responsable", "Owner")}</th>
              <th>{pick(lang, "Vence", "Due")}</th>
              <th>{pick(lang, "Tareas", "Tasks")}</th>
              <th>{pick(lang, "Estado", "Status")}</th>
            </tr></thead>
            <tbody>{visible.map(order => {
              const sale = salesById.get(order.sale_id);
              const progress = summary.progress[order.id];
              return <tr key={order.id}>
                <td><Link href={"/admin/workspace/crm/sales/" + order.sale_id}>
                  {sale?.sale_number ?? pick(lang, "Ver venta", "View sale")}</Link>
                  <br /><span className={s.muted}>{sale?.crm_clients?.legal_name ?? "—"}</span></td>
                <td>{order.crm_departments?.label ?? "—"}<br />
                  {order.project_id
                    ? <Link href={"/admin/workspace/products/" + order.project_id}>{order.os_projects?.name ?? pick(lang, "Ver proyecto", "View project")}</Link>
                    : <span className={s.muted}>{pick(lang, "Sin proyecto vinculado", "No linked project")}</span>}</td>
                <td>{ownerName(owners.data ?? [], order.assignee_id)}</td>
                <td>{order.due_on ? formatDate(lang, order.due_on) : "—"}</td>
                <td><Link href={"/admin/workspace/crm/tasks?work_order=" + order.id}>
                  {completeTasks && progress?.total ? progress.done + "/" + progress.total : "—"}
                </Link></td>
                <td><Tag lang={lang} value={order.status} />
                  {overdue.has(order.id) && <> <span className={s.tag} data-tone="danger">{pick(lang, "Vencida", "Overdue")}</span></>}</td>
              </tr>;
            })}</tbody>
          </table></div>}
      </section>
    </>}
  </div></Suite>;
}
