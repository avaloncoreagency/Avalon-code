import { loadOwnerDirectory } from "@/lib/identity/directory";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, OkFlash, ErrorFlash, Tag, Unavailable, ownerName, q, UUID_RE, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { countRows, run } from "@/lib/os/data";
import { money } from "@/lib/sales/domain";
import { loadReceivables } from "@/lib/sales/schedule-server";
import { paymentStatus } from "@/lib/sales/schedule";
import { quoteCandidateQuery } from "@/lib/sales/quote-candidates";
import { issueSaleInvoice } from "./actions";
import s from "@/components/sales/sales.module.css";
import w from "@/components/quotes/quotes.module.css";
export const dynamic = "force-dynamic";

type Metric = { currency: string; sales: number; contracted: string; collected: string; recurring_monthly: string; upfront_agreed: string };
type SaleRow = { id: string; sale_number: string; sold_on: string; currency: string; total: string; recurring_monthly: string; contract_status: string; delivery_status: string; seller_id: string; crm_clients: { id: string; legal_name: string } | null; crm_sale_lines: { id: string }[] };
const PAGE = 25;
const CONTRACT_FILTERS = ["pending_signature", "signed", "cancelled"] as const;
const DELIVERY_FILTERS = ["not_started", "in_progress", "delivered", "cancelled"] as const;

