"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  sections,
  scoreProspect,
  type Section,
  type Entity,
  type Row,
  type Stage,
} from "@/lib/crm/domain";
import { RecordForm } from "./record-form";
import { CrmNavigation } from "./navigation";
import { TitanRadar } from "./titan-radar";
import { LeadBoard } from "./lead-board";
import { LeadTimeline } from "./lead-timeline";
import s from "./crm.module.css";
export const crmSections = sections;
export type CrmSection = Section;
type Metrics = {
  created: number;
  conversion: number;
  open: number;
  won: number;
  average: number;
  completed: number;
  pending: number;
  overdue: number;
};
type Payload = {
  rows?: Row[];
  count?: number;
  stages: Stage[];
  userId: string;
  metrics?: Metrics;
  byOwner?: ({ label: string } & Metrics)[];
  bySource?: ({ label: string } & Metrics)[];
  byStage?: { label: string; count: number }[];
};
const endpoint = "/admin/workspace/crm/api";
const money = (n: unknown) =>
  new Intl.NumberFormat("es", { style: "currency", currency: "USD" }).format(
    Number(n ?? 0),
  );
const stamp = (v: unknown, zone?: string) =>
  v
    ? new Intl.DateTimeFormat("es", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: zone,
      }).format(new Date(String(v)))
    : "—";
