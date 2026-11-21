"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Row, Stage } from "@/lib/crm/domain";
import s from "./lead-timeline.module.css";

type Owner = { user_id: string; email: string };
type Entry = { id: string; at: string; type: "stage" | "activity" | "file" | "edit"; data: Record<string, unknown> };
type Receipt = { fingerprint: string; filename: string };
const SOURCE_LABEL: Record<string, string> = { history: "cambios de etapa", activities: "notas y actividades", files: "archivos", edits: "ediciones de la ficha", activityEdits: "ediciones de actividades" };
const fingerprint = (f: File) => `${f.name}:${f.size}:${f.lastModified}`;
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
  const [directory, setDirectory] = useState<"loading" | "ready" | "failed">("loading");
  useEffect(() => {
    fetch(base).then(r => (r.ok ? r.json() : Promise.reject(new Error("directory"))))
      .then(d => { setOwners(d.owners ?? []); setDirectory("ready"); })
      .catch(() => setDirectory("failed"));
  }, []);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [warning, setWarning] = useState(""), [error, setError] = useState(""), [ok, setOk] = useState(""), [saving, setSaving] = useState(false);
  const [tick, setTick] = useState(0), [mode, setMode] = useState<"note" | "activity" | "file">("note");
  const [limit, setLimit] = useState(200), [maxLimit, setMaxLimit] = useState(1000);
  const [truncated, setTruncated] = useState<string[]>([]), [incomplete, setIncomplete] = useState<string[]>([]);
  // A file already stored for a note whose text failed: retry sends only the note, never the same file twice.
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const dialog = useRef<HTMLElement>(null);
  const id = String(lead.id);
  const label = (st: unknown) => stages.find(x => x.id === st)?.label ?? String(st ?? "—");
  // Missing directory data is not evidence of a system action: say what is actually known.
  const who = (u: unknown) => {
    if (!u) return "Autor no registrado";
    const owner = owners.find(o => o.user_id === u);
    if (owner) return owner.email.split("@")[0];
    return directory === "loading" ? "Autor…" : `Usuario ${String(u).slice(0, 8)} (directorio no disponible)`;
  };
  useEffect(() => {
    const c = new AbortController();
    setError("");
    fetch(`${base}?lead=${id}&limit=${limit}`, { signal: c.signal }).then(async r => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "No disponible");
      setWarning(d.unavailable ?? "");
      setIncomplete(Array.isArray(d.incomplete) ? d.incomplete : []);
      setTruncated(Object.entries(d.truncated ?? {}).filter(([, v]) => v).map(([k]) => k));
      if (Number(d.maxLimit) > 0) setMaxLimit(Number(d.maxLimit));
      const list: Entry[] = [
        ...d.history.map((h: Record<string, unknown>) => ({ id: `h${h.id}`, at: String(h.changed_at), type: "stage" as const, data: h })),
        ...d.activities.map((a: Record<string, unknown>) => ({ id: `a${a.id}`, at: String(a.created_at), type: "activity" as const, data: a })),
        ...d.files.map((f: Record<string, unknown>) => ({ id: `f${f.id}`, at: String(f.created_at), type: "file" as const, data: f })),
        ...(d.edits ?? []).map((x: Record<string, unknown>) => ({ id: `e${x.id}`, at: String(x.at), type: "edit" as const, data: x })),
      ].sort((x, y) => y.at.localeCompare(x.at));
      setEntries(list);
    }).catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => c.abort();
  }, [id, tick, revision, limit]);
  // Focus moves into the dialog, stays there (Tab cycles) and returns to the opener on close.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, [id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
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
        if (noteFile instanceof File && noteFile.size > 0 && receipt?.fingerprint === fingerprint(noteFile)) {
          uploaded = true; // Stored on the previous attempt: retry only the note.
        } else if (noteFile instanceof File && noteFile.size > 0) {
          if (noteFile.size > MAX_FILE_BYTES) throw new Error("Archivo mayor de 5 MB.");
          const data = new FormData();
          data.set("lead", id);
          data.set("file", noteFile);
          data.set("note", String(fd.get("body") ?? "").trim().slice(0, 500));
          const fileResponse = await fetch(base + "/files", { method: "POST", body: data });
          const result = await fileResponse.json().catch(() => ({}));
          if (!fileResponse.ok || !result.id) throw new Error(result.error ?? "No se pudo subir el archivo.");
          uploaded = true;
          setReceipt({ fingerprint: fingerprint(noteFile), filename: noteFile.name });
        }
        r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          lead: id, body: fd.get("body"), kind: fd.get("kind") ?? "note",
          due_at: mode === "activity" ? fd.get("due_at") || new Date().toISOString() : null }) });
      }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "No se pudo guardar");
      form.reset();
      setReceipt(null);
      setOk(mode === "file" ? "Archivo subido." : mode === "activity" ? "Actividad programada." :
        uploaded ? "Nota y archivo guardados." : "Nota guardada.");
      setTick(n => n + 1);
      onChanged?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : "No se pudo guardar";
      setError(uploaded ? "El archivo se guardó en Archivos adjuntos, pero la nota no. Pulsa Guardar nota de nuevo: solo se enviará la nota, sin volver a subir el archivo. " + message : message);
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
        {/* Commercial actions live in the record (not on the compact pipeline cards). */}
        <nav className={s.recordLinks} aria-label={`Acciones de ${lead.company}`}>
          <Link href={`/admin/workspace/crm/lead/${String(lead.id)}?tab=summary&edit=1#lead-edit`}>Editar datos</Link>
          {!lead.archived && <Link href={`/admin/workspace/crm/sales/new?lead=${encodeURIComponent(String(lead.id))}`} aria-label={`Registrar venta para ${lead.company}`}>Registrar venta</Link>}
          <Link href={`/admin/workspace/crm/lead/${String(lead.id)}`}>Oportunidad y contratos</Link>
          <Link href={`/admin/workspace/clients/${String(lead.id)}`}>Cliente 360 y proyectos</Link>
        </nav>
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
          {receipt && mode === "note" && <p role="status" className={s.warn}>Archivo ya guardado: {receipt.filename}. El reintento enviará solo la nota.</p>}
          {ok && <p role="status" className={s.ok}>{ok}</p>}
          {error && <p role="alert" className={s.error}>{error} {!saving && <button type="button" className={s.inlineEdit} onClick={() => { setEntries(null); setTick(n => n + 1); }}>Reintentar carga</button>}</p>}
          {incomplete.length > 0 && <p role="alert" className={s.error}>Historial incompleto: no se pudieron cargar {incomplete.map(k => SOURCE_LABEL[k] ?? k).join(", ")}. Lo que ves no es el historial completo. <button type="button" className={s.inlineEdit} onClick={() => setTick(n => n + 1)}>Reintentar</button></p>}
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
        {truncated.length > 0 && (
          <p role="status" className={s.warn}>
            Mostrando los {limit} registros más recientes por tipo; hay más {truncated.map(k => SOURCE_LABEL[k] ?? k).join(", ")}.{" "}
            {limit < maxLimit
              ? <button type="button" className={s.inlineEdit} onClick={() => setLimit(n => Math.min(maxLimit, n + 200))}>Cargar más antiguos</button>
              : <span>Se alcanzó el máximo visible aquí ({maxLimit}); los registros anteriores existen pero no se muestran.</span>}
          </p>
        )}
        {!entries ? <p role="status">Cargando historial…</p> : (
          <ol className={s.timeline}>
            {entries.map(e => (
              <li key={e.id} data-type={e.type}>
                {e.type === "stage" ? (
                  <p><strong>{e.data.from_stage ? `Movido de ${label(e.data.from_stage)} a ${label(e.data.to_stage)}` : `Creado en ${label(e.data.to_stage)}`}</strong>
                    {e.data.from_stage && e.data.seconds_in_previous != null ? <span> · {duration(e.data.seconds_in_previous)} en {label(e.data.from_stage)}</span> : null}</p>
                ) : e.type === "edit" ? (
                  <p><strong>{e.data.target === "activity" ? "Editó una actividad" : "Editó la ficha"}:</strong> <span>{(e.data.fields as string[]).join(", ")}</span></p>
                ) : e.type === "file" ? (
                  <p><strong>Archivo:</strong> <a href={`${base}/files/${e.data.id}`} download>{String(e.data.filename)}</a> <span>({kb(e.data.size_bytes)})</span>
                    {e.data.note ? <span className={s.body}>{String(e.data.note)}</span> : null}</p>
                ) : (
                  <p><strong>{KIND_LABEL[String(e.data.kind)] ?? "Nota"}{e.data.status === "pending" ? ` · pendiente para ${when(e.data.due_at)}` : ""}</strong>
                    <span className={s.body}>{String(e.data.body)}</span>
                    {onEditActivity && e.data.kind !== "system" ? <button type="button" className={s.inlineEdit} onClick={() => onEditActivity({ ...(e.data as Row), lead_id: String(lead.id) })}>Editar actividad</button> : null}</p>
                )}
                <small>{when(e.at)} · {who(e.type === "stage" || e.type === "edit" ? e.data.actor_id : e.data.created_by)}</small>
              </li>
            ))}
            {!entries.length && <li>Sin historial todavía.</li>}
          </ol>
        )}
      </aside>
    </div>
  );
}
