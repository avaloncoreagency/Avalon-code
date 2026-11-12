import Link from "next/link";
import { Suite } from "@/components/suite/suite";
import { OpsHeader, ownerName, q, type Query } from "@/components/sales/ui";
import { QuickAdd } from "@/components/crm/intel/quick-add";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { run } from "@/lib/os/data";
import { INDUSTRIES, industryLabel, isIndustry } from "@/lib/crm/intel/industries";
import { intelErrorText } from "@/lib/crm/intel/errors";
import s from "@/components/sales/sales.module.css";
import x from "@/components/crm/intel/intel.module.css";
export const dynamic = "force-dynamic";

type Lead = { id: string; company: string; owner_id: string; created_by: string; stage_id: string; priority: string; industry_key: string | null;
  diagnosis_status: string; lead_score: number | null; lead_grade: string | null; contract_status: string; follow_up_at: string | null;
  next_action: string; last_interaction_at: string | null; created_at: string; updated_at: string; city: string; crm_stages: { label: string; kind: string } | null };
const COLS = "id,company,owner_id,created_by,stage_id,priority,industry_key,diagnosis_status,lead_score,lead_grade,contract_status,follow_up_at,next_action,last_interaction_at,created_at,updated_at,city,crm_stages(label,kind)";
const FILTERS = ["today", "overdue", "new", "diagnosis", "proposal", "contract", "mine", "other", "all", "high"] as const;
type Filter = (typeof FILTERS)[number];

/**
 * Mesa comercial: the daily work panel. Every card is a live count from the database and opens the matching list.
 * No invented figures: a count that cannot be loaded shows "—".
 */
