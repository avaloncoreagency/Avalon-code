import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, Unavailable, q, UUID_RE, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import { money } from "@/lib/sales/domain";
import { QUOTE_STATUSES, type QuoteStatus } from "@/lib/quotes/model";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/quotes/text";
import s from "@/components/sales/sales.module.css";
import w from "@/components/quotes/quotes.module.css";

export const dynamic = "force-dynamic";
const PAGE = 25;
type Row = { id: string; quote_number: string; title: string; status: QuoteStatus; current_version: number; valid_until: string; updated_at: string;
  lead_id: string; client_id: string | null; crm_leads: { company: string } | null; crm_clients: { legal_name: string } | null };
type Version = { quote_id: string; version_no: number; one_time_total: string; monthly_total: string; commission_pct: string | null; commission_status: string | null };
type Summary = { draft: number; sent: number; overdue: number; accepted_without_contract: number };

/** CRM → Ventas → Cotizaciones. Owners only (requireOwner + RLS). */
export default async function QuotesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const p = await searchParams;
  const status = QUOTE_STATUSES.find(x => x === q(p, "status")) ?? null;
  const lead = q(p, "lead"); const leadId = lead && UUID_RE.test(lead) ? lead : null;
  const client = q(p, "client"); const clientId = client && UUID_RE.test(client) ? client : null;
  const page = Math.min(Number(/^\d{1,4}$/.test(q(p, "page") ?? "") ? q(p, "page") : 0), 2000);
  let query = supabase.from("crm_quotes")
    .select("id,quote_number,title,status,current_version,valid_until,updated_at,lead_id,client_id,crm_leads(company),crm_clients(legal_name)", { count: "exact" })
    .order("updated_at", { ascending: false }).order("id", { ascending: false });
  if (status) query = query.eq("status", status);
  if (leadId) query = query.eq("lead_id", leadId);
  if (clientId) {
    // Quotes issued before the prospect became a client are found through the client's opportunity.
    const { data: c } = await supabase.from("crm_clients").select("origin_lead_id").eq("id", clientId).maybeSingle();
    const origin = c?.origin_lead_id && UUID_RE.test(c.origin_lead_id) ? c.origin_lead_id : null;
    query = origin ? query.or(`client_id.eq.${clientId},lead_id.eq.${origin}`) : query.eq("client_id", clientId);
  }
  const [rows, summary] = await Promise.all([
    run<Row[]>(query.range(page * PAGE, page * PAGE + PAGE - 1)),
    run<Summary>(supabase.rpc("crm_quote_summary")),
  ]);
  const ids = rows.data?.map(r => r.id) ?? [];
  const versions = ids.length ? await run<Version[]>(supabase.from("crm_quote_versions")
    .select("quote_id,version_no,one_time_total,monthly_total,commission_pct,commission_status").in("quote_id", ids)) : { data: [] as Version[], error: null, count: 0 };
  const current = (r: Row) => versions.data?.find(v => v.quote_id === r.id && v.version_no === r.current_version);
  const today = new Date().toISOString().slice(0, 10);
  const filterHref = (st: string | null) => {
    const u = new URLSearchParams(); if (st) u.set("status", st); if (leadId) u.set("lead", leadId); if (clientId) u.set("client", clientId);
    const qs = u.toString(); return "/admin/workspace/crm/quotes" + (qs ? "?" + qs : "");
  };
  const newHref = "/admin/workspace/crm/quotes/new" + (leadId ? "?lead=" + leadId : clientId ? "?client=" + clientId : "");

  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} active="quotes" eyebrow={pick(lang, "CRM / Ventas / Cotizaciones", "CRM / Sales / Quotes")} title="Avalon Quoting Studio"
      lead={pick(lang, "Cotizaciones y propuestas PDF con versiones inmutables. Una cotización aceptada no es una venta: el siguiente paso es el contrato.", "Quotes and PDF proposals with immutable versions. An accepted quote is not a sale: the next step is the agreement.")}
      actions={<><Link className={`${s.button} ${s.primary}`} href={newHref}>{pick(lang, "+ Nueva cotización", "+ New quote")}</Link>
        <Link className={s.button} href="/admin/workspace/crm/leads">{pick(lang, "Ver pipeline", "View pipeline")}</Link></>} />
    {summary.error ? (summary.error === "schema_pending" ? <Unavailable lang={lang} code="schema_pending" /> : null) :
      <section className={s.stats} aria-label={pick(lang, "Estado de cotizaciones", "Quote status")}>
        <div className={s.stat}><span>{pick(lang, "En preparación", "In preparation")}</span><strong>{summary.data.draft}</strong><small>{pick(lang, "Borrador, revisión o aprobadas", "Draft, review or approved")}</small></div>
        <div className={s.stat}><span>{pick(lang, "Enviadas vigentes", "Sent and valid")}</span><strong>{summary.data.sent}</strong></div>
        <div className={s.stat}><span>{pick(lang, "Enviadas vencidas", "Sent and overdue")}</span><strong>{summary.data.overdue}</strong><small>{summary.data.overdue ? <Link href={filterHref("sent")}>{pick(lang, "Dar seguimiento", "Follow up")}</Link> : pick(lang, "Nada pendiente", "Nothing pending")}</small></div>
        <div className={s.stat}><span>{pick(lang, "Aceptadas sin contrato", "Accepted without agreement")}</span><strong>{summary.data.accepted_without_contract}</strong><small>{summary.data.accepted_without_contract ? <Link href={filterHref("accepted")}>{pick(lang, "Preparar contrato", "Prepare agreement")}</Link> : pick(lang, "Al día", "Up to date")}</small></div>
      </section>}
    <section className={s.panel} aria-labelledby="quotes-list">
      <header><h2 id="quotes-list">{pick(lang, "Cotizaciones", "Quotes")}</h2>
        <nav className={w.filters} aria-label={pick(lang, "Filtrar por estado", "Filter by status")}>
          <Link href={filterHref(null)} aria-current={!status ? "page" : undefined}>{pick(lang, "Todas", "All")}</Link>
          {(["draft", "internal_review", "approved", "sent", "accepted", "rejected", "expired"] as const).map(st =>
            <Link key={st} href={filterHref(st)} aria-current={status === st ? "page" : undefined}>{pick(lang, ...STATUS_LABEL[st])}</Link>)}
        </nav>
      </header>
      {(leadId || clientId) && <p className={s.muted}>{pick(lang, "Filtrado por oportunidad o cliente.", "Filtered by opportunity or client.")} <Link href="/admin/workspace/crm/quotes">{pick(lang, "Ver todas", "View all")}</Link></p>}
      {rows.error ? <Unavailable lang={lang} code={rows.error} /> : rows.data.length === 0 ?
        <p className={s.empty}>{pick(lang, "No hay cotizaciones con este filtro. ", "No quotes for this filter. ")}<Link href={newHref}>{pick(lang, "Crear la primera cotización", "Create the first quote")}</Link></p> :
        <div className={s.tableWrap}><table className={s.table} data-mobile-cards><thead><tr>
          <th>{pick(lang, "Cotización", "Quote")}</th><th>{pick(lang, "Prospecto / cliente", "Prospect / client")}</th><th>{pick(lang, "Estado", "Status")}</th>
          <th className={s.num}>{pick(lang, "Pago único", "One-time")}</th><th className={s.num}>{pick(lang, "Mensual", "Monthly")}</th><th>{pick(lang, "Comisión", "Commission")}</th><th>{pick(lang, "Válida hasta", "Valid until")}</th>
        </tr></thead><tbody>{rows.data.map(r => { const v = current(r); const overdue = r.status === "sent" && r.valid_until < today; return <tr key={r.id}>
          <td data-label={pick(lang, "Cotización", "Quote")}><Link href={`/admin/workspace/crm/quotes/${r.id}`}><strong>{r.quote_number}</strong></Link> · v{r.current_version}<br /><small>{r.title}</small></td>
          <td data-label={pick(lang, "Prospecto / cliente", "Prospect / client")}>{r.client_id && r.crm_clients ? <Link href={`/admin/workspace/crm/clients/${r.client_id}`}>{r.crm_clients.legal_name}</Link> : <Link href={`/admin/workspace/crm/lead/${r.lead_id}`}>{r.crm_leads?.company ?? "—"}</Link>}</td>
          <td data-label={pick(lang, "Estado", "Status")}><span className={s.tag} data-tone={overdue ? "danger" : STATUS_TONE[r.status]}>{pick(lang, ...STATUS_LABEL[r.status])}{overdue ? " · " + pick(lang, "vencida", "overdue") : ""}</span></td>
          <td data-label={pick(lang, "Pago único", "One-time")} className={s.num}>{v ? money(lang, v.one_time_total) : "—"}</td>
          <td data-label={pick(lang, "Mensual", "Monthly")} className={s.num}>{v ? money(lang, v.monthly_total) : "—"}</td>
          <td data-label={pick(lang, "Comisión", "Commission")}>{!v?.commission_status ? "—" : v.commission_status === "proposed" ? v.commission_pct + "%" : pick(lang, "Por acordar", "To be agreed")}</td>
          <td data-label={pick(lang, "Válida hasta", "Valid until")}>{formatDate(lang, r.valid_until)}</td>
        </tr>; })}</tbody></table></div>}
      {(rows.count ?? 0) > PAGE && <nav className={s.inline} aria-label={pick(lang, "Paginación", "Pagination")}>
        {page > 0 && <Link className={s.button} href={filterHref(status) + (filterHref(status).includes("?") ? "&" : "?") + "page=" + (page - 1)}>{pick(lang, "Anterior", "Previous")}</Link>}
        {(page + 1) * PAGE < (rows.count ?? 0) && <Link className={s.button} href={filterHref(status) + (filterHref(status).includes("?") ? "&" : "?") + "page=" + (page + 1)}>{pick(lang, "Siguiente", "Next")}</Link>}
      </nav>}
    </section>
  </div></Suite>;
}
