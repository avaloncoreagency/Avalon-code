import { loadOwnerDirectory } from "@/lib/identity/directory";
import Link from "next/link";
import { groupOfStage } from "@/lib/crm/pipeline-groups";
import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, OkFlash, ErrorFlash, Tag, Unavailable, ownerName, q, UUID_RE, type Query } from "@/components/sales/ui";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { run, type ProjectRow, PROJECT_COLUMNS } from "@/lib/os/data";
import { SERVICES, isService } from "@/lib/os/client-hud";
import { MODULE_KEYS, type ModuleKey } from "@/lib/os/domain";
import { checkClientProjectLink } from "@/lib/crm/client-project-link";
import { ClientOverview, type ClientCounts, type LinkableProduct } from "@/components/sales/client-overview";
import { ClientEditPanel } from "@/components/sales/client-edit-panel";
import { LeadAttachments, type LeadAttachment } from "@/components/crm/lead-attachments";
import { money } from "@/lib/sales/domain";
import { ClientWorkspace } from "@/components/sales/client-workspace";
import { loadAllRows, emptyLoaded, type FinanceSummary } from "@/lib/sales/client-finance";
import { getCrmCapabilities, loadClientFinance } from "@/lib/sales/client-finance-server";
import { addClientActivity, ensureClientOpportunity } from "../actions";
import { DELIVERY_LABEL, DELIVERY_TONE, readDelivery } from "@/lib/os/delivery";
import s from "@/components/sales/sales.module.css";
import { loadClientLedger } from "@/lib/sales/core-engine-server";
import { LedgerPanel } from "@/components/sales/core-panels";
import { ClientExperience } from "@/components/crm/client-experience";
export const dynamic = "force-dynamic";

type Client = { id: string; client_code: string; legal_name: string; trade_name: string; website: string; industry: string; country: string; location: string; source: string; notes: string; owner_id: string; origin_lead_id: string | null; status: string; created_at: string; version: number };
type Contact = { id: string; version: number; full_name: string; email: string | null; phone: string; role: string; is_primary: boolean };
type Sale = { id: string; sale_number: string; sold_on: string; currency: string; total: string; recurring_monthly: string; status: string; contract_status: string; delivery_status: string; crm_payments: { amount: string }[]; crm_sale_lines: { id: string }[] };
type Order = { id: string; sale_id: string; department_id: string; project_id: string | null; status: string; due_on: string | null; assignee_id: string; recurrence: string; crm_departments: { label: string } | null };
type Task = { id: string; title: string; status: string; priority: string; due_at: string | null; assignee_id: string; project_id: string | null };
type Event = { id: number; event_type: string; module: string; detail: string; result: string; from_state: string | null; to_state: string | null; actor_id: string | null; created_at: string };
const OPEN = ["todo", "in_progress", "blocked"];
const SALE_COLUMNS = "id,sale_number,sold_on,currency,total,recurring_monthly,status,contract_status,delivery_status,crm_payments(amount),crm_sale_lines(id)";
/** Rows shown in the sales table and used for the service list; totals always come from the FULL ledger below. */
const SALES_SHOWN = 100;

