"use client";
import { useEffect, useRef, useState } from "react";
import type { Row, Stage } from "@/lib/crm/domain";
import s from "./lead-timeline.module.css";

type Owner = { user_id: string; email: string };
type Entry = { id: string; at: string; type: "stage" | "activity" | "file"; data: Record<string, unknown> };
const base = "/admin/workspace/crm/pipeline";
const money = (n: unknown) => new Intl.NumberFormat("es", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n ?? 0));
const when = (v: unknown) => (v ? new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(String(v))) : "—");
const duration = (sec: unknown) => {
  const n = Number(sec ?? 0);
  if (n < 3600) return `${Math.max(1, Math.round(n / 60))} min`;
  if (n < 86400) return `${Math.round(n / 3600)} h`;
  return `${Math.round(n / 86400)} d`;
};
const KIND_LABEL: Record<string, string> = { note: "Nota", call: "Llamada", email: "Email", whatsapp: "WhatsApp", meeting: "Reunión", task: "Tarea", system: "Sistema" };
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const VIEW_MIMES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const PHOTO_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const kb = (n: unknown) => (Number(n) < 1024 * 1024 ? `${Math.max(1, Math.round(Number(n) / 1024))} KB` : `${(Number(n) / 1048576).toFixed(1)} MB`);

/** Card history drawer: stage changes, notes, scheduled activities and files of one lead. */
export function LeadTimeline({ lead, stages, revision, onClose, onEdit, onEditActivity, onChanged }: {
  lead: Row; stages: Stage[]; revision: number; onClose: () => void; onEdit: () => void;
  onEditActivity?: (activity: Row) => void; onChanged?: () => void;
}) {
  const [owners, setOwners] = useState<Owner[]>([]);
  useEffect(() => {
    fetch(base).then(r => (r.ok ? r.json() : null)).then(d => d && setOwners(d.owners ?? [])).catch(() => undefined);
  }, []);
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
    let uploaded = false;
    try {
      let r: Response;
      if (mode === "file") {
        const file = fd.get("file");
        if (!(file instanceof File) || file.size < 1 || file.size > MAX_FILE_BYTES)
          throw new Error("Selecciona un archivo de hasta 5 MB.");
        fd.set("lead", id);
        r = await fetch(base + "/files", { method: "POST", body: fd });
      } else {
        // Attach one document directly while composing a note. The existing
        // private/immutable lead attachment route performs signature, quota
        // and owner checks; this UI never bypasses it.
        const noteFile = mode === "note" ? fd.get("file") : null;
        if (noteFile instanceof File && noteFile.size > 0) {
          if (noteFile.size > MAX_FILE_BYTES) throw new Error("Archivo mayor de 5 MB.");
          const data = new FormData();
          data.set("lead", id);
          data.set("file", noteFile);
          data.set("note", String(fd.get("body") ?? "").trim().slice(0, 500));
          const fileResponse = await fetch(base + "/files", { method: "POST", body: data });
          const result = await fileResponse.json().catch(() => ({}));
          if (!fileResponse.ok || !result.id) throw new Error(result.error ?? "No se pudo subir el archivo.");
          uploaded = true;
        }
        r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          lead: id, body: fd.get("body"), kind: fd.get("kind") ?? "note",
          due_at: mode === "activity" ? fd.get("due_at") || new Date().toISOString() : null }) });
      }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "No se pudo guardar");
      form.reset();
      setOk(mode === "file" ? "Archivo subido." : mode === "activity" ? "Actividad programada." :
        uploaded ? "Nota y archivo guardados." : "Nota guardada.");
      setTick(n => n + 1);
      onChanged?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : "No se pudo guardar";
      setError(uploaded ? "El archivo se guardó en Archivos adjuntos, pero la nota no. " + message : message);
      if (uploaded) setTick(n => n + 1);
    } finally { setSaving(false); }
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
              {mode === "note" && <label>Adjuntar PDF, foto o documento (opcional, hasta 5 MB)<input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx,.xlsx" /></label>}
            </>
          )}
          <button type="submit" className={s.primary} disabled={saving}>{saving ? "Guardando…" : mode === "file" ? "Subir archivo" : mode === "activity" ? "Programar actividad" : "Guardar nota"}</button>
          {ok && <p role="status" className={s.ok}>{ok}</p>}
          {error && <p role="alert" className={s.error}>{error}</p>}
          {warning && <p role="status" className={s.warn}>{warning}</p>}
        </form>
        <section aria-labelledby="lead-files-title">
          <h3 id="lead-files-title" className={s.timelineTitle}>Archivos adjuntos ({entries?.filter(entry => entry.type === "file").length ?? 0})</h3>
          {!entries ? <p role="status">Cargando archivos…</p> : (
            <ul className={s.attachmentShelf}>
              {entries.filter(entry => entry.type === "file").map(entry => {
                const mime = String(entry.data.mime ?? "");
                const href = base + "/files/" + encodeURIComponent(String(entry.data.id));
                return <li key={entry.id} className={s.attachmentCard}>
                  {PHOTO_MIMES.has(mime)
                    // Private image URL uses owner cookies; avoid Next image optimizer.
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={href + "?preview=1"} alt={String(entry.data.filename)} loading="lazy" className={s.attachmentThumb} />
                    : <span className={s.attachmentIcon} aria-hidden="true">{mime === "application/pdf" ? "📄" : "📎"}</span>}
                  <div className={s.attachmentInfo}>
                    <strong>{String(entry.data.filename)}</strong>
                    <small>{kb(entry.data.size_bytes)} · {when(entry.at)}</small>
                    {entry.data.note ? <span>{String(entry.data.note)}</span> : null}
                  </div>
                  <div className={s.attachmentLinks}>
                    {VIEW_MIMES.has(mime) && <a href={href + "?preview=1"} target="_blank" rel="noopener noreferrer">Ver</a>}
                    <a href={href} download>Descargar</a>
                  </div>
                </li>;
              })}
              {!entries.some(entry => entry.type === "file") && <li className={s.empty}>Aún no hay documentos adjuntos.</li>}
            </ul>
          )}
        </section>
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
                    <span className={s.body}>{String(e.data.body)}</span>
                    {onEditActivity && e.data.kind !== "system" ? <button type="button" className={s.inlineEdit} onClick={() => onEditActivity({ ...(e.data as Row), lead_id: String(lead.id) })}>Editar actividad</button> : null}</p>
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
