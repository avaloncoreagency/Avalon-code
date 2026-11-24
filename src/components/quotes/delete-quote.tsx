"use client";
import { useRef } from "react";
import { useFormStatus } from "react-dom";

type Summary = { id: string; version: number; number: string; client: string; date: string; total: string; status: string };
const T = {
  es: { open: "Eliminar", title: "¿Estás seguro de que deseas eliminar esta cotización?", body: "Estás a punto de eliminar la cotización seleccionada. Revisa la información antes de confirmar.",
    number: "Número de cotización", client: "Cliente", date: "Fecha", total: "Importe total", status: "Estado actual", reason: "Motivo (opcional, queda en la auditoría)",
    cancel: "Cancelar", confirm: "Confirmar eliminación", working: "Eliminando…",
    note: "Se archiva (eliminación lógica): desaparece de los listados, se conserva el historial y nunca se borran ventas, contratos, facturas ni pagos." },
  en: { open: "Delete", title: "Are you sure you want to delete this quote?", body: "You are about to delete the selected quote. Review the information before confirming.",
    number: "Quote number", client: "Client name", date: "Date", total: "Total amount", status: "Current status", reason: "Reason (optional, kept in the audit trail)",
    cancel: "Cancel", confirm: "Confirm deletion", working: "Deleting…",
    note: "Archived (logical deletion): it leaves the lists, history is kept, and no sale, contract, invoice or payment is ever deleted." },
};

function Confirm({ label, working }: { label: string; working: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} aria-busy={pending} data-confirm-delete
    style={{ background: "#b4232a", color: "#fff", border: "1px solid #e0484f", borderRadius: 10, padding: "9px 14px", fontWeight: 700, cursor: pending ? "wait" : "pointer" }}>
    {pending ? working : label}</button>;
}

/** Owner-only deletion with explicit confirmation. Closing / Cancel changes nothing; the server re-checks everything. */
export function DeleteQuoteButton({ quote, lang, action, className }: { quote: Summary; lang: "es" | "en"; action: (form: FormData) => void; className?: string }) {
  const t = T[lang], ref = useRef<HTMLDialogElement>(null);
  return <>
    <button type="button" className={className} onClick={() => ref.current?.showModal()} data-open-delete={quote.number}>{t.open}</button>
    <dialog ref={ref} aria-labelledby={`del-${quote.id}`} style={{ maxWidth: 460, width: "calc(100% - 32px)", borderRadius: 16, border: "1px solid #33427a", background: "#0e1530", color: "#e7ecff", padding: 22 }}>
      <form action={action}>
        <h2 id={`del-${quote.id}`} style={{ marginTop: 0, fontSize: 19 }}>{t.title}</h2>
        <p style={{ color: "#b9c4e4" }}>{t.body}</p>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", margin: "14px 0" }}>
          <dt>{t.number}</dt><dd style={{ margin: 0, fontWeight: 700 }}>{quote.number}</dd>
          <dt>{t.client}</dt><dd style={{ margin: 0 }}>{quote.client}</dd>
          <dt>{t.date}</dt><dd style={{ margin: 0 }}>{quote.date}</dd>
          <dt>{t.total}</dt><dd style={{ margin: 0 }}>{quote.total}</dd>
          <dt>{t.status}</dt><dd style={{ margin: 0 }}>{quote.status}</dd>
        </dl>
        <input type="hidden" name="quote_id" value={quote.id} /><input type="hidden" name="expected_version" value={quote.version} />
        <label style={{ display: "grid", gap: 6, fontSize: 13 }}>{t.reason}<input name="reason" maxLength={500} /></label>
        <p style={{ fontSize: 12, color: "#8ea0c4" }}>{t.note}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" onClick={() => ref.current?.close()} autoFocus data-cancel-delete
            style={{ background: "transparent", color: "#e7ecff", border: "1px solid #33427a", borderRadius: 10, padding: "9px 14px" }}>{t.cancel}</button>
          <Confirm label={t.confirm} working={t.working} />
        </div>
      </form>
    </dialog>
  </>;
}
