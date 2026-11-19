import Link from "next/link";
import { dayInZone } from "@/lib/crm/shared-calendar";
import type { SupabaseClient } from "@supabase/supabase-js";
import { run, countRows } from "@/lib/os/data";
import { AVALON_TIME_ZONE, pick, formatDate, type Lang } from "@/lib/i18n";
import { money } from "@/lib/sales/domain";
import s from "@/components/sales/sales.module.css";
import styles from "./command-summary.module.css";

type SalesMetric = { currency: string; sales: number; contracted: string; collected: string };
type Meeting = { id: string; title: string; starts_at: string; client_id: string | null; lead_id: string | null };

/** Read-only projection of existing owner-scoped contracts; no alternate business totals. */
export function loadCommandSummary(supabase: SupabaseClient) {
  return Promise.all([
    run<SalesMetric[]>(supabase.rpc("crm_sales_metrics")),
    countRows(supabase, "crm_prospects", [["eq", "status", "pending"]]),
    countRows(supabase, "crm_tasks", [["not_in", "status", ["done", "cancelled"]], ["lt", "due_at", new Date().toISOString()]]),
    countRows(supabase, "os_projects", [["eq", "status", "active"]]),
    run<Meeting[]>(supabase.from("crm_events").select("id,title,starts_at,client_id,lead_id")
      .eq("status", "scheduled").gte("starts_at", new Date().toISOString()).order("starts_at").limit(3)),
  ]);
}

export async function CommandSummary({ supabase, lang, data }: { supabase: SupabaseClient; lang: Lang; data?: Awaited<ReturnType<typeof loadCommandSummary>> }) {
  const [sales, prospects, overdue, projects, meetings] = data ?? await loadCommandSummary(supabase);
  const count = (result: { count: number | null; error: unknown }) => result.error || result.count === null
    ? pick(lang, "Sin datos", "Unavailable") : String(result.count);
  return <section aria-label={pick(lang, "Centro de operaciones comercial", "Sales command center")}>
    <div className={s.actions} style={{ marginBottom: 12 }}>
      <Link className={`${s.button} ${s.primary}`} href="/admin/workspace/crm/leads#crm-create-lead">{pick(lang, "Crear lead", "Create lead")}</Link>
      <Link className={s.button} href="/admin/workspace/crm/sales/new">{pick(lang, "+ Registrar venta", "+ Record sale")}</Link>
      <Link className={s.button} href="/admin/workspace/crm/clients">{pick(lang, "Abrir Clientes 360°", "Open Clients 360°")}</Link>
    </div>
    <div className={styles.metrics}>
      <Link className={`${s.stat} ${styles.metric}`} href="/admin/workspace/crm/hunter"><span>{pick(lang, "Prospectos por revisar", "Prospects awaiting review")}</span><strong>{count(prospects)}</strong></Link>
      <Link className={`${s.stat} ${styles.metric}`} href="/admin/workspace/crm/tasks?view=overdue"><span>{pick(lang, "Tareas vencidas", "Overdue tasks")}</span><strong>{count(overdue)}</strong></Link>
      <div className={`${s.stat} ${styles.metric}`}><span>{pick(lang, "Proyectos marcados activos¹", "Projects marked active¹")}</span><strong>{count(projects)}</strong></div>
      {sales.error ? <div className={`${s.stat} ${styles.metric}`} role="status"><span>{pick(lang, "Ventas y cobros", "Sales and collections")}</span><strong>{pick(lang, "Sin datos", "Unavailable")}</strong></div>
        : sales.data.length === 0 ? <div className={`${s.stat} ${styles.metric}`}><span>{pick(lang, "Ventas contratadas", "Contracted sales")}</span><strong>0</strong><small>{pick(lang, "Sin ventas confirmadas registradas", "No recorded confirmed sales")}</small></div>
        : sales.data.map(row => <div key={row.currency} className={`${s.stat} ${styles.metric}`}>
          <span>{pick(lang, "Contratado", "Contracted")} · {row.currency}</span><strong>{money(lang, row.contracted, row.currency)}</strong>
          <small>{row.sales} {pick(lang, "ventas confirmadas", "confirmed sales")}</small>
          <span>{pick(lang, "Cobrado (registrado)", "Collected (recorded)")}</span><strong>{money(lang, row.collected, row.currency)}</strong>
        </div>)}
    </div>
    <p className={s.muted}>{pick(lang, "¹Estado interno guardado en Avalon; no acredita disponibilidad del proveedor. Cada moneda se muestra por separado.", "¹Saved internal Avalon state; not proof of provider availability. Each currency is shown separately.")}</p>
    <details className={styles.meetings}><summary>{pick(lang, "Próximas reuniones · hasta 3", "Upcoming meetings · up to 3")}</summary>
    {meetings.error ? <p role="status">{pick(lang, "No se pudieron consultar las reuniones.", "Meetings could not be loaded.")}</p>
      : meetings.data.length === 0 ? <p className={s.muted}>{pick(lang, "Sin reuniones próximas registradas.", "No upcoming meetings recorded.")}</p>
      : <ul className={s.list}>{meetings.data.map(meeting => <li key={meeting.id}>
        <Link href={`/admin/workspace/crm/calendar?date=${formatCalendarDay(meeting.starts_at)}`}>{meeting.title}</Link>
        {" · "}{formatDate(lang, meeting.starts_at, true)}
        {meeting.client_id ? <> · <Link href={`/admin/workspace/crm/clients/${meeting.client_id}`}>{pick(lang, "Cliente", "Client")}</Link></>
          : meeting.lead_id ? <> · <Link href={`/admin/workspace/crm/lead/${meeting.lead_id}`}>Lead</Link></> : null}
      </li>)}</ul>}
    </details>
  </section>;
}

const formatCalendarDay = (timestamp: string) => dayInZone(timestamp, AVALON_TIME_ZONE);
