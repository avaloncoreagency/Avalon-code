import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { CrmOverview } from "@/components/crm/overview";
import { OpsLinks } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick } from "@/lib/i18n";
import { run, countRows } from "@/lib/os/data";
import { money } from "@/lib/sales/domain";
import s from "@/components/sales/sales.module.css";
export const dynamic = "force-dynamic";

type Metric = { currency: string; sales: number; contracted: string; collected: string; recurring_monthly: string };

/** CRM home: Samuel's commercial overview plus the operations layer (sales → clients → projects → tasks). */
export default async function CrmPage() {
  const { supabase, userId } = await requireOwner();
  const lang = await getLang();
  const now = new Date().toISOString();
  const [metrics, clients, orders, myTasks, overdue, unread] = await Promise.all([
    run<Metric[]>(supabase.rpc("crm_sales_metrics")),
    countRows(supabase, "crm_clients", [["eq", "status", "active"]]),
    countRows(supabase, "crm_work_orders", [["not_in", "status", ["delivered", "cancelled"]]]),
    countRows(supabase, "crm_tasks", [["eq", "assignee_id", userId], ["not_in", "status", ["done", "cancelled"]]]),
    countRows(supabase, "crm_tasks", [["not_in", "status", ["done", "cancelled"]], ["lt", "due_at", now]]),
    countRows(supabase, "crm_notifications", [["eq", "recipient_id", userId], ["eq", "severity", "urgent"], ["is_null", "read_at"]]),
  ]);
  const ready = metrics.error === null;
  const m = metrics.data?.find(x => x.currency === "USD") ?? metrics.data?.[0];
  const n = (v: number | null) => (v === null ? "—" : String(v));
  return (
    <Suite active="crm">
      <CrmOverview />
      <section className={s.hud} aria-labelledby="crm-ops" style={{ marginTop: 18 }}>
        <header className={s.header}>
          <div><p className={s.eyebrow}>{pick(lang, "Operaciones comerciales", "Commercial operations")}</p>
            <h2 id="crm-ops" style={{ margin: "6px 0" }}>{pick(lang, "Ventas, clientes, proyectos y tareas", "Sales, clients, projects and tasks")}</h2>
            <p className={s.lead}>{pick(lang, "Cifras calculadas solo con registros guardados. Lo contratado nunca se cuenta como cobrado.", "Figures from stored records only. Contracted is never counted as collected.")}</p></div>
          <div className={s.actions}>
            <Link className={`${s.button} ${s.primary}`} href="/admin/workspace/crm/sales/new">{pick(lang, "+ Registrar venta", "+ Record sale")}</Link>
            <Link className={s.button} href="/admin/workspace/crm/leads">{pick(lang, "+ Nuevo lead", "+ New lead")}</Link>
            <Link className={s.button} href="/admin/workspace/crm/tasks#new-task">{pick(lang, "+ Nueva tarea", "+ New task")}</Link>
          </div>
        </header>
        <OpsLinks lang={lang} />
        {!ready && <p className={s.flash} data-tone="warn" role="status">{pick(lang, "La migración de ventas (20261102170000) no está aplicada en este entorno: las cifras de ventas no están disponibles.", "The sales migration (20261102170000) is not applied in this environment: sales figures are unavailable.")}</p>}
        <div className={s.stats}>
          <Link className={s.stat} href="/admin/workspace/crm/sales"><span>{pick(lang, "Ingresos contratados", "Contracted revenue")}</span><strong>{ready ? money(lang, m?.contracted ?? 0, m?.currency ?? "USD") : "—"}</strong><small>{ready ? `${pick(lang, "Cobrado", "Collected")} ${money(lang, m?.collected ?? 0, m?.currency ?? "USD")}` : ""}</small></Link>
          <Link className={s.stat} href="/admin/workspace/crm/sales"><span>{pick(lang, "Recurrente / mes", "Recurring / mo")}</span><strong>{ready ? money(lang, m?.recurring_monthly ?? 0, m?.currency ?? "USD") : "—"}</strong><small>{ready ? `${m?.sales ?? 0} ${pick(lang, "venta(s)", "sale(s)")}` : ""}</small></Link>
          <Link className={s.stat} href="/admin/workspace/crm/clients"><span>{pick(lang, "Clientes activos", "Active clients")}</span><strong>{n(clients.count)}</strong></Link>
          <Link className={s.stat} href="/admin/workspace/crm/sales"><span>{pick(lang, "Órdenes de trabajo abiertas", "Open work orders")}</span><strong>{n(orders.count)}</strong></Link>
          <Link className={s.stat} href="/admin/workspace/crm/tasks?view=mine"><span>{pick(lang, "Mis tareas abiertas", "My open tasks")}</span><strong>{n(myTasks.count)}</strong><small>{pick(lang, "Vencidas (todas)", "Overdue (all)")}: {n(overdue.count)}</small></Link>
          <Link className={s.stat} href="/admin/workspace/crm/notifications"><span>{pick(lang, "Avisos urgentes sin leer", "Unread urgent notices")}</span><strong>{n(unread.count)}</strong></Link>
        </div>
      </section>
    </Suite>
  );
}
