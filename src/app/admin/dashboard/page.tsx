import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { ModuleCards, type ModuleStat } from "@/components/suite/module-cards";
import { Icon } from "@/components/suite/icons";
import s from "@/components/suite/suite.module.css";
import { requireOwner, displayName } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate, AVALON_TIME_ZONE } from "@/lib/i18n";
import { run, countRows, recentAudit } from "@/lib/os/data";
import { INTEGRATIONS } from "@/lib/os/integrations";
import { MODULE_KEYS, type ModuleKey } from "@/lib/os/domain";
import { dayInZone, moveDay } from "@/lib/crm/shared-calendar";
import { money } from "@/lib/sales/domain";

export const dynamic = "force-dynamic";

const TABLE_LABEL: Record<string, [string, string]> = {
  os_projects: ["Proyecto", "Project"], os_website_pages: ["Página web", "Web page"], os_store_products: ["Producto", "Product"],
  os_receptionist_entries: ["Conocimiento de recepción", "Receptionist knowledge"], os_marketing_items: ["Contenido de marketing", "Marketing content"],
};
const OP_LABEL: Record<string, [string, string]> = { INSERT: ["creó", "created"], UPDATE: ["actualizó", "updated"], DELETE: ["eliminó", "deleted"] };
const MODULE_HREF: Record<string, string> = {
  website: "/admin/workspace/website-designer", ecommerce: "/admin/workspace/ecommerce-designer", crm_creator: "/admin/workspace/crm-creator",
  receptionist: "/admin/workspace/ai-receptionist", chatbots: "/admin/workspace/ai-chatbots", marketing: "/admin/workspace/marketing-hub",
};