export default async function DeskPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { supabase, userId } = await requireOwner();
  const lang = await getLang();
  const p = await searchParams;
  const filter: Filter = (FILTERS as readonly string[]).includes(q(p, "f") ?? "") ? q(p, "f") as Filter : "today";
  const search = (q(p, "search") ?? "").trim().slice(0, 80);
  const requestedIndustry = q(p, "industry");
  const industry = isIndustry(requestedIndustry) ? requestedIndustry : "";
  const listHref = (f: Filter) => `?${new URLSearchParams({ f, ...(search ? { search } : {}), ...(industry ? { industry } : {}) })}`;
  const now = new Date();
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
  const weekAgo = new Date(now.getTime() - 7 * 864e5).toISOString();
  const base = () => supabase.from("crm_leads").select(COLS, { count: "exact" }).eq("archived", false).eq("audience", "agency_b2b");
  const open = <T extends ReturnType<typeof base>>(b: T) => b.not("stage_id", "in", "(won,lost)");
  const views: Record<Filter, () => ReturnType<typeof base>> = {
    today: () => open(base()).gte("follow_up_at", startOfDay.toISOString()).lte("follow_up_at", endOfDay.toISOString()),
    overdue: () => open(base()).lt("follow_up_at", now.toISOString()),
    new: () => base().gte("created_at", weekAgo).eq("stage_id", "new"),
    diagnosis: () => open(base()).neq("diagnosis_status", "complete"),
    proposal: () => base().in("stage_id", ["proposal", "negotiation"]),
    contract: () => open(base()).in("contract_status", ["draft", "internal_review", "sent_for_signature", "signed_pending_verification"]),
    mine: () => open(base()).eq("owner_id", userId),
    other: () => open(base()).neq("owner_id", userId),
    all: () => base(),
    high: () => open(base()).eq("priority", "high"),
  };
  const counted: Filter[] = ["today", "overdue", "new", "diagnosis", "proposal", "contract"];
  // Filters are applied to the displayed list, not to the six global dashboard counters.
  // Escape SQL LIKE wildcards so user input is treated as a literal company-name substring.
  let listQuery = views[filter]();
  if (search) listQuery = listQuery.ilike("company", `%${search.replace(/[\\%_]/g, (char) => "\\" + char)}%`);
  if (industry) listQuery = listQuery.eq("industry_key", industry);
  const [owners, list, ...counts] = await Promise.all([
    run<{ user_id: string; email: string }[]>(supabase.rpc("crm_owner_directory")),
    run<Lead[]>(listQuery.order(filter === "all" || filter === "new" ? "created_at" : "follow_up_at", { ascending: filter !== "all" && filter !== "new", nullsFirst: false }).limit(100)),
    ...counted.map(f => views[f]().limit(1)),
  ]);
  const ownerList = owners.data ?? [];
  const cardText: Record<Filter, [string, string]> = {
    today: ["Hoy", "Today"], overdue: ["Seguimientos vencidos", "Overdue follow-ups"], new: ["Nuevos leads (7 días)", "New leads (7 days)"],
    diagnosis: ["Diagnósticos incompletos", "Incomplete diagnoses"], proposal: ["Propuestas pendientes", "Pending proposals"], contract: ["Contratos pendientes", "Pending contracts"],
    mine: ["Mis leads", "My leads"], other: ["Leads del otro propietario", "Other owner's leads"], all: ["Todos", "All"], high: ["Alta prioridad", "High priority"],
  };
  const schemaPending = list.error === "schema_pending";
  return (
    <Suite active="crm">
      <section className={s.hud} aria-labelledby="desk-title">
        <OpsHeader lang={lang} active="" crm="desk" eyebrow={pick(lang, "CRM · Mesa comercial", "CRM · Sales desk")}
          title={pick(lang, "Mesa comercial", "Sales desk")}
          lead={pick(lang, "Registrar, diagnosticar, calificar y dar seguimiento a prospectos de Avalon. Miguel y Samuel ven los mismos leads; cada cambio queda con autor.", "Register, diagnose, score and follow up Avalon prospects. Miguel and Samuel see the same leads; every change keeps its author.")} />
        {schemaPending && <p className={s.flash} data-tone="warn" role="alert">{intelErrorText(lang, "schema_pending")}</p>}
        <div className={s.stats}>
          {counted.map((f, i) => <Link key={f} href={listHref(f)} className={x.kpiLink} aria-current={filter === f ? "page" : undefined}>
            <span>{pick(lang, ...cardText[f])}</span><strong>{counts[i].error ? "—" : counts[i].count ?? 0}</strong></Link>)}
        </div>
        <div className={x.split}>
          <section className={s.panel} aria-labelledby="qa-title">
            <h2 id="qa-title">{pick(lang, "Quick Add · nuevo prospecto", "Quick Add · new prospect")}</h2>
            <QuickAdd lang={lang} owners={ownerList} me={userId} />
          </section>
          <section className={s.panel} aria-labelledby="list-title">
            <header><h2 id="list-title">{pick(lang, ...cardText[filter])}</h2></header>
            <form method="get" className={s.toolbar} role="search" aria-label={pick(lang, "Buscar leads", "Search leads")}>
              <input type="hidden" name="f" value={filter} />
              <label><span>{pick(lang, "Buscar negocio", "Business name")}</span>
                <input type="search" name="search" maxLength={80} defaultValue={search} placeholder={pick(lang, "Nombre de empresa", "Company name")} />
              </label>
              <label><span>{pick(lang, "Industria", "Industry")}</span>
                <select name="industry" defaultValue={industry}>
                  <option value="">{pick(lang, "Todas las industrias", "All industries")}</option>
                  {INDUSTRIES.map(option => <option key={option.key} value={option.key}>{option.label[lang]}</option>)}
                </select>
              </label>
              <button type="submit" className={s.button}>{pick(lang, "Buscar", "Search")}</button>
              {(search || industry) && <Link href={`?f=${filter}`} className={s.button}>{pick(lang, "Limpiar", "Clear")}</Link>}
            </form>
            <nav className={x.tabs} aria-label={pick(lang, "Filtros", "Filters")}>
              {(["mine", "other", "all", "high", "diagnosis", "contract"] as Filter[]).map(f => <Link key={f} href={listHref(f)} aria-current={filter === f ? "page" : undefined}>{pick(lang, ...cardText[f])}</Link>)}
            </nav>
            {list.error && !schemaPending && <p className={s.flash} data-tone="error" role="alert">{intelErrorText(lang, "unavailable")}</p>}
            {list.data && list.data.length === 0 && <p className={s.empty}>{pick(lang, "No hay leads en esta vista.", "No leads in this view.")}</p>}
            {list.data && list.data.length === 100 && <p className={s.muted} role="status">{pick(lang, "Se muestran los primeros 100 resultados de esta vista; afina los filtros para localizar otros negocios.", "Showing the first 100 results in this view; refine the filters to find other businesses.")}</p>}
            <ul className={s.list} style={{ marginTop: 12 }}>
              {(list.data ?? []).map(l => {
                const overdue = l.follow_up_at && l.follow_up_at < now.toISOString() && l.crm_stages?.kind === "open";
                return <li key={l.id}>
                  <div className={x.leadRow}>
                    <Link href={`/admin/workspace/crm/lead/${l.id}`}>{l.company}</Link>
                    <span className={s.tag} data-tone={l.lead_grade === "A" ? "ok" : l.lead_grade === "B" ? "info" : l.lead_grade === "insufficient" || !l.lead_grade ? "neutral" : "warn"}>
                      {l.lead_grade === "insufficient" || l.lead_grade === null ? pick(lang, "Sin puntuar", "Unscored") : `${l.lead_grade} · ${l.lead_score}`}</span>
                  </div>
                  <span className={s.muted}>
                    {industryLabel(l.industry_key, lang)} · {l.crm_stages?.label ?? l.stage_id} · {pick(lang, "Resp.", "Owner")} {ownerName(ownerList, l.owner_id)}
                    {l.priority === "high" ? ` · ${pick(lang, "Alta prioridad", "High priority")}` : ""}
                  </span>
                  <span className={s.muted} style={overdue ? { color: "#ffd3dc" } : undefined}>
                    {l.follow_up_at ? `${pick(lang, "Seguimiento", "Follow-up")}: ${formatDate(lang, l.follow_up_at, true)}${overdue ? ` (${pick(lang, "vencido", "overdue")})` : ""}` : pick(lang, "Sin seguimiento programado", "No follow-up scheduled")}
                    {l.next_action ? ` · ${l.next_action}` : ""}
                  </span>
                </li>;
              })}
            </ul>
          </section>
        </div>
      </section>
    </Suite>
  );
}
