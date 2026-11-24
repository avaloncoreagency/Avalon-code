"use client";
import { personDisplayName } from "@/lib/identity/owners";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { rovingKeyDown } from "@/components/a11y/roving";
import { createPortal } from "react-dom";
import Link from "next/link";
import { pick, type Lang } from "@/lib/i18n";
import type { Row, Stage } from "@/lib/crm/domain";
import s from "./lead-timeline.module.css";
import { timelineWindow, type TimelineFilter } from "@/lib/crm/timeline-window";
import { lockPageScroll, useIsClient } from "@/lib/ui/page-scroll-lock";

type Owner = { user_id: string; email: string };
type Entry = { id: string; at: string; type: "stage" | "activity" | "file" | "edit"; data: Record<string, unknown> };
type Receipt = { fingerprint: string; filename: string };
const SOURCE_LABEL: Record<string, [string, string]> = { history: ["cambios de etapa", "stage changes"], activities: ["notas y actividades", "notes and activities"], files: ["archivos", "files"], edits: ["ediciones de la ficha", "record edits"], activityEdits: ["ediciones de actividades", "activity edits"] };
const fingerprint = (f: File) => `${f.name}:${f.size}:${f.lastModified}`;
const base = "/admin/workspace/crm/pipeline";
const money = (n: unknown, lang: Lang) => new Intl.NumberFormat(lang, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n ?? 0));
const when = (v: unknown, lang: Lang) => (v ? new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(new Date(String(v))) : "—");
const duration = (sec: unknown) => {
  const n = Number(sec ?? 0);
  if (n < 3600) return `${Math.max(1, Math.round(n / 60))} min`;
  if (n < 86400) return `${Math.round(n / 3600)} h`;
  return `${Math.round(n / 86400)} d`;
};
const KIND_LABEL: Record<string, [string, string]> = { note: ["Nota", "Note"], call: ["Llamada", "Call"], email: ["Email", "Email"], whatsapp: ["WhatsApp", "WhatsApp"], meeting: ["Reunión", "Meeting"], task: ["Tarea", "Task"], system: ["Sistema", "System"] };
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const VIEW_MIMES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const PHOTO_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const kb = (n: unknown) => (Number(n) < 1024 * 1024 ? `${Math.max(1, Math.round(Number(n) / 1024))} KB` : `${(Number(n) / 1048576).toFixed(1)} MB`);

