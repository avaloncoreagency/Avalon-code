"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { formatDate, type Lang } from "@/lib/i18n";
import s from "@/components/sales/sales.module.css";
import styles from "./lead-attachments.module.css";

export type LeadAttachment = {
  id: string;
  filename: string;
  mime: string;
  size_bytes: number;
  note: string | null;
  created_by: string;
  created_at: string;
};

const BASE = "/admin/workspace/crm/pipeline/files";
const MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIEW_TYPES = new Set([...PHOTO_TYPES, "application/pdf"]);
const LABELS = {
  es: {
    title: "Archivos adjuntos",
    helper: "Todos los documentos de este lead, incluidas las fotos y los archivos añadidos desde las notas.",
    choose: "Subir PDF, foto o documento",
    description: "Descripción o nota del archivo (opcional)",
    send: "Subir archivo",
    sending: "Subiendo…",
    empty: "Todavía no hay archivos adjuntos.",
    view: "Ver",
    download: "Descargar",
    saved: "Archivo guardado. Ya aparece en el historial de este lead.",
    error: "No se pudo subir el archivo. Inténtalo de nuevo.",
    invalid: "Selecciona un archivo válido de hasta 5 MB.",
    unavailable: "No se pudieron cargar los archivos. Vuelve a intentarlo.",
    limits: "PDF, JPG, PNG, WEBP, TXT, CSV, DOCX o XLSX · máximo 5 MB por archivo y 25 MB por lead.",
    photo: "Foto",
    pdf: "PDF",
    document: "Documento",
  },
  en: {
    title: "Attachments",
    helper: "All files for this lead, including photos and documents uploaded from notes.",
    choose: "Upload PDF, photo or document",
    description: "File description or note (optional)",
    send: "Upload file",
    sending: "Uploading…",
    empty: "No attachments yet.",
    view: "View",
    download: "Download",
    saved: "File saved. It is now in this lead's history.",
    error: "The upload failed. Please try again.",
    invalid: "Choose a supported file under 5 MB.",
    unavailable: "Attachments could not be loaded. Try again.",
    limits: "PDF, JPG, PNG, WEBP, TXT, CSV, DOCX or XLSX · 5 MB per file and 25 MB per lead.",
    photo: "Photo",
    pdf: "PDF",
    document: "Document",
  },
} as const;

const sizeText = (size: number) => size >= 1048576
  ? (size / 1048576).toFixed(1) + " MB"
  : Math.max(1, Math.round(size / 1024)) + " KB";

export function LeadAttachments({ leadId, clientId, lang, files, total, unavailable = false }: {
  leadId?: string; clientId?: string; lang: Lang; files: LeadAttachment[]; total?: number | null; unavailable?: boolean;
}) {
  const baseCopy = LABELS[lang === "en" ? "en" : "es"];
  const clientMode = Boolean(clientId);
  const copy = clientMode ? {
    ...baseCopy,
    helper: lang === "es" ? "Documentos y fotos guardados en este cliente, incluyendo archivos de su lead original." : "Files stored for this client, including its originating lead's documents.",
    saved: lang === "es" ? "Documento guardado en la ficha de este cliente." : "Document saved to this client's record.",
    limits: lang === "es" ? "PDF, JPG, PNG, WEBP, TXT, CSV, DOCX o XLSX · máximo 5 MB por archivo." : "PDF, JPG, PNG, WEBP, TXT, CSV, DOCX or XLSX · 5 MB per file.",
  } : baseCopy;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size || file.size > MAX_BYTES) {
      setError(copy.invalid);
      return;
    }
    if (clientMode && clientId) data.set("client", clientId);
    else if (leadId) data.set("lead", leadId);
    else { setError(copy.invalid); return; }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(BASE, { method: "POST", body: data, cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.id) {
        setError(typeof result.error === "string" ? result.error : copy.error);
        return;
      }
      form.reset();
      setSuccess(copy.saved);
      router.refresh();
    } catch {
      setError(copy.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id={clientMode ? "client-files" : "lead-attachments"} className={s.panel} aria-labelledby={clientMode ? "client-files-title" : "lead-attachments-title"}>
      <header className={styles.heading}>
        <div>
          <h2 id={clientMode ? "client-files-title" : "lead-attachments-title"}>{copy.title} <span className={styles.count}>({unavailable ? "—" : (total ?? files.length)})</span></h2>
          <p className={s.muted}>{copy.helper}</p>
        </div>
      </header>
      {unavailable && <p role="alert" className={styles.error}>{copy.unavailable}</p>}
      {!unavailable && total !== null && total !== undefined && total > files.length && <p className={s.muted}>{lang === "es" ? `Mostrando los ${files.length} archivos más recientes de ${total}.` : `Showing the ${files.length} most recent files of ${total}.`}</p>}
      {!unavailable && (
        <ul className={styles.list} aria-label={copy.title}>
          {files.map(file => {
            const photo = PHOTO_TYPES.has(file.mime);
            const viewable = VIEW_TYPES.has(file.mime);
            const href = BASE + "/" + encodeURIComponent(file.id);
            const kind = photo ? copy.photo : file.mime === "application/pdf" ? copy.pdf : copy.document;
            return (
              <li key={file.id} className={styles.item}>
                {photo
                  // Private, cookie-authenticated route: next/image would not forward the owner session.
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img className={styles.thumb} src={href + "?preview=1"} alt={file.filename} loading="lazy" />
                  : <span className={styles.icon} aria-hidden="true">{file.mime === "application/pdf" ? "📄" : "📎"}</span>}
                <div className={styles.info}>
                  <strong className={styles.filename}>{file.filename}</strong>
                  <small>{kind} · {sizeText(Number(file.size_bytes))} · {formatDate(lang, file.created_at)}</small>
                  {file.note && <span className={styles.note}>{file.note}</span>}
                </div>
                <div className={styles.actions}>
                  {viewable && <a className={s.button} href={href + "?preview=1"} target="_blank" rel="noopener noreferrer">{copy.view}</a>}
                  <a className={s.button} href={href} download>{copy.download}</a>
                </div>
              </li>
            );
          })}
          {files.length === 0 && <li className={styles.empty}>{copy.empty}</li>}
        </ul>
      )}
      <form className={styles.upload} onSubmit={upload} aria-busy={busy}>
        <label className={s.field}>
          <span>{copy.choose}</span>
          <input type="file" name="file" required disabled={busy}
            accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,.txt,.csv,application/pdf,image/*" />
        </label>
        <label className={s.field}>
          <span>{copy.description}</span>
          <input name="note" maxLength={500} disabled={busy} />
        </label>
        <p className={s.muted}>{copy.limits}</p>
        <div className={s.actions}>
          <button type="submit" disabled={busy} className={s.button + " " + s.primary}>
            {busy ? copy.sending : copy.send}
          </button>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {success && <p className={styles.success} role="status">{success}</p>}
      </form>
    </section>
  );
}
