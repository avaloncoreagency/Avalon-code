"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { Row, Stage } from "@/lib/crm/domain";
import s from "./pipeline.module.css";

type Owner = { user_id: string; email: string };
type Meta = { owners: Owner[]; next: Record<string, string | null> };
type Entry = { id: string; at: string; type: "stage" | "activity" | "file"; data: Record<string, unknown> };
const base = "/admin/workspace/crm/pipeline";
const money = (n: unknown) => new Intl.NumberFormat("es", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n ?? 0));
const when = (v: unknown) => (v ? new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(String(v))) : "—");
const initials = (email?: string) => (email ?? "?").split("@")[0].slice(0, 2).toUpperCase();
const duration = (sec: unknown) => {
  const n = Number(sec ?? 0);
  if (n < 3600) return `${Math.max(1, Math.round(n / 60))} min`;
  if (n < 86400) return `${Math.round(n / 3600)} h`;
  return `${Math.round(n / 86400)} d`;
};
const KIND_LABEL: Record<string, string> = { note: "Nota", call: "Llamada", email: "Email", whatsapp: "WhatsApp", meeting: "Reunión", task: "Tarea", system: "Sistema" };
const kb = (n: unknown) => (Number(n) < 1024 * 1024 ? `${Math.max(1, Math.round(Number(n) / 1024))} KB` : `${(Number(n) / 1048576).toFixed(1)} MB`);

/** Activity status of a card: next pending activity overdue (red), scheduled (green) or none (gray). */
export function activityTone(due: string | null | undefined, hasPending: boolean, now = Date.now()) {
  if (!hasPending) return "none";
  return due && new Date(due).getTime() < now ? "overdue" : "planned";
}

export function PipelineBoard({ rows, stages, busy, onMove, onEdit, revision }: {
  rows: Row[]; stages: Stage[]; busy: boolean; revision: number;
  onMove: (lead: Row, stageId: string) => void; onEdit: (lead: Row) => void;
}) {
  const [meta, setMeta] = useState<Meta>({ owners: [], next: {} });
  const [over, setOver] = useState<string | null>(null);
  const [open, setOpen] = useState<Row | null>(null);
  const dragged = useRef<Row | null>(null);
  const loadMeta = useCallback(() => {
    fetch(base).then(r => (r.ok ? r.json() : null)).then(d => d && setMeta({ owners: d.owners, next: d.next })).catch(() => undefined);
  }, []);
  useEffect(loadMeta, [loadMeta, revision]);
  const columns = useMemo(() => stages.filter(st => (st as Stage & { active?: boolean }).active !== false || rows.some(l => l.stage_id === st.id)).map(st => {
    const leads = rows.filter(l => l.stage_id === st.id);
    return { stage: st, leads, total: leads.reduce((t, l) => t + Number(l.value ?? 0), 0) };
  }), [rows, stages]);
  const drop = (e: DragEvent, stageId: string) => {
    e.preventDefault();
    setOver(null);
    const lead = dragged.current;
    dragged.current = null;
    if (lead && lead.stage_id !== stageId && !busy) onMove(lead, stageId);
  };
  const current = open ? rows.find(l => l.id === open.id) ?? open : null;
  return (
    <div className={s.wrap}>
      <p className={s.hint}>Arrastra una tarjeta a otra etapa o usa «Mover a» en cada tarjeta. Pulsa la tarjeta para ver su historial.</p>
      <div className={s.board} role="list" aria-label="Pipeline de leads">
        {columns.map(({ stage, leads, total }) => (
          <section key={stage.id} role="listitem" aria-label={`Etapa ${stage.label}`} className={s.column} data-kind={stage.kind} data-over={over === stage.id}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== stage.id) setOver(stage.id); }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
            onDrop={e => drop(e, stage.id)}>
            <header className={s.colHead}>
              <h3>{stage.label}</h3>
              <p>{money(total)} · {leads.length} {leads.length === 1 ? "lead" : "leads"}</p>
            </header>
            <ul className={s.cards}>
              {leads.map(l => {
                const id = String(l.id), owner = meta.owners.find(o => o.user_id === l.owner_id);
                const tone = activityTone(meta.next[id], id in meta.next);
                return (
                  <li key={id} className={s.card} draggable={!busy} data-lead={id}
                    onDragStart={e => { dragged.current = l; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); }}
                    onDragEnd={() => { dragged.current = null; setOver(null); }}>
                    <button type="button" className={s.cardMain} onClick={() => setOpen(l)} aria-label={`Abrir historial de ${l.company}`}>
                      <strong>{String(l.company)}</strong>
                      {l.contact ? <small>{String(l.contact)}</small> : null}
                    </button>
                    <div className={s.cardFoot}>
                      <span className={s.avatar} title={owner?.email ?? "Responsable"}>{initials(owner?.email)}</span>
                      <span className={s.value}>{money(l.value)}</span>
                      <span className={s.dot} data-tone={tone} role="img"
                        aria-label={tone === "overdue" ? `Actividad vencida (${when(meta.next[id])})` : tone === "planned" ? `Próxima actividad ${when(meta.next[id])}` : "Sin actividad programada"}
                        title={tone === "overdue" ? "Actividad vencida" : tone === "planned" ? `Próxima: ${when(meta.next[id])}` : "Sin actividad programada"} />
                    </div>
                    <label className={s.move}>
                      <span>Mover a</span>
                      <select aria-label={`Etapa de ${l.company}`} disabled={busy} value={String(l.stage_id)} onChange={e => onMove(l, e.target.value)}>
                        {stages.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
                      </select>
                    </label>
                  </li>
                );
              })}
              {!leads.length && <li className={s.empty}>Suelta aquí</li>}
            </ul>
          </section>
        ))}
      </div>
      {current && <LeadTimeline lead={current} stages={stages} owners={meta.owners} revision={revision}
        onClose={() => setOpen(null)} onEdit={() => onEdit(current)} onChanged={loadMeta} />}
    </div>
  );
}