export default async function SalesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const p = await searchParams;
  const page = Math.min(Number(/^\d{1,4}$/.test(q(p, "page") ?? "") ? q(p, "page") : 0), 2000);
  const contractParam = q(p, "contract");
  const deliveryParam = q(p, "delivery");
  const contract = CONTRACT_FILTERS.find(x => x === contractParam) ?? null;
  const delivery = DELIVERY_FILTERS.find(x => x === deliveryParam) ?? null;
  // Collections filter (finance access + migration 20261123150000): resolved in PostgreSQL to sale ids before paging.
  const paymentParam = q(p, "payment");
  const paymentFilter = (["overdue", "open"] as const).find(x => x === paymentParam) ?? null;
  const requestedClientId = q(p, "client");
  const clientId = requestedClientId && UUID_RE.test(requestedClientId) ? requestedClientId : null;
  if (requestedClientId && !clientId) notFound();
  // Filtering happens in PostgreSQL before pagination, never in browser-visible rows.
  const scopedSales = supabase.from("crm_sales")
    .select("id,sale_number,sold_on,currency,total,recurring_monthly,contract_status,delivery_status,seller_id,crm_clients(id,legal_name),crm_sale_lines(id)", { count: "exact" })
    .order("sold_on", { ascending: false }).order("created_at", { ascending: false }).order("id");
  let salesQuery = clientId ? scopedSales.eq("client_id", clientId) : scopedSales;
  if (contract) salesQuery = salesQuery.eq("contract_status", contract);
  if (delivery) salesQuery = salesQuery.eq("delivery_status", delivery);
  let paymentFilterUnavailable = false;
  if (paymentFilter) {
    const ids = await supabase.from("crm_sale_receivables").select("sale_id").gt(paymentFilter === "overdue" ? "overdue" : "balance", 0).limit(500);
    paymentFilterUnavailable = !!ids.error;
    const list = (ids.data ?? []).map(r => (r as { sale_id: string }).sale_id);
    salesQuery = salesQuery.in("id", list.length ? list : ["00000000-0000-0000-0000-000000000000"]);
  }
  const filterHref = (contractState: string | null, deliveryState: string | null, targetPage = 0, paymentState: string | null = paymentFilter) => {
    const params = new URLSearchParams();
    if (clientId) params.set("client", clientId);
    if (contractState) params.set("contract", contractState);
    if (deliveryState) params.set("delivery", deliveryState);
    if (paymentState) params.set("payment", paymentState);
    if (targetPage > 0) params.set("page", String(targetPage));
    const query = params.toString();
    return "/admin/workspace/crm/sales" + (query ? "?" + query : "");
  };
  const [metrics, sales, owners, openOrders, overdue, filteredClient] = await Promise.all([
    clientId ? Promise.resolve({ data: [] as Metric[], error: null, count: 0 } as const) : run<Metric[]>(supabase.rpc("crm_sales_metrics")),
    run<SaleRow[]>(salesQuery.range(page * PAGE, page * PAGE + PAGE - 1)),
    run<{ user_id: string; email: string }[]>(loadOwnerDirectory(supabase)),
    run<null>(supabase.from("crm_work_orders").select("id", { count: "exact" }).in("status", ["open", "in_progress", "blocked"]).range(0, 0)),
    run<null>(supabase.from("crm_tasks").select("id", { count: "exact" }).in("status", ["todo", "in_progress", "blocked"]).lt("due_at", new Date().toISOString()).range(0, 0)),
    clientId ? run<{ id: string; legal_name: string } | null>(supabase.from("crm_clients").select("id,legal_name").eq("id", clientId).maybeSingle()) : Promise.resolve({ data: null, error: null, count: null } as const),
  ]);
  if (clientId && !filteredClient.error && !filteredClient.data) notFound();
  const receivables = sales.error ? null : await loadReceivables(supabase, sales.data.map(r => r.id));
  // Commercial model (migration 20261123160000). Optional: before it is applied every sale renders as fixed.
  // Invoices of the listed sales (finance RLS). Same crm_invoices records the sale and Clients 360 use — no copies.
  const invoicesR = sales.error || sales.data.length === 0 ? null
    : await supabase.from("crm_invoices").select("id,sale_id,number,status,issued_on").in("sale_id", sales.data.map(r => r.id)).order("issued_on", { ascending: false });
  const invoicesOf = new Map<string, { id: string; number: string; status: string }[]>();
  for (const x of ((invoicesR?.error ? [] : invoicesR?.data) ?? []) as { id: string; sale_id: string; number: string; status: string }[])
    invoicesOf.set(x.sale_id, [...(invoicesOf.get(x.sale_id) ?? []), x]);
  const models = sales.error || sales.data.length === 0 ? null
    : await supabase.from("crm_sales").select("id,commercial_model").in("id", sales.data.map(r => r.id));
  const modelOf = new Map(((models?.error ? [] : models?.data) ?? []).map(r => [(r as { id: string }).id, (r as { commercial_model: string | null }).commercial_model]));
  // Closing percentage of variable agreements (how the sale was closed). Optional table: absent → no percentage shown.
  const pctR = sales.error || sales.data.length === 0 ? null : await supabase.from("crm_sale_variable_terms").select("sale_id,pct").in("sale_id", sales.data.map(r => r.id));
  const pctOf = new Map(((pctR?.error ? [] : pctR?.data) ?? []).map(r => [(r as { sale_id: string }).sale_id, Number((r as { pct: string }).pct)]));
  // Sales Center overview: the quote funnel and variable agreements live next to closed sales (one workspace).
  const [preparingQuotes, sentQuotes, acceptedQuotes, variableTerms, pendingSettlements] = clientId ? [null, null, null, null, null] : await Promise.all([
    run<unknown>(supabase.from("crm_quotes").select("id", { count: "exact" })
      .is("deleted_at", null).in("status", ["draft", "internal_review", "approved"]).range(0, 0)),
    countRows(supabase, "crm_quotes", [["is_null", "deleted_at"], ["eq", "status", "sent"]]),
    run<unknown>(quoteCandidateQuery(supabase, ["accepted"], "", 0).range(0, 0)),
    supabase.from("crm_sale_variable_terms").select("id", { count: "exact", head: true }),
    supabase.from("crm_sale_settlements").select("id", { count: "exact", head: true }).eq("status", "recorded"),
  ]);
  const collections = clientId ? null : await supabase.from("crm_sale_receivables").select("currency,overdue").gt("overdue", 0).limit(500);
  const overdueByCurrency = new Map<string, { amount: number; sales: number }>();
  for (const row of (collections && !collections.error ? collections.data ?? [] : []) as { currency: string; overdue: string }[]) {
    const cur = overdueByCurrency.get(row.currency) ?? { amount: 0, sales: 0 };
    // Sum in cents to avoid floating-point drift across many sales.
    overdueByCurrency.set(row.currency, { amount: cur.amount + Math.round(Number(row.overdue) * 100), sales: cur.sales + 1 });
  }
  const ownerList = owners.data ?? [];
  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} active="sales" crm="sales" eyebrow="CRM / Ventas" title={pick(lang, "Ventas y entregas", "Sales and delivery")}
      lead={pick(lang, "Ingresos contratados frente a dinero cobrado, órdenes de trabajo abiertas y cada venta con su estado de contrato y entrega.", "Contracted revenue versus money collected, open work orders and every sale with its contract and delivery status.")}
      actions={<><Link className={`${s.button} ${s.primary}`} href={clientId ? `/admin/workspace/crm/sales/new?client=${clientId}` : "/admin/workspace/crm/sales/new"}>{pick(lang, "+ Registrar venta", "+ Record sale")}</Link><Link className={s.button} href={clientId ? `/admin/workspace/crm/quotes?client=${clientId}` : "/admin/workspace/crm/quotes"}>{pick(lang, "Cotizaciones", "Quotes")}</Link><Link className={s.button} href="/admin/workspace/crm/leads">{pick(lang, "Ver pipeline", "View pipeline")}</Link></>} />
    <OkFlash lang={lang} code={q(p, "ok")} /><ErrorFlash lang={lang} code={q(p, "error")} />
    {clientId && <section className={s.panel} aria-label={pick(lang, "Filtro de cliente", "Client filter")}>
      {filteredClient.error ? <Unavailable lang={lang} code={filteredClient.error} /> : <p>
        {pick(lang, "Mostrando únicamente ventas vinculadas a", "Showing only sales linked to")}{" "}
        <Link href={`/admin/workspace/crm/clients/${clientId}`}><strong>{filteredClient.data?.legal_name}</strong></Link>
        {" · "}{sales.error ? "—" : (sales.count ?? 0)} {pick(lang, "venta(s) registrada(s)", "recorded sale(s)")}
        {" · "}<Link href="/admin/workspace/crm/sales">{pick(lang, "Ver todas las ventas", "View all sales")}</Link>
      </p>}
    </section>}
    {!clientId && <section className={s.stats} id="sales-overview" aria-label={pick(lang, "Resumen del Sales Center", "Sales Center overview")}>
      <div className={s.stat}><span>{pick(lang, "Cotizaciones en preparación", "Quotes in preparation")}</span><strong>{preparingQuotes?.count ?? "—"}</strong><small><Link href="/admin/workspace/crm/quotes">{pick(lang, "Abrir cotizaciones", "Open quotes")}</Link></small></div>
      <div className={s.stat}><span>{pick(lang, "Enviadas al cliente", "Sent to client")}</span><strong>{sentQuotes?.count ?? "—"}</strong></div>
      <div className={s.stat}><span>{pick(lang, "Aceptadas pendientes de cierre", "Accepted, waiting to close")}</span><strong>{acceptedQuotes?.count ?? "—"}</strong><small><Link href="/admin/workspace/crm/sales/new">{pick(lang, "Cerrar ventas", "Close sales")}</Link></small></div>
      {variableTerms && !variableTerms.error && <div className={s.stat}><span>{pick(lang, "Acuerdos variables registrados", "Recorded variable agreements")}</span><strong>{variableTerms.count ?? "—"}</strong>
        {pendingSettlements && !pendingSettlements.error && <small>{pendingSettlements.count ?? 0} {pick(lang, "liquidación(es) por verificar", "settlement(s) to verify")}</small>}</div>}
    </section>}
    {!clientId && (metrics.error ? <Unavailable lang={lang} code={metrics.error} /> : <section className={s.stats} aria-label={pick(lang, "Métricas comerciales globales", "Agency-wide commercial metrics")}>
      {metrics.data.length === 0 && <div className={s.stat}><span>{pick(lang, "Ingresos contratados", "Contracted revenue")}</span><strong>{money(lang, 0)}</strong><small>{pick(lang, "Sin ventas confirmadas", "No confirmed sales")}</small></div>}
      {metrics.data.map(m => <div key={m.currency} style={{ display: "contents" }}>
        <div className={s.stat}><span>{pick(lang, "Ingresos contratados", "Contracted revenue")} · {m.currency}</span><strong>{money(lang, m.contracted, m.currency)}</strong><small>{m.sales} {pick(lang, "venta(s)", "sale(s)")}</small></div>
        <div className={s.stat}><span>{pick(lang, "Cobrado (registrado)", "Collected (recorded)")}</span><strong>{money(lang, m.collected, m.currency)}</strong><small>{pick(lang, "Pendiente", "Outstanding")}: {money(lang, Number(m.contracted) - Number(m.collected), m.currency)}</small></div>
        <div className={s.stat}><span>{pick(lang, "Recurrente contratado / mes", "Contracted recurring / mo")}</span><strong>{money(lang, m.recurring_monthly, m.currency)}</strong><small>{pick(lang, "Pago inicial acordado", "Agreed upfront")}: {money(lang, m.upfront_agreed, m.currency)}</small></div>
      </div>)}
      <div className={s.stat}><span>{pick(lang, "Órdenes de trabajo abiertas", "Open work orders")}</span><strong>{openOrders.error ? "—" : openOrders.count}</strong></div>
      {collections && !collections.error && <div className={s.stat}><span>{pick(lang, "Cobros vencidos", "Overdue collections")}</span>
        <strong>{overdueByCurrency.size === 0 ? money(lang, 0) : [...overdueByCurrency].map(([cur, v]) => money(lang, v.amount / 100, cur)).join(" · ")}</strong>
        <small>{[...overdueByCurrency.values()].reduce((a, v) => a + v.sales, 0)} {pick(lang, "venta(s)", "sale(s)")} · <Link href={filterHref(null, null, 0, "overdue")}>{pick(lang, "Ver", "View")}</Link></small></div>}
      <div className={s.stat}><span>{pick(lang, "Tareas vencidas", "Overdue tasks")}</span><strong>{overdue.error ? "—" : overdue.count}</strong><small><Link href="/admin/workspace/crm/tasks?view=overdue">{pick(lang, "Revisar", "Review")}</Link></small></div>
    </section>)}
    <section className={s.panel} aria-labelledby="sales-list"><header><h2 id="sales-list">{pick(lang, "Ventas registradas", "Recorded sales")}</h2>
      <small className={s.muted}>{sales.error ? "—" : (sales.count ?? 0)} {pick(lang, "resultados", "results")}</small></header>
      <div className={s.salesFilterGroups}>
        <nav className={w.filters} aria-label={pick(lang, "Filtrar ventas por contrato", "Filter sales by contract")}>
          <span className={s.salesFilterLabel}>{pick(lang, "Contrato", "Contract")}</span>
          <Link href={filterHref(null, delivery)} aria-current={!contract ? "page" : undefined}>{pick(lang, "Todos", "All")}</Link>
          {CONTRACT_FILTERS.map(st => <Link key={st} href={filterHref(st, delivery)} aria-current={contract === st ? "page" : undefined}>{st === "cancelled" ? pick(lang, "Cancelado", "Cancelled") : st === "signed" ? pick(lang, "Firmado", "Signed") : pick(lang, "Por firmar", "Awaiting signature")}</Link>)}
        </nav>
        <nav className={w.filters} aria-label={pick(lang, "Filtrar ventas por entrega", "Filter sales by delivery")}>
          <span className={s.salesFilterLabel}>{pick(lang, "Entrega", "Delivery")}</span>
          <Link href={filterHref(contract, null)} aria-current={!delivery ? "page" : undefined}>{pick(lang, "Todas", "All")}</Link>
          {DELIVERY_FILTERS.map(st => <Link key={st} href={filterHref(contract, st)} aria-current={delivery === st ? "page" : undefined}>{st === "not_started" ? pick(lang, "Sin iniciar", "Not started") : st === "in_progress" ? pick(lang, "En curso", "In progress") : st === "delivered" ? pick(lang, "Entregada", "Delivered") : pick(lang, "Cancelada", "Cancelled")}</Link>)}
        </nav>
        <nav className={w.filters} aria-label={pick(lang, "Filtrar ventas por cobranza", "Filter sales by collections")}>
          <span className={s.salesFilterLabel}>{pick(lang, "Cobranza", "Collections")}</span>
          <Link href={filterHref(contract, delivery, 0, null)} aria-current={!paymentFilter ? "page" : undefined}>{pick(lang, "Todas", "All")}</Link>
          <Link href={filterHref(contract, delivery, 0, "open")} aria-current={paymentFilter === "open" ? "page" : undefined}>{pick(lang, "Con saldo", "With balance")}</Link>
          <Link href={filterHref(contract, delivery, 0, "overdue")} aria-current={paymentFilter === "overdue" ? "page" : undefined}>{pick(lang, "Vencidas", "Overdue")}</Link>
        </nav>
      </div>
      {paymentFilterUnavailable && <p className={s.muted} role="status">{pick(lang, "El filtro de cobranza requiere acceso financiero y la migración 20261123150000.", "The collections filter needs finance access and migration 20261123150000.")}</p>}
      {sales.error ? <Unavailable lang={lang} code={sales.error} /> : sales.data.length === 0 ? <p className={s.empty}>{pick(lang, "Todavía no hay ventas. Registra la primera para generar proyectos y tareas.", "No sales yet. Record the first one to generate projects and tasks.")}</p> :
      <div className={s.tableWrap}><table className={s.table} data-mobile-cards><thead><tr>
        <th>{pick(lang, "Venta", "Sale")}</th><th>{pick(lang, "Factura", "Invoice")}</th><th>{pick(lang, "Cliente", "Client")}</th><th>{pick(lang, "Fecha", "Date")}</th><th className={s.num}>Total</th><th>{pick(lang, "Servicios", "Services")}</th><th>{pick(lang, "Contrato", "Contract")}</th><th>{pick(lang, "Entrega", "Delivery")}</th><th>{pick(lang, "Cobranza", "Collections")}</th><th>{pick(lang, "Responsable", "Sales rep")}</th>
      </tr></thead><tbody>{sales.data.map(r => <tr key={r.id}>
        <td data-label={pick(lang, "Venta", "Sale")}><Link href={`/admin/workspace/crm/sales/${r.id}`}>{r.sale_number}</Link></td>
        <td data-label={pick(lang, "Factura", "Invoice")} data-invoices={(invoicesOf.get(r.id) ?? []).length}>{(() => { const list = invoicesOf.get(r.id) ?? []; const live = list.find(i => i.status === "issued") ?? list[0];
          if (!live) return invoicesR?.error ? <span className={s.muted}>—</span> : modelOf.get(r.id) === "commission" || Number(r.total) <= 0
            ? <span className={s.muted}>{pick(lang, "Se factura al verificar la liquidación", "Invoiced once the settlement is verified")}</span>
            : <form action={issueSaleInvoice} className={s.inline} data-issue-invoice={r.sale_number}><input type="hidden" name="sale_id" value={r.id} /><input type="hidden" name="from" value="list" />
              <span className={s.muted}>{pick(lang, "Sin factura", "Not invoiced")}</span><button type="submit" className={s.button}>{pick(lang, "Emitir factura", "Issue invoice")}</button></form>;
          const base = `/admin/workspace/crm/sales/${r.id}/invoices/${live.id}`;
          return <span className={s.inline}><Link href={base}>{live.number}{live.status === "void" ? ` (${pick(lang, "anulada", "void")})` : ""}</Link>
            <a href={`${base}/pdf`} download aria-label={`${pick(lang, "Descargar PDF", "Download PDF")} ${live.number}`}>PDF</a>
            <a href={`${base}#print`} aria-label={`${pick(lang, "Imprimir", "Print")} ${live.number}`}>{pick(lang, "Imprimir", "Print")}</a>
            {list.length > 1 && <span className={s.muted}>+{list.length - 1}</span>}</span>; })()}</td>
        <td data-label={pick(lang, "Cliente", "Client")}>{r.crm_clients ? <Link href={`/admin/workspace/crm/clients/${r.crm_clients.id}`}>{r.crm_clients.legal_name}</Link> : "—"}</td>
        <td data-label={pick(lang, "Fecha", "Date")}>{formatDate(lang, r.sold_on)}</td><td data-label="Total" className={s.num} data-model={modelOf.get(r.id) ?? "fixed"}>{modelOf.get(r.id) === "commission"
          ? <>{pctOf.has(r.id) ? <strong data-closing-pct>{pctOf.get(r.id)}%</strong> : null} {pick(lang, "Variable · según liquidación", "Variable · per settlement")}</>
          : <>{money(lang, r.total, r.currency)}{modelOf.get(r.id) === "hybrid" && <><br /><span className={s.muted}>+ {pctOf.has(r.id) ? `${pctOf.get(r.id)}% ` : ""}{pick(lang, "variable", "variable")}</span></>}</>}</td><td data-label={pick(lang, "Servicios", "Services")}>{r.crm_sale_lines.length}</td>
        <td data-label={pick(lang, "Contrato", "Contract")}><Tag lang={lang} value={r.contract_status} /></td><td data-label={pick(lang, "Entrega", "Delivery")}><Tag lang={lang} value={r.delivery_status} /></td>
        <td data-label={pick(lang, "Cobranza", "Collections")}>{(() => { const rec = receivables?.get(r.id); if (!rec) return <span className={s.muted}>—</span>;
          return <><Tag lang={lang} value={paymentStatus(rec)} /><br /><span className={s.muted}>{pick(lang, "Saldo", "Balance")} {money(lang, rec.balance, r.currency)}{Number(rec.overdue) > 0 ? ` · ${pick(lang, "vencido", "overdue")} ${money(lang, rec.overdue, r.currency)}` : ""}</span></>; })()}</td><td data-label={pick(lang, "Responsable", "Sales rep")}>{ownerName(ownerList, r.seller_id)}</td>
      </tr>)}</tbody></table></div>}
      <div className={s.actions} style={{ marginTop: 12 }}>{page > 0 && <Link className={s.button} href={filterHref(contract, delivery, page - 1)}>{pick(lang, "Anterior", "Previous")}</Link>}{(page + 1) * PAGE < (sales.count ?? 0) && <Link className={s.button} href={filterHref(contract, delivery, page + 1)}>{pick(lang, "Siguiente", "Next")}</Link>}</div>
    </section>
  </div></Suite>;
}