async function request(body: unknown) {
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await r.json();
  if (!r.ok) {
    // A duplicate lead is reported with the lead itself, so the UI can offer to open or link it.
    throw Object.assign(new Error(result.error ?? "No se pudo guardar"), { lead: result.code === "lead_exists" ? result.lead : undefined });
  }
  return result;
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={s.card}>
      <div className={s.muted}>{label}</div>
      <div className={s.metric}>{value}</div>
    </div>
  );
}
export function Crm({ section = "leads" }: { section?: CrmSection }) {
  const entity: Entity =
    section === "calendar"
      ? "events"
      : section === "hunter"
        ? "prospects"
        : section === "ai-usage"
          ? "usage"
          : "leads";
  const [data, setData] = useState<Payload | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [existingLead, setExistingLead] = useState<{ prospectId: string; id: string; company: string } | null>(null);
  const [revision, setRevision] = useState(0),
    [page, setPage] = useState(0),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [view, setView] = useState("kanban");
  const [editor, setEditor] = useState<{
      entity: Entity;
      row: Row | null;
    } | null>(null),
    [detail, setDetail] = useState<Row | null>(null);
  const [calendarView, setCalendarView] = useState("month"),
    [day, setDay] = useState(() => new Date().toISOString().slice(0, 10)),
    [zone, setZone] = useState("UTC");
  useEffect(
    () => setZone(Intl.DateTimeFormat().resolvedOptions().timeZone),
    [],
  );
  const reload = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      ...filters,
      entity: section === "kpis" ? "kpis" : entity,
      page: String(page),
    });
    fetch(`${endpoint}?${params}`, { signal: controller.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "No disponible");
        setData(d);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message);
          setData(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [entity, section, filters, page, revision]);
  async function mutate(body: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    setExistingLead(null);
    try {
      const result = await request(body);
      setNotice("Guardado correctamente.");
      reload();
      return result;
    } catch (e) {
      setError((e as Error).message);
      const lead = (e as { lead?: { id: string; company: string } }).lead;
      const prospectId = (body as { id?: string } | null)?.id;
      if (lead && prospectId) setExistingLead({ prospectId, id: lead.id, company: lead.company });
      throw e;
    } finally {
      setBusy(false);
    }
  }
  function action(body: unknown) {
    void mutate(body).catch(() => {});
  }
  function filter(key: string, value: string) {
    setPage(0);
    setFilters((prev) => ({ ...prev, [key]: value }));
  }
  const rows = data?.rows ?? [],
    stages = data?.stages ?? [];
  const edit = (row: Row | null, kind: Entity = entity) => {
    setEditor({ entity: kind, row });
  };
  const current = sections.find((x) => x.slug === section)!;
  function table() {
    return (
      <div className={s.tableWrap}>
        <table className={s.table}>
          <caption>
            {current.label} · página {page + 1}
          </caption>
          <thead>
            <tr>
              <th>Registro</th>
              <th>Detalle</th>
              <th>Estado / valor</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)}>
                <td>
                  <strong>
                    {String(row.company ?? row.title ?? row.provider)}
                  </strong>
                  <br />
                  <small>{String(row.contact ?? "")}</small>
                </td>
                <td>
                  {entity === "events" ? (
                    <>
                      {stamp(row.starts_at, zone)} — {stamp(row.ends_at, zone)}
                      <br />
                      {String(row.participants || "Sin participantes")}
                      <br />
                      {row.lead_id && (
                        <Link href={`/admin/workspace/crm?lead=${row.lead_id}`}>
                          Abrir lead
                        </Link>
                      )}
                    </>
                  ) : entity === "prospects" ? (
                    <>
                      {String(row.industry)} · {String(row.location)}
                      <br />
                      {String(row.opportunity)}
                      <br />
                      Fuente: {String(row.source)} · {stamp(row.acquired_at)}
                    </>
                  ) : entity === "usage" ? (
                    <>
                      Manual · {String(row.source)}
                      <br />
                      {stamp(row.period_start)} → {stamp(row.period_end)}
                      <br />
                      Actualizado: {stamp(row.updated_at)}
                    </>
                  ) : (
                    <>
                      {String(row.email ?? "Sin correo")}
                      <br />
                      {String(row.phone)}
                      <br />
                      Responsable: {String(row.owner_id)}
                      <br />
                      Seguimiento: {stamp(row.follow_up_at)}
                    </>
                  )}
                </td>
                <td>
                  {entity === "leads" ? (
                    <>
                      {stages.find((s) => s.id === row.stage_id)?.label}
                      <br />
                      {money(row.value)}
                    </>
                  ) : entity === "prospects" ? (
                    <>
                      {String(row.status)}
                      <br />
                      <span title={scoreProspect(row).reasons.join("; ")}>
                        {scoreProspect(row).score}/100 · completitud
                      </span>
                      <details>
                        <summary>Explicar puntuación</summary>
                        {scoreProspect(row).reasons.map((reason) => (
                          <p key={reason}>{reason}</p>
                        ))}
                      </details>
                      {row.lead_id && (
                        <Link href={`/admin/workspace/crm?lead=${row.lead_id}`}>
                          Ver lead convertido
                        </Link>
                      )}
                    </>
                  ) : entity === "usage" ? (
                    <Usage row={row} />
                  ) : (
                    String(row.status)
                  )}
                </td>
                <td>
                  <div className={s.actions}>
                    {!(
                      entity === "prospects" && row.status === "converted"
                    ) && (
                      <button disabled={busy} onClick={() => edit(row)}>
                        Editar
                      </button>
                    )}
                    {entity === "leads" && (
                      <>
                        <button onClick={() => setDetail(row)}>
                          Notas e historial
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (
                              confirm(
                                row.archived
                                  ? "¿Restaurar este lead?"
                                  : "¿Archivar este lead? Se conservará su historial.",
                              )
                            )
                              action({
                                entity,
                                id: row.id,
                                version: row.version,
                                values: { ...row, archived: !row.archived },
                              });
                          }}
                        >
                          {row.archived ? "Restaurar" : "Archivar"}
                        </button>
                      </>
                    )}
                    {entity === "events" && row.status === "scheduled" && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (confirm("¿Cancelar este evento interno?"))
                            action({
                              entity,
                              id: row.id,
                              version: row.version,
                              values: { ...row, status: "cancelled" },
                            });
                        }}
                      >
                        Cancelar
                      </button>
                    )}
                    {entity === "prospects" && row.status === "approved" && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          action({ action: "convert", id: row.id })
                        }
                      >
                        Convertir en lead
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className={s.wrap}>
      <header className={s.head}>
        <div>
          <div className={s.eyebrow}>Avalon OS / CRM</div>
          <h1 className={s.title}>{current.label}</h1>
          <p className={s.subtitle}>
            Operaciones comerciales de Avalon Core Agency.
          </p>
        </div>
        <div className={s.actions}>
          <Link href="/admin/workspace/crm" className={s.link}>
            Inicio del CRM
          </Link>
          <Link href="/admin/dashboard" className={s.link}>
            ← Dashboard
          </Link>
        </div>
      </header>
      <CrmNavigation active={section} />
      {section === "hunter" && <TitanRadar onChanged={reload} />}
      <p className={s.muted}>
        Datos persistidos de la agencia. Valores comerciales estimados en USD;
        no representan ingresos cobrados.
      </p>
      {existingLead && (
        <div role="status" className={s.notice} data-testid="existing-lead">
          Lead existente:{" "}
          <Link href={`/admin/workspace/crm/leads?lead=${existingLead.id}`}>{existingLead.company}</Link>{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => action({ action: "link_existing", id: existingLead.prospectId })}
          >
            Vincular al lead existente
          </button>
        </div>
      )}
      {error && (
        <div role="alert" className={s.notice}>
          {error} <button onClick={reload}>Reintentar</button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      <section className={s.panel} aria-label="Filtros">
        <form
          className={s.filters}
          onSubmit={(e) => {
            e.preventDefault();
            setPage(0);
            setFilters(
              Object.fromEntries(new FormData(e.currentTarget)) as Record<
                string,
                string
              >,
            );
          }}
        >
          {(entity === "leads" || entity === "prospects") && (
            <>
              <label>
                Buscar empresa, contacto o correo
                <input name="q" defaultValue={filters.q} />
              </label>
              {section !== "hunter" && <label>
                Responsable (UUID)
                <input name="owner" defaultValue={filters.owner} />
              </label>}
              <label>
                Origen exacto
                <input name="source" defaultValue={filters.source} />
              </label>
            </>
          )}
          <label>
            Desde (UTC)
            <input type="date" name="from" defaultValue={filters.from} />
          </label>
          <label>
            Hasta (UTC)
            <input type="date" name="to" defaultValue={filters.to} />
          </label>
          {section === "leads" && (
            <>
              <label>
                Etapa
                <select name="stage" defaultValue={filters.stage}>
                  <option value="">Todas</option>
                  {stages.map((x) => (
                    <option value={x.id} key={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Mostrar
                <select name="archived" defaultValue={filters.archived}>
                  <option value="false">Activos</option>
                  <option value="true">Archivados</option>
                </select>
              </label>
              <label>
                Orden
                <select name="sort" defaultValue={filters.sort}>
                  <option value="created_at">Más recientes</option>
                  <option value="company">Empresa Z–A</option>
                  <option value="value">Mayor valor</option>
                </select>
              </label>
            </>
          )}
          {section === "hunter" &&
            ["industry", "location", "opportunity"].map((key, i) => (
              <label key={key}>
                {["Industria", "Ubicación", "Oportunidad"][i]}
                <input name={key} defaultValue={filters[key]} />
              </label>
            ))}
          <button type="submit">Aplicar filtros</button>
        </form>
      </section>
      {loading ? (
        <p role="status">Cargando CRM…</p>
      ) : (
        data && (
          <>
            {section !== "kpis" && (
              <div className={s.actions}>
                <button onClick={() => edit(null)}>
                  Crear{" "}
                  {entity === "leads"
                    ? "lead"
                    : entity === "events"
                      ? "evento"
                      : entity === "prospects"
                        ? "prospecto"
                        : "registro manual"}
                </button>
                {section === "leads" && (
                  <>
                    <button
                      aria-pressed={view === "kanban"}
                      onClick={() => setView("kanban")}
                    >
                      Kanban
                    </button>
                    <button
                      aria-pressed={view === "table"}
                      onClick={() => setView("table")}
                    >
                      Tabla
                    </button>
                  </>
                )}
                <button onClick={reload}>Actualizar</button>
              </div>
            )}
            {editor && (
              <RecordForm
                key={`${editor.entity}-${editor.row?.id ?? "new"}`}
                entity={editor.entity}
                row={editor.row}
                userId={data.userId}
                stages={stages}
                busy={busy}
                onClose={() => setEditor(null)}
                onSave={async (values) => {
                  await mutate({
                    entity: editor.entity,
                    id: editor.row?.id,
                    version: editor.row?.version,
                    values,
                  });
                  setEditor(null);
                }}
              />
            )}
            {section === "leads" && <LeadLink onOpen={setDetail} />}
            {detail && (
              <LeadTimeline
                lead={rows.find((r) => r.id === detail.id) ?? detail}
                stages={stages}
                revision={revision}
                onClose={() => setDetail(null)}
                onEdit={() => {
                  edit(rows.find((r) => r.id === detail.id) ?? detail);
                  setDetail(null);
                }}
                onEditActivity={(a) => {
                  edit(a, "activities");
                  setDetail(null);
                }}
              />
            )}
            {section === "leads" &&
              (view === "table" ? (
                table()
              ) : (
                <LeadBoard
                  stages={stages}
                  leads={rows}
                  total={data.count ?? rows.length}
                  page={page}
                  busy={busy}
                  currentOwnerId={data.userId}
                  onEdit={(lead) => edit(lead)}
                  onDetail={setDetail}
                  onMove={(lead, targetId) => {
                    const target = stages.find((stage) => stage.id === targetId);
                    if (!target || lead.stage_id === targetId) return;
                    if (target.kind === "lost") {
                      // Preserve the existing loss-reason validation workflow.
                      edit({ ...lead, stage_id: targetId });
                      return;
                    }
                    action({
                      entity: "leads",
                      id: lead.id,
                      version: lead.version,
                      values: { ...lead, stage_id: targetId },
                    });
                  }}
                />
              ))}
            {section === "calendar" && (
              <>
                <div className={s.filters}>
                  <label>
                    Vista
                    <select
                      value={calendarView}
                      onChange={(e) => setCalendarView(e.target.value)}
                    >
                      <option value="month">Mensual</option>
                      <option value="week">Semanal</option>
                      <option value="day">Diaria</option>
                    </select>
                  </label>
                  <label>
                    Fecha
                    <input
                      type="date"
                      value={day}
                      onChange={(e) => {
                        if (e.target.value) setDay(e.target.value);
                      }}
                    />
                  </label>
                  <label>
                    Zona de visualización
                    <select
                      value={zone}
                      onChange={(e) => setZone(e.target.value)}
                    >
                      {[
                        ...new Set([
                          Intl.DateTimeFormat().resolvedOptions().timeZone,
                          "UTC",
                          "America/New_York",
                          "America/Bogota",
                          "Europe/Madrid",
                        ]),
                      ].map((z) => (
                        <option key={z}>{z}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    onClick={() => {
                      const d = new Date(day + "T12:00:00Z");
                      d.setUTCDate(
                        calendarView === "month"
                          ? 1
                          : d.getUTCDate() -
                              (calendarView === "week" ? d.getUTCDay() : 0),
                      );
                      const end = new Date(d);
                      if (calendarView === "month")
                        end.setUTCMonth(end.getUTCMonth() + 1);
                      else
                        end.setUTCDate(
                          end.getUTCDate() + (calendarView === "week" ? 7 : 1),
                        );
                      d.setUTCDate(d.getUTCDate() - 1);
                      filter("from", d.toISOString().slice(0, 10));
                      filter("to", end.toISOString().slice(0, 10));
                    }}
                  >
                    Cargar periodo
                  </button>
                </div>
                <Calendar
                  rows={rows}
                  day={day}
                  view={calendarView}
                  zone={zone}
                  onEdit={edit}
                />
                <p className={s.muted}>
                  Conflictos bloqueados para el responsable y participantes con
                  el mismo nombre registrado. Usa nombres consistentes. Sin
                  sincronización externa.
                </p>
                {table()}
              </>
            )}
            {section === "hunter" && (
              <>
                <section className={s.panel}>
                  <h2>Importar CSV para revisión</h2>
                  <p>
                    Máximo 200 filas / 500 KB. Cabeceras:
                    company,contact,email,phone,source,industry,location,opportunity.
                    Empresa, fuente y oportunidad son obligatorias. Todos entran
                    pendientes; un duplicado rechaza el lote completo.
                  </p>
                  <label>
                    Archivo CSV
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      disabled={busy}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 500000) {
                          setError("CSV máximo 500 KB");
                          return;
                        }
                        action({ action: "import", csv: await file.text() });
                        e.target.value = "";
                      }}
                    />
                  </label>
                </section>
                <section className={s.panel} aria-labelledby="saved-prospects">
                  <h2 id="saved-prospects">Prospectos guardados · revisar y llamar</h2>
                  <p className={s.muted}>Completa el contacto y la necesidad real, cambia la revisión a Aprobado y pasa el prospecto al pipeline cuando esté calificado.</p>
                  <div className={s.radarSavedGrid}>
                    {rows.map(row => (
                      <article key={String(row.id)} className={s.radarCard}>
                        <div className={s.radarCardTop}>
                          <div>
                            <h3>{String(row.company ?? "Sin nombre")}</h3>
                            <small>{String(row.industry ?? "")} · {String(row.location ?? "")}</small>
                          </div>
                          <span className={s.radarScore}>{row.status === "approved" ? "Aprobado" : row.status === "converted" ? "En pipeline" : row.status === "rejected" ? "Descartado" : "Pendiente"}</span>
                        </div>
                        <p className={s.radarOpportunity}>{String(row.opportunity ?? "Oportunidad por verificar")}</p>
                        <div className={s.radarContacts}>
                          {row.phone ? <a href={"tel:" + String(row.phone)}>{String(row.phone)}</a> : <span>Teléfono pendiente</span>}
                          {row.email ? <a href={"mailto:" + String(row.email)}>{String(row.email)}</a> : <span>Correo pendiente</span>}
                          {row.contact ? <span>Contacto: {String(row.contact)}</span> : <span>Decisor: sin verificar</span>}
                        </div>
                        <div className={s.actions}>
                          {row.status !== "converted" && <>
                            <button disabled={busy} onClick={() => edit(row)}>{row.status === "pending" ? "Revisar y calificar" : "Editar ficha"}</button>
                            {row.status === "approved" && <button disabled={busy} onClick={() => action({ action: "convert", id: row.id })}>Pasar al pipeline</button>}
                          </>}
                          {row.status === "converted" && row.lead_id &&
                            <Link href={"/admin/workspace/crm/leads?lead=" + String(row.lead_id)} className={s.link}>Abrir lead</Link>}
                        </div>
                        <small className={s.muted}>Fuente: {String(row.source ?? "manual")} · {stamp(row.acquired_at)}</small>
                      </article>
                    ))}
                  </div>
                </section>
              </>
            )}
            {section === "ai-usage" && (
              <>
                <div className={s.grid}>
                  {["Codex", "Claude", "Higgsfield"].map((provider) => (
                    <section className={s.panel} key={provider}>
                      <h2>{provider}</h2>
                      <strong>No conectado</strong>
                      <p>
                        Sin fuente automática autorizada. Los registros
                        siguientes son manuales.
                      </p>
                    </section>
                  ))}
                </div>
                {table()}
              </>
            )}
            {section === "kpis" && data.metrics && (
              <>
                <div className={s.cards}>
                  {Object.entries({
                    created: "Leads creados",
                    conversion: "Conversión (%)",
                    open: "Pipeline abierto estimado",
                    won: "Oportunidades ganadas (estimado)",
                    average: "Valor promedio estimado",
                    completed: "Actividades completadas",
                    pending: "Actividades pendientes",
                    overdue: "Seguimientos vencidos",
                  }).map(([key, label]) => (
                    <Metric
                      key={key}
                      label={label}
                      value={
                        ["open", "won", "average"].includes(key)
                          ? money(data.metrics![key as keyof Metrics])
                          : Number(data.metrics![key as keyof Metrics]).toFixed(
                              key === "conversion" ? 1 : 0,
                            )
                      }
                    />
                  ))}
                </div>
                <section className={s.panel}>
                  <h2>Leads por etapa</h2>
                  {data.byStage?.map((x) => (
                    <p key={x.label}>
                      {x.label}: {x.count}
                    </p>
                  ))}
                </section>
                {[
                  ["Por responsable", data.byOwner],
                  ["Por origen", data.bySource],
                ].map(([title, groups]) => (
                  <section key={String(title)} className={s.panel}>
                    <h2>{String(title)}</h2>
                    {(groups as Payload["byOwner"])?.map((g) => (
                      <p key={g.label}>
                        {g.label}: {g.created} leads · {g.conversion.toFixed(1)}
                        % conversión · {money(g.won)} ganado estimado
                      </p>
                    ))}
                  </section>
                ))}
                <p className={s.muted}>
                  Cohorte: leads activos creados entre las fechas UTC elegidas.
                  Conversión = ganados / leads de la cohorte. Valor promedio =
                  valor total / leads. Actividades pertenecientes a esos leads;
                  vencidos = seguimiento anterior a ahora en etapas abiertas. Se
                  excluyen archivados. Los filtros no representan fecha de
                  cierre ni ingresos cobrados.
                </p>
              </>
            )}
            {section !== "kpis" && (
              <>
                <p role="status">
                  {data.count ?? 0} registros · página {page + 1}. Tablero,
                  calendario y tabla muestran hasta 50 registros de esta página.
                </p>
                {!rows.length && <p>No hay registros para estos filtros.</p>}
                <div className={s.actions}>
                  <button
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Anterior
                  </button>
                  <button
                    disabled={(page + 1) * 50 >= (data.count ?? 0)}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Siguiente
                  </button>
                </div>
              </>
            )}
          </>
        )
      )}
    </div>
  );
}
function Usage({ row }: { row: Row }) {
  const pct =
    row.limit_value && Number(row.limit_value) > 0
      ? (Number(row.amount) / Number(row.limit_value)) * 100
      : null;
  return (
    <>
      {String(row.amount)} {String(row.unit)}
      <br />
      Límite:{" "}
      {row.limit_value == null ? "Sin configurar" : String(row.limit_value)}
      <br />
      {pct == null ? "Porcentaje no calculable" : `${pct.toFixed(1)}%`}
      {pct != null && pct >= Number(row.threshold) && (
        <strong> · Umbral {String(row.threshold)}% superado</strong>
      )}
    </>
  );
}
function Calendar({
  rows,
  day,
  view,
  zone,
  onEdit,
}: {
  rows: Row[];
  day: string;
  view: string;
  zone: string;
  onEdit: (r: Row) => void;
}) {
  const start = new Date(day + "T12:00:00Z");
  if (view === "month") start.setUTCDate(1);
  if (view === "week") start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const count =
    view === "month"
      ? new Date(start.getUTCFullYear(), start.getUTCMonth() + 1, 0).getDate()
      : view === "week"
        ? 7
        : 1;
  const dayKey = (v: unknown) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(String(v)));
  return (
    <div className={s.calendar}>
      {Array.from({ length: count }, (_, i) => {
        const d = new Date(start);
        d.setUTCDate(d.getUTCDate() + i);
        const key = d.toISOString().slice(0, 10);
        return (
          <section className={s.card} key={key}>
            <h3>{key}</h3>
            {rows
              .filter(
                (r) =>
                  dayKey(r.starts_at) <= key &&
                  dayKey(
                    new Date(Date.parse(String(r.ends_at)) - 1).toISOString(),
                  ) >= key,
              )
              .map((r) => (
                <button
                  className={s.event}
                  key={String(r.id)}
                  onClick={() => onEdit(r)}
                >
                  {String(r.title)}
                  <small>
                    {stamp(r.starts_at, zone)} · {String(r.status)}
                  </small>
                </button>
              ))}
          </section>
        );
      })}
    </div>
  );
}
function LeadLink({ onOpen }: { onOpen: (r: Row) => void }) {
  const [error, setError] = useState("");
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("lead");
    if (!id) return;
    const controller = new AbortController();
    const fetchLead = async (archived: boolean) => {
      const response = await fetch(`${endpoint}?entity=leads&id=${encodeURIComponent(id)}&archived=${archived}`, { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No disponible");
      return data.rows?.find((lead: Row) => lead.id === id) as Row | undefined;
    };
    fetchLead(false)
      .then(async lead => lead || await fetchLead(true))
      .then(lead => {
        if (controller.signal.aborted) return;
        if (lead) onOpen(lead);
        else setError("Lead no disponible en los registros autorizados.");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [onOpen]);
  return error ? <p role="alert">{error}</p> : null;
}
