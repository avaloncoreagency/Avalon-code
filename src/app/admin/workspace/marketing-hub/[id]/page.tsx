import Link from "next/link";
import { notFound } from "next/navigation";
import { Suite } from "@/components/suite/suite";
import { PageHeader, Flash, Panel, Empty, Badge, DbNotice, Tabs, param, statusLabel, statusTone, type SearchParams } from "@/components/os/ui";
import { ProjectSettingsForm } from "@/components/os/projects";
import { MarketingFields, CHANNEL_NAMES, type MarketingItem } from "@/components/os/marketing-fields";
import s from "@/components/os/os.module.css";
import { requireOwner } from "@/lib/auth/session";
import { getLang } from "@/lib/i18n-server";
import { pick, formatDate } from "@/lib/i18n";
import { getProject, run, type Loaded } from "@/lib/os/data";
import { CONTENT_STATUSES, OPEN_CONTENT, isUuid, monthGrid, parseMonth, shiftMonth } from "@/lib/os/domain";
import { integrationsFor } from "@/lib/os/integrations";
import { createMarketingItem, setMarketingStatus } from "../actions";

export const dynamic = "force-dynamic";
const BASE = "/admin/workspace/marketing-hub";
const NEXT_STATUS: Record<string, string> = { idea: "draft", draft: "review", review: "approved", approved: "planned", planned: "published" };
const COLUMNS = "id,title,channel,status,planned_for,body,asset_url,notes,updated_at,version";

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  const view = param(query, "view") === "calendar" ? "calendar" : "board";
  const { supabase } = await requireOwner();
  const lang = await getLang();
  const project = await getProject(supabase, "marketing", id);
  if (!project.error && !project.data) notFound();
  const month = parseMonth(param(query, "month"));
  const monthKey = `${month.year}-${String(month.month).padStart(2, "0")}`;

  let items: Loaded<MarketingItem[]> | null = null;
  if (project.data) {
    let q = supabase.from("os_marketing_items").select(COLUMNS).eq("project_id", id);
    if (view === "calendar") {
      const last = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
      q = q.gte("planned_for", `${monthKey}-01`).lte("planned_for", `${monthKey}-${String(last).padStart(2, "0")}`).order("planned_for");
    } else {
      q = q.order("planned_for", { ascending: true, nullsFirst: false }).order("created_at");
    }
    items = await run<MarketingItem[]>(q.limit(500));
  }
  const rows = items?.data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const goal = typeof project.data?.settings?.goal === "string" ? project.data.settings.goal : "";
  const byDay = new Map<string, MarketingItem[]>();
  for (const r of rows) if (r.planned_for) byDay.set(r.planned_for, [...(byDay.get(r.planned_for) ?? []), r]);
  const weekdays = lang === "es" ? ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const monthLabel = new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(month.year, month.month - 1, 1)));

  return (
    <Suite active="marketing-hub">
      <PageHeader eyebrow="Marketing Hub" title={project.data?.name ?? "—"} description={goal || project.data?.description || undefined} crumbs={[{ href: BASE, label: "Marketing Hub" }]} />
      <Flash lang={lang} ok={param(query, "ok")} error={param(query, "error")} />
      {project.error ? <DbNotice lang={lang} error={project.error} /> : project.data && (
        <>
          <div className={s.stats}>
            <div className={s.stat}><span>{pick(lang, "Contenidos", "Content items")}</span><strong>{view === "board" ? rows.length : "—"}</strong></div>
            <div className={s.stat}><span>{pick(lang, "Abiertos", "Open")}</span><strong>{view === "board" ? rows.filter(r => OPEN_CONTENT(r.status)).length : "—"}</strong></div>
            <div className={s.stat}><span>{pick(lang, "Vencidos", "Overdue")}</span><strong>{rows.filter(r => r.planned_for && r.planned_for < today && OPEN_CONTENT(r.status)).length}</strong></div>
            <div className={s.stat}><span>{pick(lang, "Publicados (manual)", "Published (manual)")}</span><strong>{rows.filter(r => r.status === "published").length}</strong></div>
          </div>
          <Tabs label={pick(lang, "Vista", "View")} active={view} items={[
            { key: "board", href: `${BASE}/${id}`, label: pick(lang, "Planificación", "Planning") },
            { key: "calendar", href: `${BASE}/${id}?view=calendar&month=${monthKey}`, label: pick(lang, "Calendario editorial", "Editorial calendar") },
          ]} />
          <div className={s.split}>
            <div>
              {items?.error ? <DbNotice lang={lang} error={items.error} /> : view === "calendar" ? (
                <Panel title={monthLabel} id="calendar" actions={<div className={s.actions}>
                  <Link className={`${s.btn} ${s.small}`} href={`${BASE}/${id}?view=calendar&month=${shiftMonth(month, -1)}`} aria-label={pick(lang, "Mes anterior", "Previous month")}>←</Link>
                  <Link className={`${s.btn} ${s.small}`} href={`${BASE}/${id}?view=calendar`}>{pick(lang, "Hoy", "Today")}</Link>
                  <Link className={`${s.btn} ${s.small}`} href={`${BASE}/${id}?view=calendar&month=${shiftMonth(month, 1)}`} aria-label={pick(lang, "Mes siguiente", "Next month")}>→</Link>
                </div>}>
                  <div className={s.tableWrap}>
                    <table className={s.calendar}>
                      <thead><tr>{weekdays.map(d => <th key={d} scope="col">{d}</th>)}</tr></thead>
                      <tbody>
                        {monthGrid(month.year, month.month).map((week, w) => (
                          <tr key={w}>
                            {week.map((day, i) => (
                              <td key={i} data-today={day === today ? "true" : undefined}>
                                {day && <><span className={s.dayNum}>{Number(day.slice(8))}</span>
                                  {(byDay.get(day) ?? []).map(item => <Link key={item.id} className={s.event} data-status={item.status} href={`${BASE}/${id}/items/${item.id}`} title={`${item.title} · ${CHANNEL_NAMES[item.channel]}`}>{item.title}</Link>)}</>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              ) : (
                <Panel title={pick(lang, "Contenido de la campaña", "Campaign content")} id="board">
                  {rows.length === 0 ? <Empty title={pick(lang, "Sin contenido planificado", "No content planned")} body={pick(lang, "Añade ideas, borradores o publicaciones con fecha.", "Add ideas, drafts or dated posts.")} /> : (
                    <div className={s.tableWrap}>
                      <table className={s.table}>
                        <thead><tr><th>{pick(lang, "Contenido", "Content")}</th><th>{pick(lang, "Canal", "Channel")}</th><th>{pick(lang, "Fecha", "Date")}</th><th>{pick(lang, "Estado", "Status")}</th><th><span className="sr-only">{pick(lang, "Avanzar", "Advance")}</span></th></tr></thead>
                        <tbody>
                          {rows.map(r => (
                            <tr key={r.id}>
                              <td><Link href={`${BASE}/${id}/items/${r.id}`}>{r.title}</Link></td>
                              <td className={s.meta}>{CHANNEL_NAMES[r.channel]}</td>
                              <td className={s.meta} style={r.planned_for && r.planned_for < today && OPEN_CONTENT(r.status) ? { color: "var(--danger)" } : undefined}>{formatDate(lang, r.planned_for)}</td>
                              <td><Badge tone={statusTone(r.status)}>{statusLabel(lang, r.status)}</Badge></td>
                              <td>{NEXT_STATUS[r.status] && (
                                <form action={setMarketingStatus} className={s.inline}>
                                  <input type="hidden" name="projectId" value={id} /><input type="hidden" name="itemId" value={r.id} /><input type="hidden" name="version" value={r.version} /><input type="hidden" name="status" value={NEXT_STATUS[r.status]} />
                                  <button className={`${s.btnGhost} ${s.small}`} type="submit">→ {statusLabel(lang, NEXT_STATUS[r.status])}</button>
                                </form>
                              )}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className={s.actions} style={{ marginTop: 12 }}>
                    {CONTENT_STATUSES.map(st => <Badge key={st} tone={statusTone(st)}>{statusLabel(lang, st)}: {rows.filter(r => r.status === st).length}</Badge>)}
                  </div>
                </Panel>
              )}
            </div>
            <div>
              <Panel title={pick(lang, "Nuevo contenido", "New content")} id="new-item">
                <form action={createMarketingItem} className={s.form}>
                  <input type="hidden" name="projectId" value={id} />
                  <MarketingFields lang={lang} />
                  <div className={s.actions}><button className={s.btnPrimary} type="submit">{pick(lang, "Añadir", "Add")}</button></div>
                </form>
              </Panel>
              <Panel title={pick(lang, "Canales e integraciones", "Channels and integrations")} id="channels">
                <ul className={s.stack} style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {integrationsFor("marketing").map(i => <li key={i.key} className={s.actions} style={{ justifyContent: "space-between" }}><span>{i.label}</span><Badge>{pick(lang, "No conectado", "Not connected")}</Badge></li>)}
                </ul>
                <p className={s.meta}>{pick(lang, "«Publicado» se marca manualmente. La programación automática requiere conectar y aprobar cada red.", "“Published” is set manually. Automatic scheduling requires connecting and approving each network.")}</p>
              </Panel>
              <Panel title={pick(lang, "Campaña", "Campaign")} id="settings"><ProjectSettingsForm lang={lang} project={project.data} /></Panel>
            </div>
          </div>
        </>
      )}
    </Suite>
  );
}
