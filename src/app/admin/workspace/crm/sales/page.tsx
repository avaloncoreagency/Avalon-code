import { loadOwnerDirectory } from "@/lib/identity/directory";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, OkFlash, ErrorFlash, Tag, Unavailable, ownerName, q, UUID_RE, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import { money } from "@/lib/sales/domain";
import s from "@/components/sales/sales.module.css";
export const dynamic = "force-dynamic";

type Metric = { currency: string; sales: number; contracted: string; collected: string; recurring_monthly: string; upfront_agreed: string };
type SaleRow = { id: string; sale_number: string; sold_on: string; currency: string; total: string; recurring_monthly: string; contract_status: string; delivery_status: string; seller_id: string; crm_clients: { id: string; legal_name: string } | null; crm_sale_lines: { id: string }[] };
const PAGE = 25;

export default async function SalesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const p = await searchParams;
  const page = Math.min(Number(/^\d{1,4}$/.test(q(p, "page") ?? "") ? q(p, "page") : 0), 2000);
  const requestedClientId = q(p, "client");
  const clientId = requestedClientId && UUID_RE.test(requestedClientId) ? requestedClientId : null;
  if (requestedClientId && !clientId) notFound();
  // Filtering happens in PostgreSQL before pagination, never in browser-visible rows.
  const scopedSales = supabase.from("crm_sales")
    .select("id,sale_number,sold_on,currency,total,recurring_monthly,contract_status,delivery_status,seller_id,crm_clients(id,legal_name),crm_sale_lines(id)", { count: "exact" })
    .order("sold_on", { ascending: false }).order("created_at", { ascending: false });
  const salesQuery = clientId ? scopedSales.eq("client_id", clientId) : scopedSales;
  const [metrics, sales, owners, openOrders, overdue, filteredClient] = await Promise.all([
    clientId ? Promise.resolve({ data: [] as Metric[], error: null, count: 0 } as const) : run<Metric[]>(supabase.rpc("crm_sales_metrics")),
    run<SaleRow[]>(salesQuery.range(page * PAGE, page * PAGE + PAGE - 1)),
    run<{ user_id: string; email: string }[]>(loadOwnerDirectory(supabase)),
    run<null>(supabase.from("crm_work_orders").select("id", { count: "exact" }).in("status", ["open", "in_progress", "blocked"]).range(0, 0)),
    run<null>(supabase.from("crm_tasks").select("id", { count: "exact" }).in("status", ["todo", "in_progress", "blocked"]).lt("due_at", new Date().toISOString()).range(0, 0)),
    clientId ? run<{ id: string; legal_name: string } | null>(supabase.from("crm_clients").select("id,legal_name").eq("id", clientId).maybeSingle()) : Promise.resolve({ data: null, error: null, count: null } as const),
  ]);
  if (clientId && !filteredClient.error && !filteredClient.data) notFound();
  const ownerList = owners.data ?? [];
  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} active="sales" crm="sales" eyebrow="CRM / Ventas" title={pick(lang, "Ventas y entregas", "Sales and delivery")}
      lead={pick(lang, "Ingresos contratados frente a dinero cobrado, órdenes de trabajo abiertas y cada venta con su estado de contrato y entrega.", "Contracted revenue versus money collected, open work orders and every sale with its contract and delivery status.")}
      actions={<><Link className={`${s.button} ${s.primary}`} href="/admin/workspace/crm/sales/new">{pick(lang, "+ Registrar venta", "+ Record sale")}</Link><Link className={s.button} href="/admin/workspace/crm/quotes">{pick(lang, "Cotizaciones", "Quotes")}</Link><Link className={s.button} href="/admin/workspace/crm/leads">{pick(lang, "Ver pipeline", "View pipeline")}</Link></>} />
    <OkFlash lang={lang} code={q(p, "ok")} /><ErrorFlash lang={lang} code={q(p, "error")} />
    {clientId && <section className={s.panel} aria-label={pick(lang, "Filtro de cliente", "Client filter")}>
      {filteredClient.error ? <Unavailable lang={lang} code={filteredClient.error} /> : <p>
        {pick(lang, "Mostrando únicamente ventas vinculadas a", "Showing only sales linked to")}{" "}
        <Link href={`/admin/workspace/crm/clients/${clientId}`}><strong>{filteredClient.data?.legal_name}</strong></Link>
        {" · "}{sales.error ? "—" : (sales.count ?? 0)} {pick(lang, "venta(s) registrada(s)", "recorded sale(s)")}
        {" · "}<Link href="/admin/workspace/crm/sales">{pick(lang, "Ver todas las ventas", "View all sales")}</Link>
      </p>}
    </section>}
    {!clientId && (metrics.error ? <Unavailable lang={lang} code={metrics.error} /> : <section className={s.stats} aria-label={pick(lang, "Métricas comerciales globales", "Agency-wide commercial metrics")}>
      {metrics.data.length === 0 && <div className={s.stat}><span>{pick(lang, "Ingresos contratados", "Contracted revenue")}</span><strong>{money(lang, 0)}</strong><small>{pick(lang, "Sin ventas confirmadas", "No confirmed sales")}</small></div>}
      {metrics.data.map(m => <div key={m.currency} style={{ display: "contents" }}>
        <div className={s.stat}><span>{pick(lang, "Ingresos contratados", "Contracted revenue")} · {m.currency}</span><strong>{money(lang, m.contracted, m.currency)}</strong><small>{m.sales} {pick(lang, "venta(s)", "sale(s)")}</small></div>
        <div className={s.stat}><span>{pick(lang, "Cobrado (registrado)", "Collected (recorded)")}</span><strong>{money(lang, m.collected, m.currency)}</strong><small>{pick(lang, "Pendiente", "Outstanding")}: {money(lang, Number(m.contracted) - Number(m.collected), m.currency)}</small></div>
        <div className={s.stat}><span>{pick(lang, "Recurrente contratado / mes", "Contracted recurring / mo")}</span><strong>{money(lang, m.recurring_monthly, m.currency)}</strong><small>{pick(lang, "Pago inicial acordado", "Agreed upfront")}: {money(lang, m.upfront_agreed, m.currency)}</small></div>
      </div>)}
      <div className={s.stat}><span>{pick(lang, "Órdenes de trabajo abiertas", "Open work orders")}</span><strong>{openOrders.error ? "—" : openOrders.count}</strong></div>
      <div className={s.stat}><span>{pick(lang, "Tareas vencidas", "Overdue tasks")}</span><strong>{overdue.error ? "—" : overdue.count}</strong><small><Link href="/admin/workspace/crm/tasks?view=overdue">{pick(lang, "Revisar", "Review")}</Link></small></div>
    </section>)}
    <section className={s.panel} aria-labelledby="sales-list"><header><h2 id="sales-list">{pick(lang, "Ventas registradas", "Recorded sales")}</h2></header>
      {sales.error ? <Unavailable lang={lang} code={sales.error} /> : sales.data.length === 0 ? <p className={s.empty}>{pick(lang, "Todavía no hay ventas. Registra la primera para generar proyectos y tareas.", "No sales yet. Record the first one to generate projects and tasks.")}</p> :
      <div className={s.tableWrap}><table className={s.table} data-mobile-cards><thead><tr>
        <th>{pick(lang, "Venta", "Sale")}</th><th>{pick(lang, "Cliente", "Client")}</th><th>{pick(lang, "Fecha", "Date")}</th><th className={s.num}>Total</th><th>{pick(lang, "Servicios", "Services")}</th><th>{pick(lang, "Contrato", "Contract")}</th><th>{pick(lang, "Entrega", "Delivery")}</th><th>{pick(lang, "Vendedor", "Seller")}</th>
      </tr></thead><tbody>{sales.data.map(r => <tr key={r.id}>
        <td data-label={pick(lang, "Venta", "Sale")}><Link href={`/admin/workspace/crm/sales/${r.id}`}>{r.sale_number}</Link></td>
        <td data-label={pick(lang, "Cliente", "Client")}>{r.crm_clients ? <Link href={`/admin/workspace/crm/clients/${r.crm_clients.id}`}>{r.crm_clients.legal_name}</Link> : "—"}</td>
        <td data-label={pick(lang, "Fecha", "Date")}>{formatDate(lang, r.sold_on)}</td><td data-label="Total" className={s.num}>{money(lang, r.total, r.currency)}</td><td data-label={pick(lang, "Servicios", "Services")}>{r.crm_sale_lines.length}</td>
        <td data-label={pick(lang, "Contrato", "Contract")}><Tag lang={lang} value={r.contract_status} /></td><td data-label={pick(lang, "Entrega", "Delivery")}><Tag lang={lang} value={r.delivery_status} /></td><td data-label={pick(lang, "Vendedor", "Seller")}>{ownerName(ownerList, r.seller_id)}</td>
      </tr>)}</tbody></table></div>}
      <div className={s.actions} style={{ marginTop: 12 }}>{page > 0 && <Link className={s.button} href={`?${new URLSearchParams({ ...(clientId ? { client: clientId } : {}), page: String(page - 1) })}`}>{pick(lang, "Anterior", "Previous")}</Link>}{(page + 1) * PAGE < (sales.count ?? 0) && <Link className={s.button} href={`?${new URLSearchParams({ ...(clientId ? { client: clientId } : {}), page: String(page + 1) })}`}>{pick(lang, "Siguiente", "Next")}</Link>}</div>
    </section>
  </div></Suite>;
}
