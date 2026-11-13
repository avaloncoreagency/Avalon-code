"use client";

import { useState, type FormEvent } from "react";
import type { Lang } from "@/lib/i18n";
import { TzOffset } from "@/components/sales/tz-offset";
import { logInteraction } from "@/app/admin/workspace/crm/lead/actions";
import s from "@/components/sales/sales.module.css";

const UPLOAD = "/admin/workspace/crm/pipeline/files";
const MAX_FILE = 5 * 1024 * 1024;

/**
 * After-call form keeps the existing server action for notes/tasks.
 * When the owner selects a file, upload it to the already-authorized immutable
 * attachment store BEFORE submitting the note. No binary file is posted to the
 * Next server action (which has a much smaller request body limit).
 */
export function LeadInteractionForm({ leadId, version, nextAction, lang }: {
  leadId: string; version: number; nextAction: string; lang: Lang;
}) {
  const es = lang !== "en";
  const t = (spanish: string, english: string) => es ? spanish : english;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const input = form.elements.namedItem("attachment");
    if (!(input instanceof HTMLInputElement) || !input.files?.length) return; // normal server action
    event.preventDefault();
    if (busy) return;
    const file = input.files[0];
    if (!file.size || file.size > MAX_FILE) {
      setError(t("Selecciona un archivo de hasta 5 MB.", "Select a file of up to 5 MB."));
      return;
    }
    const note = (form.elements.namedItem("body") as HTMLTextAreaElement | null)?.value.trim() ?? "";
    const followUp = (form.elements.namedItem("next_at") as HTMLInputElement | null)?.value ?? "";
    if (!note && !followUp) {
      setError(t("Escribe una nota o un próximo contacto. Para un archivo sin nota usa Archivos adjuntos.",
        "Enter a note or next contact. To upload a file without a note, use Attachments."));
      return;
    }
    setBusy(true);
    setError("");
    const data = new FormData();
    data.set("lead", leadId);
    data.set("file", file);
    data.set("note", note.slice(0, 500));
    try {
      const response = await fetch(UPLOAD, { method: "POST", body: data, cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.id) {
        setError(typeof result.error === "string" ? result.error : t("No se pudo subir el archivo.", "File upload failed."));
        return;
      }
      // A successful immutable attachment is preserved even if a later note
      // action reports a conflict. Clearing this input prevents duplicate
      // uploads and avoids Next server-action binary body-size limits.
      input.value = "";
      setBusy(false);
      form.requestSubmit();
    } catch {
      setError(t("No se pudo conectar. La nota no se ha enviado; comprueba los archivos antes de reintentar.",
        "Network error. The note was not submitted; check Attachments before retrying."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={logInteraction} className={s.form} onSubmit={submit} aria-busy={busy}>
      <input type="hidden" name="lead" value={leadId} />
      <input type="hidden" name="version" value={version} />
      <TzOffset />
      <div className={s.row}>
        <label className={s.field}>
          <span>{t("Tipo", "Type")}</span>
          <select name="kind" defaultValue="call">
            <option value="call">{t("Llamada", "Call")}</option>
            <option value="meeting">{t("Reunión", "Meeting")}</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">{t("Correo", "Email")}</option>
            <option value="note">{t("Nota interna", "Internal note")}</option>
          </select>
        </label>
        <label className={s.field}>
          <span>{t("Próximo contacto", "Next contact")}</span>
          <input type="datetime-local" name="next_at" />
        </label>
        <label className={s.field}>
          <span>{t("Próxima acción", "Next action")}</span>
          <input name="next_action" maxLength={300} defaultValue={nextAction} />
        </label>
      </div>
      <label className={s.field}>
        <span>{t("Resultado / notas", "Result / notes")}</span>
        <textarea name="body" rows={3} maxLength={4000} />
      </label>
      <label className={s.field}>
        <span>{t("Adjuntar PDF, foto o documento a esta nota (opcional)", "Attach PDF, photo or document to this note (optional)")}</span>
        <input name="attachment" type="file" disabled={busy}
          accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx,.xlsx,application/pdf,image/*" />
      </label>
      <p className={s.muted}>{t(
        "Máximo 5 MB. El archivo se guardará en «Archivos adjuntos» con el texto de la nota como descripción.",
        "Maximum 5 MB. The file will appear in Attachments with the note text as its description."
      )}</p>
      <div className={s.actions}>
        <button className={s.button + " " + s.primary} type="submit" disabled={busy}>
          {busy ? t("Subiendo archivo…", "Uploading file…") : t("Registrar", "Log it")}
        </button>
      </div>
      {error && <p role="alert" className={s.flash} data-tone="error">{error}</p>}
    </form>
  );
}