/** Card history drawer: stage changes, notes, scheduled activities and files of one lead. */
export function LeadTimeline({ lang = "es", lead, stages, revision, onClose, onEdit, onEditActivity, onChanged }: {
  lang?: Lang; lead: Row; stages: Stage[]; revision: number; onClose: () => void; onEdit: () => void;
  onEditActivity?: (activity: Row) => void; onChanged?: () => void;
}) {
  const t = (es: string, en: string) => pick(lang, es, en);
  const src = (k: string) => (SOURCE_LABEL[k] ? pick(lang, ...SOURCE_LABEL[k]) : k);
  const kind = (k: string) => (KIND_LABEL[k] ? pick(lang, ...KIND_LABEL[k]) : k);
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
  const [historyFilter, setHistoryFilter] = useState<TimelineFilter>("all");
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [limit, setLimit] = useState(200), [maxLimit, setMaxLimit] = useState(1000);
  const [truncated, setTruncated] = useState<string[]>([]), [incomplete, setIncomplete] = useState<string[]>([]);
  // A file already stored for a note whose text failed: retry sends only the note, never the same file twice.
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const dialog = useRef<HTMLElement>(null);
  const id = String(lead.id);
  const label = (st: unknown) => stages.find(x => x.id === st)?.label ?? String(st ?? "—");
  // The API remains the source of truth. This only controls how much of the fetched
  // history is visible until the owner asks for the full audit trail.
  const history = timelineWindow(entries ?? [], historyFilter, showFullHistory, 8);
  const historyOptions: { key: TimelineFilter; es: string; en: string }[] = [
    { key: "all", es: "Todos", en: "All" },
    { key: "activity", es: "Notas y tareas", en: "Notes & tasks" },
    { key: "stage", es: "Etapas", en: "Stages" },
    { key: "edit", es: "Ediciones", en: "Edits" },
    { key: "file", es: "Archivos", en: "Files" },
  ];
  // Missing directory data is not evidence of a system action: say what is actually known.
  const who = (u: unknown) => {
    if (!u) return t("Autor no registrado", "Author not recorded");
    const owner = owners.find(o => o.user_id === u);
    if (owner) return personDisplayName(owner, t("Autor no disponible", "Author unavailable"));
    return directory === "loading" ? t("Autor…", "Author…") : t("Autor no disponible (directorio no disponible)", "Author unavailable (directory unavailable)");
  };
  useEffect(() => {
    const c = new AbortController();
    setError("");
    fetch(`${base}?lead=${id}&limit=${limit}`, { signal: c.signal }).then(async r => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? t("No disponible", "Unavailable"));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t only formats a fallback message; reloading on language change is not needed
  }, [id, tick, revision, limit]);
  // Two independent scroll contexts. The panel is portalled to <body>, so `position:fixed` is relative to the
  // viewport even when a page ancestor is transformed (the #main entrance animation keeps `transform` filled).
  // While open, the page is locked at its current position; on close it is restored exactly and focus returns
  // to the card that opened the panel. Focus never scrolls anything (`preventScroll`).
  const isClient = useIsClient();
  // Captured during the first render, before the panel takes focus.
  const [opener] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null);
  useEffect(() => {
    if (!isClient) return;
    const release = lockPageScroll();
    return () => {
      release();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [isClient, opener]);
  // Opening, reopening or switching lead always starts the panel at the top. Saving a note, changing a filter
  // or loading more history does not depend on `id`, so the reading position is kept.
  useLayoutEffect(() => {
    const panel = dialog.current;
    if (!panel) return;
    panel.scrollTop = 0;
    panel.focus({ preventScroll: true });
  }, [id, isClient]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll<HTMLElement>('summary,a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el => el.getClientRects().length > 0);
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
          throw new Error(t("Selecciona un archivo de hasta 5 MB.", "Choose a file up to 5 MB."));
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
          if (noteFile.size > MAX_FILE_BYTES) throw new Error(t("Archivo mayor de 5 MB.", "File larger than 5 MB."));
          const data = new FormData();
          data.set("lead", id);
          data.set("file", noteFile);
          data.set("note", String(fd.get("body") ?? "").trim().slice(0, 500));
          const fileResponse = await fetch(base + "/files", { method: "POST", body: data });
          const result = await fileResponse.json().catch(() => ({}));
          if (!fileResponse.ok || !result.id) throw new Error(result.error ?? t("No se pudo subir el archivo.", "The file could not be uploaded."));
          uploaded = true;
          setReceipt({ fingerprint: fingerprint(noteFile), filename: noteFile.name });
        }
        r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          lead: id, body: fd.get("body"), kind: fd.get("kind") ?? "note",
          due_at: mode === "activity" ? fd.get("due_at") || new Date().toISOString() : null }) });
      }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? t("No se pudo guardar", "Could not save"));
      form.reset();
      setReceipt(null);
      setOk(mode === "file" ? t("Archivo subido.", "File uploaded.") : mode === "activity" ? t("Actividad programada.", "Activity scheduled.") :
        uploaded ? t("Nota y archivo guardados.", "Note and file saved.") : t("Nota guardada.", "Note saved."));
      setTick(n => n + 1);
      onChanged?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : t("No se pudo guardar", "Could not save");
      setError(uploaded ? t("El archivo se guardó en Archivos adjuntos, pero la nota no. Pulsa Guardar nota de nuevo: solo se enviará la nota, sin volver a subir el archivo. ", "The file was saved in Attachments, but the note was not. Press Save note again: only the note will be sent, the file is not uploaded twice. ") + message : message);
      if (uploaded) setTick(n => n + 1);
    } finally { setSaving(false); }
  }

  if (!isClient) return null;
  return createPortal(
    <div className={s.scrim} onClick={e => e.target === e.currentTarget && onClose()}>
      <aside ref={dialog} tabIndex={-1} className={s.drawer} role="dialog" aria-modal="true" aria-label={t(`Historial de ${lead.company}`, `History of ${lead.company}`)}>
        <header className={s.drawerHead}>
          <div>
            <p className={s.eyebrow}>{label(lead.stage_id)} · {money(lead.value, lang)}</p>
            <h2>{String(lead.company)}</h2>
            <p className={s.sub}>{[lead.contact, lead.email, lead.phone].filter(Boolean).join(" · ") || t("Sin contacto registrado", "No contact recorded")}</p>
          </div>
          <div className={s.headActions}>
            <button type="button" onClick={onEdit}>{t("Editar lead", "Edit lead")}</button>
            <button type="button" onClick={onClose} aria-label={t("Cerrar historial", "Close history")}>✕</button>
          </div>
        </header>
        {/* Commercial actions live in the record (not on the compact pipeline cards). */}
        <nav className={s.recordLinks} aria-label={t(`Acciones de ${lead.company}`, `Actions for ${lead.company}`)}>
          <Link href={`/admin/workspace/crm/lead/${String(lead.id)}?tab=summary&edit=1#lead-edit`}>{t("Editar datos", "Edit details")}</Link>
          {!lead.archived && <Link href={`/admin/workspace/crm/sales/new?lead=${encodeURIComponent(String(lead.id))}`} aria-label={t(`Registrar venta para ${lead.company}`, `Record sale for ${lead.company}`)}>{t("Registrar venta", "Record sale")}</Link>}
          <Link href={`/admin/workspace/crm/lead/${String(lead.id)}`}>{t("Oportunidad y contratos", "Opportunity and agreements")}</Link>
          <Link href={`/admin/workspace/clients/${String(lead.id)}`}>{t("Cliente 360 y proyectos", "Client 360 and projects")}</Link>
        </nav>
        <details className={s.composeSection}>
          <summary className={s.sectionSummary}>{t("Añadir nota, actividad o archivo", "Add note, task or file")}</summary>
        <div className={s.tabs} role="tablist" aria-label={t("Añadir al historial", "Add to history")} onKeyDown={e => rovingKeyDown(e, "tab")}>
          {([["note", t("Nota", "Note")], ["activity", t("Actividad", "Activity")], ["file", t("Archivo", "File")]] as const).map(([k, text]) => (
            <button key={k} type="button" role="tab" id={`lead-compose-tab-${k}`} aria-controls="lead-compose-panel" aria-selected={mode === k}
              tabIndex={mode === k ? 0 : -1} onClick={() => setMode(k)}>{text}</button>
          ))}
        </div>
        <form className={s.composer} id="lead-compose-panel" role="tabpanel" aria-labelledby={`lead-compose-tab-${mode}`} onSubmit={e => { e.preventDefault(); submit(e.currentTarget); }}>
          {mode === "file" ? (
            <>
              <label>{t("Archivo (PDF, imagen, TXT, CSV, DOCX, XLSX · máx. 5 MB)", "File (PDF, image, TXT, CSV, DOCX, XLSX · max 5 MB)")}<input type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx,.xlsx" /></label>
              <label>{t("Descripción (opcional)", "Description (optional)")}<input name="note" maxLength={500} /></label>
            </>
          ) : (
            <>
              {mode === "activity" && (
                <div className={s.row}>
                  <label>{t("Tipo", "Type")}<select name="kind" defaultValue="call">{["call", "meeting", "email", "whatsapp", "task"].map(k => <option key={k} value={k}>{kind(k)}</option>)}</select></label>
                  <label>{t("Para", "When")}<input type="datetime-local" name="due_at" required /></label>
                </div>
              )}
              <label>{mode === "note" ? t("Nota", "Note") : t("Descripción", "Description")}<textarea name="body" required maxLength={4000} rows={3} placeholder={mode === "note" ? t("Escribe lo que pasó, acuerdos, próximos pasos…", "Write what happened, agreements, next steps…") : t("Ej.: Llamar para revisar la propuesta", "E.g.: Call to review the proposal")} /></label>
              {mode === "note" && <label>{t("Adjuntar PDF, foto o documento (opcional, hasta 5 MB)", "Attach a PDF, photo or document (optional, up to 5 MB)")}<input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx,.xlsx" /></label>}
            </>
          )}
          <button type="submit" className={s.primary} disabled={saving}>{saving ? t("Guardando…", "Saving…") : mode === "file" ? t("Subir archivo", "Upload file") : mode === "activity" ? t("Programar actividad", "Schedule activity") : t("Guardar nota", "Save note")}</button>
          {receipt && mode === "note" && <p role="status" className={s.warn}>{t("Archivo ya guardado", "File already saved")}: {receipt.filename}. {t("El reintento enviará solo la nota.", "Retrying sends only the note.")}</p>}
          {ok && <p role="status" className={s.ok}>{ok}</p>}
          {error && <p role="alert" className={s.error}>{error} {!saving && <button type="button" className={s.inlineEdit} onClick={() => { setEntries(null); setTick(n => n + 1); }}>{t("Reintentar carga", "Retry loading")}</button>}</p>}
          {incomplete.length > 0 && <p role="alert" className={s.error}>{t("Historial incompleto: no se pudieron cargar", "Incomplete history: could not load")} {incomplete.map(src).join(", ")}. {t("Lo que ves no es el historial completo.", "What you see is not the full history.")} <button type="button" className={s.inlineEdit} onClick={() => setTick(n => n + 1)}>{t("Reintentar", "Retry")}</button></p>}
          {warning && <p role="status" className={s.warn}>{warning}</p>}
        </form>
        </details>
        <details className={s.attachmentsSection}>
          <summary id="lead-files-title" className={s.sectionSummary}>{t("Archivos adjuntos", "Attachments")} ({entries?.filter(entry => entry.type === "file").length ?? 0})</summary>
          {!entries ? <p role="status">{t("Cargando archivos…", "Loading files…")}</p> : (
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
                    <small>{kb(entry.data.size_bytes)} · {when(entry.at, lang)}</small>
                    {entry.data.note ? <span>{String(entry.data.note)}</span> : null}
                  </div>
                  <div className={s.attachmentLinks}>
                    {VIEW_MIMES.has(mime) && <a href={href + "?preview=1"} target="_blank" rel="noopener noreferrer">{t("Ver", "View")}</a>}
                    <a href={href} download>{t("Descargar", "Download")}</a>
                  </div>
                </li>;
              })}
              {!entries.some(entry => entry.type === "file") && <li className={s.empty}>{t("Aún no hay documentos adjuntos.", "No attachments yet.")}</li>}
            </ul>
          )}
        </details>
        <section className={s.historySection} aria-labelledby="lead-history-title">
          <div className={s.historyHead}>
            <h3 id="lead-history-title" className={s.timelineTitle}>{t("Historial", "History")}</h3>
            <span className={s.historyCount}>{entries ? t(`${entries.length} eventos cargados`, `${entries.length} loaded events`) : t("Cargando…", "Loading…")}</span>
          </div>
          <div className={s.historyFilters} role="group" aria-label={t("Filtrar historial", "Filter history")}>
            {historyOptions.map(option => (
              <button key={option.key} type="button" aria-pressed={historyFilter === option.key}
                onClick={() => { setHistoryFilter(option.key); setShowFullHistory(false); }}>
                {t(option.es, option.en)}
                {entries && <span className={s.filterCount}>{option.key === "all" ? entries.length : entries.filter(entry => entry.type === option.key).length}</span>}
              </button>
            ))}
          </div>
        {truncated.length > 0 && (
          <p role="status" className={s.warn}>
            {t(`Mostrando los ${limit} registros más recientes por tipo; hay más`, `Showing the ${limit} most recent records per type; there are more`)} {truncated.map(src).join(", ")}.{" "}
            {limit < maxLimit
              ? <button type="button" className={s.inlineEdit} onClick={() => setLimit(n => Math.min(maxLimit, n + 200))}>{t("Cargar más antiguos", "Load older")}</button>
              : <span>{t(`Se alcanzó el máximo visible aquí (${maxLimit}); los registros anteriores existen pero no se muestran.`, `The maximum shown here was reached (${maxLimit}); older records exist but are not shown.`)}</span>}
          </p>
        )}
        {!entries ? <p role="status">{t("Cargando historial…", "Loading history…")}</p> : (
          <ol className={s.timeline}>
            {history.visible.map(e => (
              <li key={e.id} data-type={e.type}>
                {e.type === "stage" ? (
                  <p><strong>{e.data.from_stage ? t(`Movido de ${label(e.data.from_stage)} a ${label(e.data.to_stage)}`, `Moved from ${label(e.data.from_stage)} to ${label(e.data.to_stage)}`) : t(`Creado en ${label(e.data.to_stage)}`, `Created in ${label(e.data.to_stage)}`)}</strong>
                    {e.data.from_stage && e.data.seconds_in_previous != null ? <span> · {duration(e.data.seconds_in_previous)} {t("en", "in")} {label(e.data.from_stage)}</span> : null}</p>
                ) : e.type === "edit" ? (
                  <p><strong>{e.data.target === "activity" ? t("Editó una actividad", "Edited an activity") : t("Editó la ficha", "Edited the record")}:</strong> <span>{(e.data.fields as string[]).join(", ")}</span></p>
                ) : e.type === "file" ? (
                  <p><strong>{t("Archivo", "File")}:</strong> <a href={`${base}/files/${e.data.id}`} download>{String(e.data.filename)}</a> <span>({kb(e.data.size_bytes)})</span>
                    {e.data.note ? <span className={s.body}>{String(e.data.note)}</span> : null}</p>
                ) : (
                  <p><strong>{KIND_LABEL[String(e.data.kind)] ? kind(String(e.data.kind)) : t("Nota", "Note")}{e.data.status === "pending" ? t(` · pendiente para ${when(e.data.due_at, lang)}`, ` · due ${when(e.data.due_at, lang)}`) : ""}</strong>
                    <span className={s.body}>{String(e.data.body)}</span>
                    {onEditActivity && e.data.kind !== "system" ? <button type="button" className={s.inlineEdit} onClick={() => onEditActivity({ ...(e.data as Row), lead_id: String(lead.id) })}>{t("Editar actividad", "Edit activity")}</button> : null}</p>
                )}
                <small>{when(e.at, lang)} · {who(e.type === "stage" || e.type === "edit" ? e.data.actor_id : e.data.created_by)}</small>
              </li>
            ))}
            {history.matching === 0 && <li>{entries.length
              ? t("Sin eventos de este tipo.", "No events in this category.")
              : t("Sin historial todavía.", "No history yet.")}</li>}
          </ol>
        )}
        {entries && history.hidden > 0 && (
          <button type="button" className={s.historyMore} onClick={() => setShowFullHistory(true)}>
            {t(`Ver los ${history.matching} eventos de esta vista`, `Show all ${history.matching} events in this view`)}
          </button>
        )}
        {entries && showFullHistory && history.matching > 8 && (
          <button type="button" className={s.historyMore} onClick={() => setShowFullHistory(false)}>
            {t("Mostrar solo los 8 más recientes", "Show only the latest 8")}
          </button>
        )}
        </section>
      </aside>
    </div>,
    document.body,
  );
}