export default async function Client360({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  const { supabase } = await requireOwner();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const lang = await getLang();
  const p = await searchParams;
  const client = await run<Client | null>(supabase.from("crm_clients").select("*").eq("id", id).maybeSingle());
  if (!client.error && !client.data) notFound();
  const c = client.data;
  const leadId = c?.origin_lead_id ?? null;
  // Finance access is a database capability (agency_memberships + crm_private.finance_access), never an e-mail match.
  const caps = await getCrmCapabilities(supabase);
  const financePermitted = caps.source === "database" && caps.owner && caps.financeView;
  const now = new Date().toISOString();
  // Query exact counts at the source; 100-row client lists are not full ledgers.
  const metricsPromise = c ? Promise.all([
    ...MODULE_KEYS.map(module => run<null>(supabase.from("os_projects").select("id", { count: "exact" })
      .eq("client_id", id).eq("module", module).range(0, 0))),
    run<null>(supabase.from("os_projects").select("id", { count: "exact" }).eq("client_id", id).eq("status", "active").range(0, 0)),
    run<null>(supabase.from("crm_tasks").select("id", { count: "exact" }).eq("client_id", id).in("status", OPEN).range(0, 0)),
    run<null>(supabase.from("crm_tasks").select("id", { count: "exact" }).eq("client_id", id).in("status", OPEN).lt("due_at", now).range(0, 0)),
    run<null>(supabase.from("crm_work_orders").select("id", { count: "exact" }).eq("client_id", id).range(0, 0)),
    run<null>(supabase.from("crm_client_agreement_drafts").select("id", { count: "exact" }).eq("client_id", id).range(0, 0)),
    // Quotes issued to this client, including those issued to its opportunity before it became a client.
    run<null>(supabase.from("crm_quotes").select("id", { count: "exact" }).or(leadId ? `client_id.eq.${id},lead_id.eq.${leadId}` : `client_id.eq.${id}`).range(0, 0)),
  ]) : Promise.resolve(null);
  // Client 360° finance (KENJI #98): every sale and every expense is read page by page until the exact server
  // count is reached. A subtotal is never shown as the client's profitability (see src/lib/sales/client-finance.ts).
  const [contacts, salesLoaded, orders, projects, legacy, tasks, timeline, owners, lead, activities, meetings, financeResult, documents, unassigned] = await Promise.all([
    run<Contact[]>(supabase.from("crm_contacts").select("id,version,full_name,email,phone,role,is_primary").eq("client_id", id).order("is_primary", { ascending: false }).order("full_name")),
    financePermitted
      ? loadAllRows<Sale>((from, to) => supabase.from("crm_sales").select(SALE_COLUMNS, { count: "exact" }).eq("client_id", id).order("sold_on", { ascending: false }).order("id").range(from, to))
      : Promise.resolve(emptyLoaded<Sale>()),
    run<Order[]>(supabase.from("crm_work_orders").select("id,sale_id,department_id,project_id,status,due_on,assignee_id,recurrence,crm_departments(label)").eq("client_id", id).order("created_at").limit(200)),
    run<ProjectRow[]>(supabase.from("os_projects").select(PROJECT_COLUMNS, { count: "exact" }).eq("client_id", id).order("updated_at", { ascending: false }).limit(100)),
    // Compatibility: projects linked earlier through the origin lead id (stable key, never by name).
    leadId ? run<ProjectRow[]>(supabase.from("os_projects").select(PROJECT_COLUMNS).is("client_id", null).eq("settings->operations->>client_lead_id", leadId).limit(100)) : Promise.resolve({ data: [] as ProjectRow[], error: null, count: null }),
    run<Task[]>(supabase.from("crm_tasks").select("id,title,status,priority,due_at,assignee_id,project_id").eq("client_id", id).order("due_at", { ascending: true, nullsFirst: false }).limit(300)),
    run<Event[]>(supabase.from("crm_timeline").select("id,event_type,module,detail,result,from_state,to_state,actor_id,created_at").eq("client_id", id).order("id", { ascending: false }).limit(40)),
    run<{ user_id: string; email: string }[]>(loadOwnerDirectory(supabase)),
    leadId ? run<{ id: string; company: string; stage_id: string; value: string; source: string; created_at: string; crm_stages: {label:string}|null } | null>(supabase.from("crm_leads").select("id,company,stage_id,value,source,created_at,crm_stages(label)").eq("id", leadId).maybeSingle()) : Promise.resolve(null),
    // Activities on the client (FK) and, for history, on its origin lead.
    run<{ id: string; body: string; status: string; kind?: string; due_at: string | null; created_by: string; created_at: string }[]>(supabase.from("crm_activities").select("id,body,status,kind,due_at,created_by,created_at").or(leadId ? `client_id.eq.${id},lead_id.eq.${leadId}` : `client_id.eq.${id}`).order("created_at", { ascending: false }).limit(25)),
    leadId ? run<{ id: string; title: string; starts_at: string; kind: string; status: string }[]>(supabase.from("crm_events").select("id,title,starts_at,kind,status").eq("lead_id", leadId).order("starts_at", { ascending: false }).limit(10)) : Promise.resolve(null),
    financePermitted ? loadClientFinance(supabase, id, caps) : Promise.resolve(null),
    run<LeadAttachment[]>(supabase.from("crm_attachments").select("id,filename,mime,size_bytes,note,created_by,created_at", { count: "exact" })
      .or(leadId ? `client_id.eq.${id},lead_id.eq.${leadId}` : `client_id.eq.${id}`)
      .order("created_at", { ascending: false }).limit(40)),
    run<ProjectRow[]>(supabase.from("os_projects").select(PROJECT_COLUMNS)
      .is("client_id", null).neq("status", "archived").order("updated_at", { ascending: false }).limit(80)),
  ]);
  // Contracted recurring products (AVL-CLAUDE-CONVERGENCE-001). Amounts only for finance-permitted owners; a missing
  // migration in this environment shows nothing instead of failing the page.
  const subscriptions = financePermitted && c ? ((await supabase.from("crm_subscriptions")
    .select("id,status,period,amount,currency,current_period_end,cancel_at_period_end,ended_on,crm_service_catalog(name,name_en)")
    .eq("client_id", c.id).order("created_at", { ascending: false }).limit(50)).data ?? []) as unknown as
    { id: string; status: string; period: string; amount: string; currency: string; current_period_end: string | null; cancel_at_period_end: boolean; ended_on: string | null;
      crm_service_catalog: { name: string; name_en: string } | null }[] : [];
  // Totals: exact SQL aggregate when available; otherwise the fully paged rows (partial data is labelled partial).
  // A denied finance RPC is authoritative even if the user previously passed a capability check.
  const financeAllowed = financePermitted && financeResult?.allowed === true;
  const ledger = financeAllowed ? await loadClientLedger(supabase,id) : null;
  const finance: FinanceSummary | null = financeAllowed && financeResult?.allowed === true ? financeResult.summary : null;
  const sales = salesLoaded.rows;
  const ownerList = owners.data ?? [];
  const metricRows = await metricsPromise;
  const moduleCounts = Object.fromEntries(MODULE_KEYS.map((module, index) => {
    const row = metricRows?.[index];
    return [module, row && !row.error ? row.count : null];
  })) as Record<ModuleKey, number | null>;
  const n = (index: number) => {
    const row = metricRows?.[index + MODULE_KEYS.length];
    return row && !row.error ? row.count : null;
  };
  const counts: ClientCounts = {
    products: projects.error ? null : projects.count,
    activeProducts: n(0),
    openTasks: n(1),
    overdueTasks: n(2),
    workOrders: n(3),
    agreements: n(4),
    quotes: n(5),
    sales: financeAllowed && salesLoaded.complete && !salesLoaded.failed ? salesLoaded.rows.length : null,
    documents: documents.error ? null : documents.count,
    modules: moduleCounts,
  };
  const candidates: LinkableProduct[] = c && !unassigned.error ? (unassigned.data ?? [])
    .filter(pr => isService(pr.module) && checkClientProjectLink(c, pr) === "ok")
    .map(pr => ({ id: pr.id, name: pr.name, module: pr.module })) : [];
  const allProjects = [...new Map([...(projects.data ?? []), ...(legacy.data ?? [])].map(project => [project.id, project])).values()];
  const openTasks = (tasks.data ?? []).filter(t => OPEN.includes(t.status));
  const alerts = [
    ...openTasks.filter(t => t.due_at && t.due_at < now).map(t => ({ key: `o-${t.id}`, text: `${pick(lang, "Vencida", "Overdue")}: ${t.title}`, href: `/admin/workspace/crm/tasks?task=${t.id}` })),
    ...openTasks.filter(t => t.status === "blocked").map(t => ({ key: `b-${t.id}`, text: `${pick(lang, "Bloqueada", "Blocked")}: ${t.title}`, href: `/admin/workspace/crm/tasks?task=${t.id}` })),
    ...(orders.data ?? []).filter(o => o.status === "blocked").map(o => ({ key: `w-${o.id}`, text: `${pick(lang, "Orden bloqueada", "Blocked order")}: ${o.crm_departments?.label}`, href: `/admin/workspace/crm/sales/${o.sale_id}` })),
  ];
  const nextSteps = openTasks.filter(t => !t.due_at || t.due_at >= now).slice(0, 6);

  // Link or create an opportunity only after an explicit owner action.
  const linking = c && !c.origin_lead_id
    ? await run<boolean>(supabase.rpc("crm_client_opportunity_capability"))
    : null;
  const canOpenOpportunity = linking?.data === true && !linking.error;
  // Variable agreements (revenue share / commissions, migration 20261123160000). Optional: absent → nothing shown.
  // Invoices of this client (same crm_invoices records as Sales; finance RLS). Read-only links, no copies.
  const clientInvoicesR = financePermitted ? await supabase.from("crm_invoices").select("id,sale_id,number,amount,currency,issued_on,due_on,status")
    .eq("client_id", id).order("issued_on", { ascending: false }).limit(100) : null;
  const clientInvoices = (clientInvoicesR?.error ? [] : clientInvoicesR?.data ?? []) as { id: string; sale_id: string; number: string; amount: string; currency: string; issued_on: string; due_on: string | null; status: string }[];
  const variableR = financePermitted ? await supabase.from("crm_sale_variable_terms").select("sale_id,kind,pct").eq("client_id", id) : null;
  const variableBySale = new Map(((variableR?.error ? [] : variableR?.data) ?? []).map(v => [(v as { sale_id: string }).sale_id, v as { sale_id: string; kind: string; pct: string }]));

  return <Suite active="crm"><div className={s.hud}>
    <OpsHeader lang={lang} active="clients" eyebrow={`CRM / Clientes / ${c?.client_code ?? ""}`} title={c?.legal_name ?? pick(lang, "Cliente", "Client")}
      lead={c ? [c.trade_name, c.industry, [c.location, c.country].filter(Boolean).join(", "), `${pick(lang, "Fuente", "Source")}: ${c.source}`].filter(Boolean).join(" · ") : undefined}
      actions={c && <><Link className={`${s.button} ${s.primary}`} href={`/admin/workspace/crm/clients/${c.id}?edit=1#client-edit`}>{pick(lang, "Editar ficha y contactos", "Edit profile and contacts")}</Link>{c.origin_lead_id && <Link className={s.button} href={`/admin/workspace/crm/quotes/new?client=${c.id}`}>{pick(lang, "+ Crear cotización", "+ Create quote")}</Link>}<Link className={s.button} href={`/admin/workspace/crm/quotes?client=${c.id}`}>{pick(lang, "Cotizaciones", "Quotes")}</Link><Link className={s.button} href={`/admin/workspace/crm/sales/new?client=${c.id}`}>{pick(lang, "+ Nueva venta", "+ New sale")}</Link><Link className={s.button} href={`/admin/workspace/crm/clients/${c.id}/contracts`}>{pick(lang, "Generar contrato", "Generate agreement")}</Link><Link className={s.button} href={`/admin/workspace/crm/clients/${c.id}/results`}>{financePermitted ? pick(lang, "Comisiones por cobrar", "Commissions receivable") : pick(lang, "Comisiones (requiere permiso)", "Commissions (permission required)")}</Link>{!c.origin_lead_id && canOpenOpportunity && <form action={ensureClientOpportunity}><input type="hidden" name="client_id" value={c.id}/><button className={s.button} type="submit">{pick(lang, "+ Crear lead vinculado", "+ Create linked lead")}</button></form>}<Link className={s.button} href={`/admin/workspace/crm/tasks?view=all&client=${c.id}`}>{pick(lang, "Tareas", "Tasks")}</Link><Link className={s.button} href={`/admin/workspace/crm/activity?client=${c.id}`}>{pick(lang, "Actividad", "Activity")}</Link></>} />
    <OkFlash lang={lang} code={q(p, "ok")} /><ErrorFlash lang={lang} code={q(p, "error")} />
    {client.error ? <Unavailable lang={lang} code={client.error} /> : c && <>
      {!c.origin_lead_id && <p className={s.flash} data-tone="warn" role="status">{pick(lang,
        "Esta ficha aún no tiene una oportunidad comercial vinculada. La sincronización automática estará disponible cuando se habilite la actualización de base de datos; ninguna venta se ha inventado.",
        "This record has no linked sales opportunity. Automatic linking will become available after the database update; no sale has been fabricated.")}</p>}
      {!c.origin_lead_id && !canOpenOpportunity && <p className={s.flash} data-tone="warn" role="status">{pick(lang,
        "Esta ficha no tiene un lead vinculado. Si ya existe una oportunidad, comprueba su identidad antes de asociarla. Ninguna venta se inventa.",
        "No linked lead exists. Verify an existing opportunity's identity before associating it; no sale is fabricated.")}</p>}
      {caps.source === "unavailable" && <p className={s.flash} data-tone="warn" role="status">{pick(lang, "No se pudo verificar el acceso financiero. Los importes privados permanecen ocultos.", "Finance access could not be verified. Private amounts remain hidden.")}</p>}
      <ClientEditPanel client={c} contacts={contacts.data ?? []} unavailable={Boolean(contacts.error)} lang={lang} open={q(p, "edit") === "1"} />
      <ClientOverview lang={lang} client={c} owner={ownerName(ownerList, c.owner_id)}
        contacts={contacts.error ? null : (contacts.data ?? [])} nextSteps={nextSteps} nextStepsUnavailable={Boolean(tasks.error)}
        latest={timeline.data?.[0] ?? null} latestUnavailable={Boolean(timeline.error)} counts={counts}
        candidates={candidates} candidateError={Boolean(unassigned.error)} financeAvailable={financeAllowed} leadStage={lead?.data?.crm_stages?.label ?? lead?.data?.stage_id ?? null} />
      {ledger?.ok && <LedgerPanel ledger={ledger.data} lang={lang}/>}
      {(!ledger || ("unavailable" in ledger)) && finance && finance.currencies.some(f => f.sales > 0) && <section className={s.stats} aria-label={pick(lang, "Situación financiera del cliente", "Client financial summary")}>

        {finance.currencies.filter(f => f.sales > 0).map(f => <div key={f.currency} className={s.stat}>
          <span>{pick(lang, "Contratado", "Contracted")} · {f.currency}{finance.complete ? "" : ` · ${pick(lang, "parcial", "partial")}`}</span>
          <strong>{money(lang, f.contractedCents / 100, f.currency)}</strong>
          <small>{pick(lang, "Cobrado", "Collected")} {money(lang, f.collectedCents / 100, f.currency)} · {pick(lang, "Recurrente/mes", "Recurring/mo")} {money(lang, f.recurringCents / 100, f.currency)}</small>
        </div>)}
      </section>}

      {variableBySale.size > 0 && <p className={s.flash} data-tone="warn" data-variable-agreements>
        <strong>{pick(lang, "Acuerdos variables", "Variable agreements")}: {variableBySale.size}</strong> — {pick(lang, "participación en ingresos o comisión; el importe se reconoce con cada liquidación verificada y no se incluye en «Contratado».", "revenue share or commission; the amount is recognised with each verified settlement and is not included in “Contracted”.")}</p>}

      {clientInvoices.length > 0 && <section className={s.panel} aria-labelledby="client-invoices">
        <h2 id="client-invoices">{pick(lang, "Facturas del cliente", "Client invoices")}</h2>
        <ul className={s.list}>{clientInvoices.map(x => { const base = `/admin/workspace/crm/sales/${x.sale_id}/invoices/${x.id}`; return <li key={x.id} data-client-invoice>
          <strong>{x.number}</strong> · {money(lang, x.amount, x.currency)} · {formatDate(lang, x.issued_on)}{x.status === "void" ? ` · ${pick(lang, "Anulada", "Void")}` : ""}
          <span className={s.inline}><Link className={s.button} href={base}>{pick(lang, "Ver factura", "View invoice")}</Link>
            <a className={s.button} href={`${base}/pdf`} download>{pick(lang, "Descargar PDF", "Download PDF")}</a>
            <a className={s.button} href={`${base}#print`}>{pick(lang, "Imprimir", "Print")}</a></span></li>; })}</ul>
      </section>}
      <ClientExperience supabase={supabase} clientId={c.id} lang={lang} projects={allProjects} sales={sales.map(x => ({ id: x.id, sale_number: x.sale_number }))} />
      <ClientWorkspace supabase={supabase} clientId={c.id} lang={lang} sales={sales.slice(0, SALES_SHOWN)}
        financeAllowed={financeAllowed} finance={finance} ledgerAvailable={ledger?.ok === true}
        />
      {subscriptions.length > 0 && <section className={s.panel} aria-labelledby="client-subscriptions" data-client-subscriptions>
        <header><h2 id="client-subscriptions">{pick(lang, "Productos recurrentes", "Recurring products")}</h2><Link href="/admin/workspace/crm/subscriptions">{pick(lang, "Gestionar suscripciones", "Manage subscriptions")}</Link></header>
        <ul className={s.list}>{subscriptions.map(x => <li key={x.id}>
          <strong>{(lang === "en" ? x.crm_service_catalog?.name_en : "") || x.crm_service_catalog?.name || "—"}</strong>
          <span className={s.muted}>{money(lang, x.amount, x.currency)} / {x.period === "annual" ? pick(lang, "año", "year") : pick(lang, "mes", "month")} · <Tag lang={lang} value={x.status} />
            {x.current_period_end && x.status === "active" ? ` · ${pick(lang, x.cancel_at_period_end ? "termina" : "período hasta", x.cancel_at_period_end ? "ends" : "period until")} ${formatDate(lang, x.current_period_end)}` : ""}
            {x.ended_on ? ` · ${pick(lang, "finalizó", "ended")} ${formatDate(lang, x.ended_on)}` : ""}</span>
        </li>)}</ul>
      </section>}
      {alerts.length > 0 && <section className={s.panel} aria-labelledby="alerts"><h2 id="alerts">{pick(lang, "Alertas", "Alerts")}</h2><ul className={s.list}>{alerts.map(a => <li key={a.key} className={s.notice} data-severity="urgent"><Link href={a.href}>{a.text}</Link></li>)}</ul></section>}

      <section className={s.panel} aria-labelledby="projects"><header><h2 id="projects">{pick(lang, "Proyectos por departamento", "Projects by department")}</h2></header>
        {projects.error ? <Unavailable lang={lang} code={projects.error} /> : allProjects.length === 0 ? <p className={s.empty}>{pick(lang, "Sin proyectos. Se crean al confirmar una venta.", "No projects. They are created when a sale is confirmed.")}</p> :
        <div className={s.grid}>{allProjects.map(pr => { const svc = isService(pr.module) ? SERVICES[pr.module] : null; const wo = (orders.data ?? []).find(o => o.project_id === pr.id); const pt = (tasks.data ?? []).filter(t => t.project_id === pr.id);
          return <div key={pr.id} className={s.card}><span className={s.eyebrow}>{svc?.name ?? pr.module}</span><h3><Link href={`/admin/workspace/products/${pr.id}`}>{pr.name}</Link></h3>
            <p className={s.inline}><Tag lang={lang} value={pr.status} /><span className={s.tag} data-tone={DELIVERY_TONE[readDelivery(pr.settings).stage]} title={pick(lang, "Etapa de entrega", "Delivery stage")}>{pick(lang, ...DELIVERY_LABEL[readDelivery(pr.settings).stage])}</span>{!pr.client_id && <span className={s.muted}>{pick(lang, "Referencia heredada del lead (por vincular)", "Inherited lead reference (not yet linked)")}</span>}{wo && <Tag lang={lang} value={wo.status} />}{wo && wo.recurrence !== "none" && <Tag lang={lang} value={wo.recurrence} />}</p>
            <p className={s.muted}>{pt.length ? `${pt.filter(t => t.status === "done").length}/${pt.filter(t => t.status !== "cancelled").length} ${pick(lang, "tareas hechas", "tasks done")}` : pick(lang, "Sin tareas vinculadas", "No linked tasks")}{wo?.due_on ? ` · ${pick(lang, "entrega", "due")} ${formatDate(lang, wo.due_on)}` : ""}{wo ? ` · ${ownerName(ownerList, wo.assignee_id)}` : ""}</p>
            <p className={s.actions}><Link href={`/admin/workspace/products/${pr.id}`}>{pick(lang, "HUD del producto (entregables, cambios, QA)", "Product HUD (deliverables, changes, QA)")}</Link>{svc && <Link href={`/admin/workspace/${svc.slug}/${pr.id}`}>{pick(lang, "Abrir en", "Open in")} {svc.name}</Link>}</p>
          </div>; })}</div>}
        {!projects.error && projects.count !== null && projects.count > (projects.data?.length ?? 0) && <p className={s.muted}>{pick(lang, `Se muestran los ${projects.data?.length ?? 0} proyectos más recientes de ${projects.count}. Puedes ver todos por departamento desde el ecosistema de herramientas.`, `Showing the ${projects.data?.length ?? 0} most recent of ${projects.count} projects. Open the filtered module portfolio to browse the rest.`)}</p>}
      </section>

      <LeadAttachments clientId={c.id} lang={lang} files={(documents.data ?? []).map(file=>({...file,created_at_label:formatDate(lang,file.created_at)}))}
        total={documents.count} unavailable={Boolean(documents.error)} />
      <div className={s.columns}>
        <section className={s.panel} aria-labelledby="sales"><header><h2 id="sales">{pick(lang, "Ventas y servicios", "Sales and services")}</h2></header>
          {!financeAllowed ? <p className={s.muted}>{pick(lang, "Los importes de ventas se muestran solo al responsable financiero.", "Sales amounts are available only to the finance administrator.")}</p> : salesLoaded.failed ? <p className={s.flash} data-tone="error" role="alert">{pick(lang, "No se pudieron leer las ventas.", "Sales could not be read.")}</p> : sales.length === 0 ? <p className={s.muted}>{pick(lang, "Sin ventas registradas.", "No sales recorded.")}</p> :
          <div className={s.tableWrap}><table className={s.table}><thead><tr><th>{pick(lang, "Venta", "Sale")}</th><th>{pick(lang, "Fecha", "Date")}</th><th className={s.num}>Total</th><th className={s.num}>{pick(lang, "Cobrado", "Collected")}</th><th>{pick(lang, "Contrato", "Contract")}</th><th>{pick(lang, "Entrega", "Delivery")}</th></tr></thead>
            <tbody>{sales.slice(0, SALES_SHOWN).map(x => <tr key={x.id}><td><Link href={`/admin/workspace/crm/sales/${x.id}`}>{x.sale_number}</Link><br /><span className={s.muted}>{x.crm_sale_lines.length} {pick(lang, "servicio(s)", "service(s)")}</span></td><td>{formatDate(lang, x.sold_on)}</td><td className={s.num} data-variable={variableBySale.has(x.id) || undefined}>{variableBySale.has(x.id) && Number(x.total) === 0 ? `${pick(lang, "Variable", "Variable")} · ${Number(variableBySale.get(x.id)!.pct)}%` : money(lang, x.total, x.currency)}{variableBySale.has(x.id) && Number(x.total) !== 0 && <><br /><span className={s.muted}>+ {Number(variableBySale.get(x.id)!.pct)}% {pick(lang, "variable", "variable")}</span></>}</td><td className={s.num}>{money(lang, x.crm_payments.reduce((a, b) => a + Number(b.amount), 0), x.currency)}</td><td><Tag lang={lang} value={x.contract_status} /></td><td><Tag lang={lang} value={x.delivery_status} /></td></tr>)}</tbody></table>{sales.length > SALES_SHOWN && <p className={s.muted}>{pick(lang, `Se muestran las ${SALES_SHOWN} ventas más recientes de ${sales.length}; los totales incluyen todas.`, `Showing the ${SALES_SHOWN} most recent of ${sales.length} sales; totals include all of them.`)}</p>}</div>}
          <h3>{pick(lang, "Próximos pasos", "Next steps")}</h3>
          {nextSteps.length === 0 ? <p className={s.muted}>{pick(lang, "Sin tareas próximas.", "No upcoming tasks.")}</p> : <ul className={s.list}>{nextSteps.map(t => <li key={t.id}><Link href={`/admin/workspace/crm/tasks?task=${t.id}`}>{t.title}</Link><span className={s.muted}>{t.due_at ? formatDate(lang, t.due_at, true) : pick(lang, "sin fecha", "no date")} · {ownerName(ownerList, t.assignee_id)}</span></li>)}</ul>}
        </section>
        <section className={s.panel} aria-labelledby="identity"><h2 id="identity">{pick(lang, "Identidad y contactos", "Identity and contacts")}</h2>
          <dl className={s.detail}>
            <dt>ID</dt><dd>{c.client_code}</dd>
            <dt>Web</dt><dd>{c.website ? <a href={c.website} rel="noopener noreferrer nofollow" target="_blank">{c.website}</a> : "—"}</dd>
            <dt>{pick(lang, "Alta", "Since")}</dt><dd>{formatDate(lang, c.created_at)}</dd>
            <dt>{pick(lang, "Estado", "Status")}</dt><dd><Tag lang={lang} value={c.status} /></dd>
          </dl>
          {contacts.error ? <Unavailable lang={lang} code={contacts.error} /> : <ul className={s.list} style={{ marginTop: 12 }}>{(contacts.data ?? []).map(ct => <li key={ct.id}><strong>{ct.full_name}{ct.is_primary ? ` · ${pick(lang, "principal", "primary")}` : ""}</strong><span className={s.muted}>{[ct.role, ct.email, ct.phone].filter(Boolean).join(" · ") || "—"}</span></li>)}</ul>}
          {lead?.data && <><h3>{pick(lang, "Lead y oportunidad de origen", "Origin lead and opportunity")}</h3>
            <p className={s.muted}><Link href={`/admin/workspace/crm/lead/${lead.data.id}`}>{lead.data.company}</Link> · <span data-pipeline-group={groupOfStage(lead.data.stage_id)?.id ?? "review"}>{(() => { const g = groupOfStage(lead.data.stage_id); return g ? pick(lang, ...g.label) : pick(lang, "Por revisar", "To review"); })()}</span> ({lead.data.crm_stages?.label ?? lead.data.stage_id}) · {lead.data.source} · {formatDate(lang, lead.data.created_at)}</p>
            {(meetings?.data ?? []).length > 0 && <><h3>{pick(lang, "Reuniones y seguimientos", "Meetings and follow-ups")}</h3><ul className={s.list}>{meetings!.data!.map(m => <li key={m.id}><strong>{m.title}</strong><small className={s.muted}>{formatDate(lang, m.starts_at, true)} · {m.kind} · {m.status}</small></li>)}</ul></>}
          </>}
        </section>
      </div>

      <section className={s.panel} aria-labelledby="activities"><header><h2 id="activities">{pick(lang, "Actividad comercial y seguimientos", "Commercial activity and follow-ups")}</h2></header>
        <div className={s.columns}>
          <div>{activities.error ? <Unavailable lang={lang} code={activities.error} /> : activities.data.length === 0 ? <p className={s.muted}>{pick(lang, "Sin actividades registradas.", "No activities recorded.")}</p> :
            <ul className={s.list}>{activities.data.map(a => <li key={a.id} className={s.notice} data-severity={a.status === "pending" && a.due_at && a.due_at < now ? "urgent" : "normal"}>
              <span className={s.inline}>{a.kind && <span className={s.tag}>{a.kind}</span>}<span className={s.tag} data-tone={a.status === "pending" ? "warn" : "ok"}>{a.status === "pending" ? pick(lang, "Seguimiento pendiente", "Follow-up pending") : pick(lang, "Registrada", "Logged")}</span></span>
              <span style={{ whiteSpace: "pre-wrap" }}>{a.body}</span>
              <small className={s.muted}>{ownerName(ownerList, a.created_by)} · {formatDate(lang, a.created_at, true)}{a.due_at ? ` · ${pick(lang, "vence", "due")} ${formatDate(lang, a.due_at)}` : ""}</small></li>)}</ul>}</div>
          <form action={addClientActivity} className={s.form}><input type="hidden" name="client_id" value={c.id} />
            <div className={s.row}>
              <label className={s.field}>{pick(lang, "Tipo", "Type")}<select name="kind" defaultValue="note">{[["note", "Nota", "Note"], ["call", "Llamada", "Call"], ["email", "Email", "Email"], ["whatsapp", "WhatsApp", "WhatsApp"], ["meeting", "Reunión", "Meeting"], ["task", "Seguimiento", "Follow-up"]].map(([k, es, en]) => <option key={k} value={k}>{pick(lang, es, en)}</option>)}</select></label>
              <label className={s.field}>{pick(lang, "Fecha de seguimiento (opcional)", "Follow-up date (optional)")}<input name="due_on" type="date" /></label>
            </div>
            <label className={s.field}>{pick(lang, "Detalle *", "Details *")}<textarea name="body" required maxLength={4000} rows={3} /></label>
            <button className={s.button}>{pick(lang, "Registrar actividad", "Log activity")}</button>
          </form>
        </div>
      </section>

      <section className={s.panel} aria-labelledby="history"><header><h2 id="history">{pick(lang, "Historial de actividad", "Activity history")}</h2><Link href={`/admin/workspace/crm/activity?client=${c.id}`}>{pick(lang, "Investigar en el centro de actividad", "Investigate in the activity center")}</Link></header>
        {timeline.error ? <Unavailable lang={lang} code={timeline.error} /> : timeline.data.length === 0 ? <p className={s.muted}>{pick(lang, "Sin eventos registrados.", "No recorded events.")}</p> :
        <ol className={s.timeline}>{timeline.data.map(e => <li key={e.id} data-result={e.result}><strong>{e.event_type}</strong> <span className={s.muted}>· {e.module} · {ownerName(ownerList, e.actor_id)} · {formatDate(lang, e.created_at, true)}</span><div className={s.muted}>{[e.from_state && e.to_state ? `${e.from_state} → ${e.to_state}` : e.to_state, e.detail].filter(Boolean).join(" · ")}</div></li>)}</ol>}
      </section>
    </>}
  </div></Suite>;
}
