import type { QuoteStatus } from "./model";

type Bi = readonly [string, string];
export const STATUS_LABEL: Record<QuoteStatus, Bi> = {
  draft: ["Borrador", "Draft"], internal_review: ["Revisión interna", "Internal review"], approved: ["Aprobada internamente", "Approved"],
  sent: ["Enviada", "Sent"], accepted: ["Aceptada", "Accepted"], rejected: ["Rechazada", "Rejected"], expired: ["Vencida", "Expired"],
  superseded: ["Reemplazada", "Superseded"],
};
export const STATUS_TONE: Record<QuoteStatus, "neutral" | "info" | "warn" | "ok" | "danger"> = {
  draft: "neutral", internal_review: "warn", approved: "info", sent: "info", accepted: "ok", rejected: "danger", expired: "danger", superseded: "neutral",
};
/** Action button text + what the owner must write down for it. */
export const TRANSITION_UI: Partial<Record<QuoteStatus, { label: Bi; note?: Bi }>> = {
  internal_review: { label: ["Enviar a revisión interna", "Send to internal review"] },
  approved: { label: ["Aprobar internamente", "Approve internally"] },
  draft: { label: ["Volver a borrador", "Back to draft"] },
  sent: { label: ["Registrar envío manual", "Record manual send"], note: ["¿Cómo y cuándo se envió? (ej.: PDF por correo el 19/11)", "How and when was it sent? (e.g. PDF by e-mail on 11/19)"] },
  accepted: { label: ["Registrar aceptación", "Record acceptance"], note: ["Evidencia: quién aceptó, por qué medio y dónde quedó guardado", "Evidence: who accepted, how, and where it is stored"] },
  rejected: { label: ["Registrar rechazo", "Record rejection"], note: ["Motivo del rechazo", "Reason for rejection"] },
  expired: { label: ["Marcar como vencida", "Mark as expired"] },
  superseded: { label: ["Marcar como reemplazada", "Mark as superseded"], note: ["¿Qué cotización la reemplaza?", "Which quote replaces it?"] },
};
export const OK_TEXT: Record<string, Bi> = {
  deleted: ["Cotización eliminada (archivada). Su historial se conserva para auditoría.", "Quote deleted (archived). Its history is kept for audit."],
  created: ["Cotización creada como borrador (v1). Revisa el PDF antes de descargarlo.", "Quote created as draft (v1). Review the PDF before downloading."],
  existing: ["Esta cotización ya se había guardado; no se creó un duplicado.", "This quote was already saved; no duplicate was created."],
  revised: ["Nueva revisión guardada. La cotización volvió a borrador para su aprobación.", "New revision saved. The quote is back in draft for approval."],
  status_internal_review: ["Enviada a revisión interna.", "Sent to internal review."],
  status_approved: ["Aprobada internamente. Ya puedes descargarla y registrar el envío.", "Approved internally. You can now download it and record the send."],
  status_draft: ["La cotización volvió a borrador.", "The quote is back in draft."],
  status_sent: ["Envío registrado. Avalon no envía correos: el registro refleja tu envío manual.", "Send recorded. Avalon sends no e-mail: this records your manual send."],
  status_accepted: ["Aceptación registrada. No se creó ninguna venta ni pago: el siguiente paso es el contrato.", "Acceptance recorded. No sale or payment was created: the next step is the agreement."],
  status_rejected: ["Rechazo registrado.", "Rejection recorded."],
  status_expired: ["Marcada como vencida.", "Marked as expired."],
  status_superseded: ["Marcada como reemplazada.", "Marked as superseded."],
};
export const ERROR_TEXT: Record<string, Bi> = {
  invalid: ["Solicitud no válida.", "Invalid request."],
  fields: ["Hay campos incompletos o no válidos. Revisa el paso «Revisión».", "Some fields are missing or invalid. Check the Review step."],
  schema: ["El Quoting Studio todavía no está activado en esta base de datos (migración pendiente de aprobación).", "Quoting Studio is not yet enabled in this database (migration pending approval)."],
  save: ["No se pudo guardar. Inténtalo de nuevo.", "Could not save. Please try again."],
  crm_forbidden: ["Solo los propietarios pueden gestionar cotizaciones.", "Only owners can manage quotes."],
  quote_lead_missing: ["La oportunidad no existe o está archivada.", "The opportunity does not exist or is archived."],
  quote_missing: ["La cotización no existe.", "The quote does not exist."],
  quote_version_conflict: ["Otra persona cambió esta cotización. Recarga la página y vuelve a intentarlo.", "Someone else changed this quote. Reload and try again."],
  quote_not_revisable: ["Una cotización enviada o cerrada no se modifica: crea una cotización nueva.", "A sent or closed quote is not edited: create a new quote."],
  quote_invalid_transition: ["Ese cambio de estado no está permitido.", "That status change is not allowed."],
  quote_note_required: ["Escribe una nota de al menos 8 caracteres con la evidencia.", "Write a note of at least 8 characters with the evidence."],
  quote_commission_to_negotiate: ["El porcentaje de comisión sigue por acordar: emite una nueva cotización con el porcentaje acordado y marca esta como reemplazada.", "The commission percentage is still to be agreed: issue a new quote with the agreed percentage and mark this one as superseded."],
  quote_expired: ["La cotización está vencida; no puede aceptarse.", "The quote has expired; it cannot be accepted."],
  quote_delete_forbidden: ["Solo Miguel y Samuel (owners) pueden eliminar cotizaciones.", "Only Miguel and Samuel (owners) can delete quotes."],
  quote_delete_accepted: ["Una cotización aceptada no se elimina: es un documento consolidado. Márcala como reemplazada si hay nuevas condiciones.", "An accepted quote cannot be deleted: it is a consolidated document. Mark it superseded if terms changed."],
  quote_delete_has_dependents: ["No se puede eliminar: tiene una venta, términos aceptados o un borrador de contrato vinculados. Esos registros se conservan.", "Cannot delete: a sale, accepted terms or an agreement draft depend on it. Those records are kept."],
  quote_deleted: ["Esta cotización está eliminada (archivada) y ya no admite cambios.", "This quote is deleted (archived) and no longer accepts changes."],
  quote_delete_invalid: ["El motivo de eliminación no es válido.", "The deletion reason is not valid."],
  quote_variable_terms_incomplete: ["Estándar Avalon: una propuesta con porcentaje o comisión no se aprueba, envía ni acepta sin todas sus condiciones esenciales. Edita la cotización (nueva revisión) y completa:", "Avalon standard: a percentage or commission proposal cannot be approved, sent or accepted without all its essential terms. Edit the quote (new revision) and complete:"],
  quote_invalid_model_shape: ["Los conceptos no coinciden con el modelo de cobro elegido.", "The items do not match the chosen billing model."],
  quote_invalid_lines: ["Algún concepto tiene precio o cantidad no válidos.", "An item has an invalid price or quantity."],
  quote_invalid_commission: ["Revisa las condiciones de la comisión.", "Check the commission terms."],
  quote_invalid_dates: ["Revisa las fechas de emisión y vencimiento.", "Check the issue and valid-until dates."],
  quote_invalid_content: ["Contenido de cotización no válido.", "Invalid quote content."],
};