function LeadTimeline({ lead, stages, owners, revision, onClose, onEdit, onChanged }: {
  lead: Row; stages: Stage[]; owners: Owner[]; revision: number; onClose: () => void; onEdit: () => void; onChanged: () => void;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [warning, setWarning] = useState(""), [error, setError] = useState(""), [ok, setOk] = useState(""), [saving, setSaving] = useState(false);
  const [tick, setTick] = useState(0), [mode, setMode] = useState<"note" | "activity" | "file">("note");
  const dialog = useRef<HTMLElement>(null);
  const id = String(lead.id);
  const label = (st: unknown) => stages.find(x => x.id === st)?.label ?? String(st ?? "—");
  const who = (u: unknown) => owners.find(o => o.user_id === u)?.email.split("@")[0] ?? "Sistema";
  useEffect(() => {
    const c = new AbortController();
    fetch(`${base}?lead=${id}`, { signal: c.signal }).then(async r => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "No disponible");
      setWarning(d.unavailable ?? "");
      const list: Entry[] = [
        ...d.history.map((h: Record<string, unknown>) => ({ id: `h${h.id}`, at: String(h.changed_at), type: "stage" as const, data: h })),
        ...d.activities.map((a: Record<string, unknown>) => ({ id: `a${a.id}`, at: String(a.created_at), type: "activity" as const, data: a })),
        ...d.files.map((f: Record<string, unknown>) => ({ id: `f${f.id}`, at: String(f.created_at), type: "file" as const, data: f })),
      ].sort((x, y) => y.at.localeCompare(x.at));
      setEntries(list);
    }).catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => c.abort();
  }, [id, tick, revision]);
  useEffect(() => { dialog.current?.focus(); }, [id]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  async function submit(form: HTMLFormElement) {
    setSaving(true); setError(""); setOk("");
    const fd = new FormData(form);
    try {
      let r: Response;
      if (mode === "file") {
        fd.set("lead", id);
        r = await fetch(`${base}/files`, { method: "POST", body: fd });
      } else {
        r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          lead: id, body: fd.get("body"), kind: fd.get("kind") ?? "note", due_at: mode === "activity" ? fd.get("due_at") || new Date().toISOString() : null }) });
      }
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "No se pudo guardar");
      form.reset();
      setOk(mode === "file" ? "Archivo subido." : mode === "activity" ? "Actividad programada." : "Nota guardada.");
      setTick(n => n + 1);
      onChanged();
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }
  return (
    <div className={s.scrim} onClick={e => e.target === e.currentTarget && onClose()}>
      <aside ref={dialog} tabIndex={-1} className={s.drawer} role="dialog" aria-modal="true" aria-label={`Historial de ${lead.company}`}>
        <header className={s.drawerHead}>
          <div>
            <p className={s.eyebrow}>{label(lead.stage_id)} · {money(lead.value)}</p>
            <h2>{String(lead.company)}</h2>
            <p className={s.sub}>{[lead.contact, lead.email, lead.phone].filter(Boolean).join(" · ") || "Sin contacto registrado"}</p>
          </div>
          <div className={s.headActions}>
            <button type="button" onClick={onEdit}>Editar lead</button>
            <button type="button" onClick={onClose} aria-label="Cerrar historial">✕</button>
          </div>
        </header>
        <div className={s.tabs} role="tablist" aria-label="Añadir al historial">
          {([["note", "Nota"], ["activity", "Actividad"], ["file", "Archivo"]] as const).map(([k, t]) => (
            <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => setMode(k)}>{t}</button>
          ))}
        </div>
        <form className={s.composer} onSubmit={e => { e.preventDefault(); submit(e.currentTarget); }}>
          {mode === "file" ? (
            <>
              <label>Archivo (PDF, imagen, TXT, CSV, DOCX, XLSX · máx. 5 MB)<input type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx,.xlsx" /></label>
              <label>Descripción (opcional)<input name="note" maxLength={500} /></label>
            </>
          ) : (
            <>
              {mode === "activity" && (
                <div className={s.row}>
                  <label>Tipo<select name="kind" defaultValue="call">{["call", "meeting", "email", "whatsapp", "task"].map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
                  <label>Para<input type="datetime-local" name="due_at" required /></label>
                </div>
              )}
              <label>{mode === "note" ? "Nota" : "Descripción"}<textarea name="body" required maxLength={4000} rows={3} placeholder={mode === "note" ? "Escribe lo que pasó, acuerdos, próximos pasos…" : "Ej.: Llamar para revisar la propuesta"} /></label>
            </>
          )}
          <button type="submit" className={s.primary} disabled={saving}>{saving ? "Guardando…" : mode === "file" ? "Subir archivo" : mode === "activity" ? "Programar actividad" : "Guardar nota"}</button>
          {ok && <p role="status" className={s.ok}>{ok}</p>}
          {error && <p role="alert" className={s.error}>{error}</p>}
          {warning && <p role="status" className={s.warn}>{warning}</p>}
        </form>
        <h3 className={s.timelineTitle}>Historial</h3>
        {!entries ? <p role="status">Cargando historial…</p> : (
          <ol className={s.timeline}>
            {entries.map(e => (
              <li key={e.id} data-type={e.type}>
                {e.type === "stage" ? (
                  <p><strong>{e.data.from_stage ? `Movido de ${label(e.data.from_stage)} a ${label(e.data.to_stage)}` : `Creado en ${label(e.data.to_stage)}`}</strong>
                    {e.data.from_stage && e.data.seconds_in_previous != null ? <span> · {duration(e.data.seconds_in_previous)} en {label(e.data.from_stage)}</span> : null}</p>
                ) : e.type === "file" ? (
                  <p><strong>Archivo:</strong> <a href={`${base}/files/${e.data.id}`} download>{String(e.data.filename)}</a> <span>({kb(e.data.size_bytes)})</span>
                    {e.data.note ? <span className={s.body}>{String(e.data.note)}</span> : null}</p>
                ) : (
                  <p><strong>{KIND_LABEL[String(e.data.kind)] ?? "Nota"}{e.data.status === "pending" ? ` · pendiente para ${when(e.data.due_at)}` : ""}</strong>
                    <span className={s.body}>{String(e.data.body)}</span></p>
                )}
                <small>{when(e.at)} · {who(e.type === "stage" ? e.data.actor_id : e.data.created_by)}</small>
              </li>
            ))}
            {!entries.length && <li>Sin historial todavía.</li>}
          </ol>
        )}
      </aside>
    </div>
  );
}