export default async function DashboardPage() {
  const { supabase, user, userId } = await requireOwner();
  const lang = await getLang();
  const nowIso = new Date().toISOString();
  const today = dayInZone(nowIso, AVALON_TIME_ZONE);
  const horizon = moveDay(today, 14);
  const [projects, activeProjects, moduleCounts, overdue, pagesPublished, productsActive, upcoming, audit, crmLeads, salesMetrics, activeClients, openOrders, overdueTasks, quoteSummary, aiUsage] = await Promise.all([
    run<{ id: string; module: string; name: string }[]>(supabase.from("os_projects").select("id,module,name", { count: "exact" }).neq("status", "archived").order("updated_at", { ascending: false }).order("id").limit(6)),
    countRows(supabase, "os_projects", [["eq", "status", "active"]]),
    Promise.all(MODULE_KEYS.map(async module => [module, await countRows(supabase, "os_projects", [["eq", "module", module], ["neq", "status", "archived"]])] as const)),
    countRows(supabase, "os_marketing_items", [["lt", "planned_for", today], ["not_in", "status", ["published", "cancelled"]]]),
    countRows(supabase, "os_website_pages", [["eq", "status", "published"]]),
    countRows(supabase, "os_store_products", [["eq", "status", "active"]]),
    run<{ id: string; title: string; planned_for: string; status: string; project_id: string }[]>(supabase.from("os_marketing_items").select("id,title,planned_for,status,project_id", { count: "exact" }).lte("planned_for", horizon).not("status", "in", "(published,cancelled)").order("planned_for").order("id").limit(8)),
    recentAudit(supabase, 8),
    run<unknown>(supabase.from("crm_leads").select("id,crm_stages!inner()", { count: "exact" })
      .eq("archived", false).eq("crm_stages.kind", "open").range(0, 0)),
    run<{ currency: string; sales: number; contracted: string; collected: string; recurring_monthly: string }[]>(supabase.rpc("crm_sales_metrics")),
    countRows(supabase, "crm_clients", [["eq", "status", "active"]]),
    countRows(supabase, "crm_work_orders", [["not_in", "status", ["delivered", "cancelled"]]]),
    countRows(supabase, "crm_tasks", [["not_in", "status", ["done", "cancelled"]], ["lt", "due_at", nowIso]]),
    run<{ draft: number; sent: number; overdue: number; accepted_without_contract: number }>(supabase.rpc("crm_quote_summary")),
    // AI credits (10.3): only owner-entered records exist today; no provider API is connected, so nothing is fetched or guessed.
    run<UsageRow[]>(supabase.from("crm_usage").select("provider,amount,unit,period_start,period_end,limit_value,threshold,source,mode,created_by,updated_at").order("period_end", { ascending: false }).limit(60)),
  ]);
  const quotes = quoteSummary.error ? null : quoteSummary.data;
  const salesReady = salesMetrics.error === null;
  const primary = salesMetrics.data?.find(m => m.currency === "USD") ?? salesMetrics.data?.[0];

  const schemaReady = projects.error === null;
  const byModule = new Map(moduleCounts);
  const stat = (key: ModuleKey, es: string, en: string): ModuleStat => {
    const value = byModule.get(key)?.count ?? null;
    return { value, label: pick(lang, es, en), state: value === null ? "pending" : "ready" };
  };
  const chatbotCount = byModule.get("chatbots")?.count;
  const receptionCount = byModule.get("receptionist")?.count;
  const stats = {
    crm: crmLeads.error ? { value: null, label: "", state: "pending" as const } : { value: crmLeads.count, label: pick(lang, "leads activos", "active leads"), state: "ready" as const },
    website: stat("website", "proyectos", "projects"),
    ecommerce: stat("ecommerce", "tiendas", "stores"),
    crm_creator: stat("crm_creator", "plantillas CRM", "CRM blueprints"),
    communications: chatbotCount == null || receptionCount == null
      ? { value: null, label: "", state: "pending" as const }
      : { value: chatbotCount + receptionCount, label: pick(lang, "agentes registrados", "registered agents"), state: "ready" as const },
    marketing: stat("marketing", "campañas", "campaigns"),
  };
  const n = (value: number | null | undefined) => (value === null || value === undefined ? "—" : String(value));
  const passwordEnabled = true;
  const connected = INTEGRATIONS.filter(i => i.status === "connected").length;

  return (
    <Suite active="dashboard">
      <section className={s.hero} aria-labelledby="welcome-title">
        <p className={s.heroEyebrow}>{pick(lang, "Centro de operaciones", "Operations center")}</p>
        <h1 id="welcome-title">{pick(lang, `Hola, ${displayName(user)}.`, `Welcome, ${displayName(user)}.`)}</h1>
        <p>{pick(lang,
          "Todo lo que gestiona Avalon Core Agency en un solo lugar. Las cifras provienen únicamente de datos reales guardados en la plataforma.",
          "Everything Avalon Core Agency runs, in one place. Figures come only from real data stored in the platform.")}</p>
        <div className={s.heroActions}>
          <Link className={s.heroButton} href="/admin/workspace/ai-communications"><Icon name="communications" size={18} />COMMUNICATION HUB</Link>
          <Link className={s.heroButton} href="/admin/workspace/crm"><Icon name="crm" size={18} />{pick(lang, "Abrir CRM", "Open CRM")}</Link>
          <Link className={s.heroButton} href="/admin/workspace/crm/leads#crm-create-lead"><Icon name="plus" size={18} />{pick(lang, "Crear lead", "Create lead")}</Link>
          <Link className={s.heroButton} href="/admin/workspace/crm/quotes/new"><Icon name="plus" size={18} />{pick(lang, "Crear cotización", "Create quote")}</Link>
          <Link className={s.heroButton} href="/admin/workspace/crm/sales/new"><Icon name="plus" size={18} />{pick(lang, "Registrar venta", "Record sale")}</Link>
          <Link className={s.heroButton} href="/admin/workspace/crm/tasks"><Icon name="clock" size={18} />{pick(lang, "Mis tareas", "My tasks")}</Link>
          <Link className={s.heroButton} href="/admin/workspace/crm/office/hq"><Icon name="profile" size={18} />{pick(lang, "Oficina", "Office")}</Link>
          <Link className={s.heroButton} href="/admin/workspace/website-designer#new"><Icon name="plus" size={18} />{pick(lang, "Nuevo sitio web", "New website")}</Link>
        </div>
      </section>

      <div className={s.kpis} role="list" aria-label={pick(lang, "Indicadores", "Indicators")}>
        <div className={s.kpi} role="listitem"><span>{pick(lang, "Proyectos activos", "Active projects")}</span><strong>{n(activeProjects.count)}</strong><small>{pick(lang, `${n(projects.count)} en total (sin archivar)`, `${n(projects.count)} total (not archived)`)}</small></div>
        <div className={s.kpi} role="listitem"><span>{pick(lang, "Páginas publicadas", "Published pages")}</span><strong>{n(pagesPublished.count)}</strong><small>Website Designer</small></div>
        <div className={s.kpi} role="listitem"><span>{pick(lang, "Productos activos", "Active products")}</span><strong>{n(productsActive.count)}</strong><small>E-commerce Designer</small></div>
        <div className={s.kpi} role="listitem"><span>{pick(lang, "Contenido pendiente hasta el día 14", "Content due through the next 14 days")}</span><strong>{n(upcoming.count)}</strong><small>{pick(lang, `${n(overdue.count)} vencido(s)`, `${n(overdue.count)} overdue`)}</small></div>
      </div>

      <div className={s.sectionTitle}><h2>{pick(lang, "Pulso comercial", "Commercial pulse")}</h2><span>{salesReady ? <Link href="/admin/workspace/crm/sales">{pick(lang, "Ver ventas →", "View sales →")}</Link> : pick(lang, "Datos de ventas no disponibles", "Sales data unavailable")}</span></div>
      <div className={s.kpis} role="list" aria-label={pick(lang, "Indicadores comerciales", "Commercial indicators")}>
        <Link className={s.kpi} role="listitem" href="/admin/workspace/crm/sales"><span>{pick(lang, "Ingresos contratados", "Contracted revenue")}</span><strong>{salesReady ? money(lang, primary?.contracted ?? 0, primary?.currency ?? "USD") : "—"}</strong><small>{salesReady ? pick(lang, `${primary?.sales ?? 0} venta(s) · cobrado ${money(lang, primary?.collected ?? 0, primary?.currency ?? "USD")}`, `${primary?.sales ?? 0} sale(s) · collected ${money(lang, primary?.collected ?? 0, primary?.currency ?? "USD")}`) : pick(lang, "Sin fuente de datos", "No data source")}</small></Link>
        <Link className={s.kpi} role="listitem" href="/admin/workspace/crm/sales"><span>{pick(lang, "Recurrente contratado / mes", "Contracted recurring / mo")}</span><strong>{salesReady ? money(lang, primary?.recurring_monthly ?? 0, primary?.currency ?? "USD") : "—"}</strong><small>{pick(lang, "Servicios mensuales vendidos", "Monthly services sold")}</small></Link>
        <Link className={s.kpi} role="listitem" href="/admin/workspace/crm/clients"><span>{pick(lang, "Clientes activos", "Active clients")}</span><strong>{n(activeClients.count)}</strong><small>{pick(lang, `${n(crmLeads.count)} lead(s) abiertos`, `${n(crmLeads.count)} open lead(s)`)}</small></Link>
        <Link className={s.kpi} role="listitem" href={quotes?.overdue ? "/admin/workspace/crm/quotes?status=sent" : "/admin/workspace/crm/quotes"}><span>{pick(lang, "Cotizaciones abiertas", "Open quotes")}</span><strong>{quotes ? String(quotes.draft + quotes.sent + quotes.overdue) : "—"}</strong><small style={quotes?.overdue ? { color: "var(--danger)" } : undefined}>{quotes ? pick(lang, `${quotes.sent} enviada(s) · ${quotes.overdue} vencida(s) · ${quotes.accepted_without_contract} aceptada(s) sin contrato`, `${quotes.sent} sent · ${quotes.overdue} overdue · ${quotes.accepted_without_contract} accepted without agreement`) : pick(lang, "Quoting Studio pendiente de activación", "Quoting Studio pending activation")}</small></Link>
        <Link className={s.kpi} role="listitem" href="/admin/workspace/crm/tasks?view=overdue"><span>{pick(lang, "Órdenes de trabajo abiertas", "Open work orders")}</span><strong>{n(openOrders.count)}</strong><small style={overdueTasks.count ? { color: "var(--danger)" } : undefined}>{pick(lang, `${n(overdueTasks.count)} tarea(s) vencida(s)`, `${n(overdueTasks.count)} overdue task(s)`)}</small></Link>
      </div>

      <div className={s.sectionTitle}><h2>{pick(lang, "Créditos de IA", "AI credits")}</h2><span><Link href="/admin/workspace/crm/ai-usage">{pick(lang, "Registrar consumo →", "Record usage →")}</Link></span></div>
      {aiUsage.error ? <p className={s.kpi}>{pick(lang, "No se pudo leer el registro de consumo.", "Usage records could not be read.")}</p> : (() => {
        const latest = latestUsage(aiUsage.data);
        return <div className={s.kpis} role="list" aria-label={pick(lang, "Créditos de IA por proveedor", "AI credits by provider")}>
          {(["Claude", "Higgsfield", "Codex"] as const).map(provider => {
            const rows = latest.filter(r => r.provider === provider);
            return <Link key={provider} className={s.kpi} role="listitem" href="/admin/workspace/crm/ai-usage">
              <span>{provider === "Codex" ? "ChatGPT / Codex (OpenAI)" : provider === "Claude" ? pick(lang, "Claude (cuentas personales)", "Claude (personal accounts)") : pick(lang, "Higgsfield (compartido)", "Higgsfield (shared)")}</span>
              {rows.length === 0 ? <><strong>—</strong><small>{pick(lang, "Sin registro. Sin API autorizada: se registra manualmente.", "No record. No authorized API: recorded manually.")}</small></> : rows.map(r => {
                const pct = r.limit_value ? Math.round((Number(r.amount) / Number(r.limit_value)) * 100) : null;
                return <div key={r.unit}>
                  <strong style={pct !== null && pct >= Number(r.threshold) ? { color: "var(--danger)" } : undefined}>{Number(r.amount).toLocaleString(lang === "es" ? "es-US" : "en-US")}{r.limit_value ? ` / ${Number(r.limit_value).toLocaleString(lang === "es" ? "es-US" : "en-US")}` : ""} {r.unit}{pct !== null ? ` · ${pct}%` : ""}</strong>
                  <small>{pick(lang, "Registro manual", "Manual record")} · {r.source} · {pick(lang, "actualizado", "updated")} {formatDate(lang, r.updated_at)} · {pick(lang, "periodo hasta", "period to")} {formatDate(lang, r.period_end)}</small>
                </div>;
              })}
            </Link>;
          })}
        </div>;
      })()}

      <div className={s.sectionTitle}><h2>{pick(lang, "Módulos", "Modules")}</h2><span>{schemaReady ? pick(lang, "Base de datos activa", "Database active") : pick(lang, "Datos de módulos no disponibles", "Module data unavailable")}</span></div>
      <ModuleCards lang={lang} stats={stats} />

      <div className={s.sectionTitle}><h2>{pick(lang, "Operaciones", "Operations")}</h2></div>
      <div className={s.columns}>
        <section className={s.card} aria-labelledby="tasks-title">
          <h2 id="tasks-title"><Icon name="clock" size={18} />{pick(lang, "Tareas pendientes", "Pending tasks")}</h2>
          {upcoming.data && upcoming.data.length > 0 ? (
            <ul className={s.list}>
              {upcoming.data.map(item => (
                <li key={item.id}>
                  <Link href={`/admin/workspace/marketing-hub/${item.project_id}`}>{item.title}</Link>
                  <small style={item.planned_for < today ? { color: "var(--danger)" } : undefined}>{formatDate(lang, item.planned_for)}</small>
                </li>
              ))}
            </ul>
          ) : (
            <div className={s.emptyState}>
              <p>{!upcoming.error ? pick(lang, "No hay contenido planificado para los próximos 14 días.", "Nothing planned for the next 14 days.") : pick(lang, "No se pudo consultar el contenido planificado.", "Planned content could not be loaded.")}</p>
              <Link href="/admin/workspace/marketing-hub">{pick(lang, "Planificar contenido →", "Plan content →")}</Link>
            </div>
          )}
          <h2 style={{ marginTop: 22 }} id="activity-title"><Icon name="spark" size={18} />{pick(lang, "Actividad reciente", "Recent activity")}</h2>
          {audit.data && audit.data.length > 0 ? (
            <ul className={s.list} aria-labelledby="activity-title">
              {audit.data.map(row => {
                const actor = row.actor_id === userId ? pick(lang, "Tú", "You") : pick(lang, "Otro propietario", "Another owner");
                const what = TABLE_LABEL[row.table_name] ?? [row.table_name, row.table_name];
                const op = OP_LABEL[row.operation] ?? [row.operation, row.operation];
                return <li key={row.id}><span>{actor} {pick(lang, ...op)} · {pick(lang, ...what)}{row.summary ? <> · <strong>{row.summary}</strong></> : null}</span><small>{formatDate(lang, row.created_at, true)}</small></li>;
              })}
            </ul>
          ) : <div className={s.emptyState}><p>{audit.error ? pick(lang, "No se pudo consultar la actividad.", "Recent activity could not be loaded.") : pick(lang, "Aún no hay actividad registrada.", "No activity recorded yet.")}</p></div>}
        </section>

        <section className={s.card} aria-labelledby="services-title">
          <h2 id="services-title"><Icon name="globe" size={18} />{pick(lang, "Estado de servicios", "Service status")}</h2>
          <ul className={`${s.list} ${s.services}`}>
            <li><span>Supabase Auth</span><span className={s.pill} data-tone="ok">{pick(lang, "Sesión verificada", "Session verified")}</span></li>
            <li><span>{pick(lang, "Membresía de propietario", "Owner membership")}</span><span className={s.pill} data-tone="ok">RLS</span></li>
            <li><span>{pick(lang, "Base de datos de módulos", "Module database")}</span><span className={s.pill} data-tone={schemaReady ? "ok" : "warn"}>{schemaReady ? pick(lang, "Activa", "Active") : pick(lang, "Pendiente", "Pending")}</span></li>
            <li><span>CRM</span><span className={s.pill} data-tone={crmLeads.error ? "warn" : "ok"}>{crmLeads.error ? pick(lang, "Sin verificar", "Unverified") : pick(lang, "Activo", "Active")}</span></li>
            <li><span>{pick(lang, "Ventas y Clientes 360°", "Sales and 360° clients")}</span><span className={s.pill} data-tone={salesReady ? "ok" : "warn"}>{salesReady ? pick(lang, "Activo", "Active") : pick(lang, "Sin verificar", "Unverified")}</span></li>
            <li><span>{pick(lang, "Acceso con contraseña", "Password sign-in")}</span><span className={s.pill} data-tone={passwordEnabled ? "ok" : "off"}>{passwordEnabled ? pick(lang, "Habilitado", "Enabled") : pick(lang, "Deshabilitado", "Disabled")}</span></li>
            <li><span>{pick(lang, "Integraciones externas", "External integrations")}</span><span className={s.pill} data-tone="off">{connected}/{INTEGRATIONS.length} {pick(lang, "conectadas", "connected")}</span></li>
          </ul>
          <h2 style={{ marginTop: 22 }}><Icon name="spark" size={18} />{pick(lang, "Accesos rápidos", "Quick access")}</h2>
          <div className={s.quick}>
            {projects.data?.filter(p => MODULE_HREF[p.module]).map(p => <Link key={p.id} className={s.pill} href={`${MODULE_HREF[p.module]}/${p.id}`}>{p.name}</Link>)}
            <Link className={s.pill} href="/admin/workspace/crm/clients">{pick(lang, "Clientes 360°", "Clients 360°")}</Link>
            <Link className={s.pill} href="/admin/workspace/crm/leads">{pick(lang, "Leads Pipeline", "Leads Pipeline")}</Link>
            <Link className={s.pill} href="/admin/dev-bridge">Dev Bridge 2.0</Link>
            <Link className={s.pill} href="/admin/security">{pick(lang, "Seguridad", "Security")}</Link>
            <Link className={s.pill} href="/admin/settings">{pick(lang, "Configuración", "Settings")}</Link>
            <Link className={s.pill} href="/admin/profile">{pick(lang, "Perfil", "Profile")}</Link>
          </div>
        </section>
      </div>
    </Suite>
  );
}

type UsageRow = { provider: "Codex" | "Claude" | "Higgsfield"; amount: string; unit: string; period_start: string; period_end: string; limit_value: string | null; threshold: string; source: string; mode: string; created_by: string; updated_at: string };
/** Most recent record per provider and unit; older periods stay in the usage page. */
function latestUsage(rows: UsageRow[]): UsageRow[] {
  const seen = new Set<string>();
  return rows.filter(r => { const k = r.provider + "|" + r.unit; if (seen.has(k)) return false; seen.add(k); return true; });
}
