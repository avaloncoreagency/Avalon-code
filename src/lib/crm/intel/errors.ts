import { pick, type Lang } from "@/lib/i18n";

/** Map a database / validation error to a stable code for the UI. Never shows raw database messages. */
export function intelErrorCode(error: { code?: string; message?: string } | null | undefined): string {
  const m = error?.message ?? "";
  const known = m.match(/\b(won_requires_verified_contract|commission_approval_forged|attachment_hash_mismatch|task_link_mismatch|contract_[a-z_]+|assessment_invalid|lead_not_found|crm_forbidden)\b/)?.[1];
  if (known) return known;
  if (/Motivo de pérdida/.test(m)) return "loss_reason_required";
  if (/etapa está desactivada/i.test(m)) return "stage_inactive";
  if (error?.code === "42501") return "crm_forbidden";
  if (error?.code === "23505") return "duplicate";
  if (error?.code === "PGRST202" || error?.code === "PGRST205" || error?.code === "42P01" || error?.code === "42703" || error?.code === "PGRST204") return "schema_pending";
  if (error?.code && ["23514", "22023", "22P02", "23502", "23503", "22001", "22003"].includes(error.code)) return "invalid";
  return "unavailable";
}

const TEXT: Record<string, [string, string]> = {
  won_requires_verified_contract: ["No se puede marcar como Ganado ni activar el cliente: falta un contrato firmado y verificado.", "Cannot mark as Won or activate the client: a signed and verified contract is missing."],
  contract_transition_invalid: ["Ese cambio de estado del contrato no está permitido desde el estado actual.", "That contract status change is not allowed from the current status."],
  contract_signature_details_required: ["Indica la fecha de firma y el nombre de quien firmó.", "Enter the signing date and the signer's name."],
  contract_evidence_required: ["Adjunta el documento firmado o indica la referencia del sobre de firma.", "Attach the signed document or enter the signature envelope reference."],
  contract_verification_evidence_required: ["Para verificar, elige el método y describe la revisión (mínimo 15 caracteres). Una casilla no es una firma.", "To verify, choose the method and describe the review (15+ characters). A checkbox is not a signature."],
  contract_verified_immutable: ["La evidencia de un contrato verificado no se puede modificar.", "A verified contract's evidence cannot be changed."],
  contract_attachment_foreign: ["El documento debe pertenecer a este mismo lead.", "The document must belong to this same lead."],
  contract_lead_immutable: ["Un contrato no se puede mover a otro lead.", "A contract cannot be moved to another lead."],
  assessment_invalid: ["Respuestas no válidas.", "Invalid answers."],
  lead_not_found: ["El lead no existe o está archivado.", "The lead does not exist or is archived."],
  crm_forbidden: ["Solo los propietarios de Avalon pueden hacer esto.", "Only Avalon owners can do this."],
  duplicate: ["Ya existe un lead con esos datos. Revisa los posibles duplicados.", "A lead with that data already exists. Review the possible duplicates."],
  schema_pending: ["La migración de CRM Intelligence (20261111100000) no está aplicada en este entorno.", "The CRM Intelligence migration (20261111100000) is not applied in this environment."],
  invalid: ["Revisa los datos: hay un valor fuera de rango o con formato incorrecto.", "Check the data: a value is out of range or badly formatted."],
  conflict: ["Otra persona guardó cambios mientras editabas. Se recargó la versión actual; revisa y vuelve a guardar.", "Someone else saved changes while you were editing. The current version was reloaded; review and save again."],
  stale_recommendation: ["Esta recomendación ya no está vigente según el diagnóstico actual. No puede aceptarse ni editarse sin nueva evidencia.", "This recommendation is no longer current under the latest diagnosis. It cannot be accepted or edited without new evidence."],
  loss_reason_required: ["Para marcar como Perdido indica el motivo.", "To mark as Lost, enter the reason."],
  stage_inactive: ["Esa etapa está desactivada.", "That stage is disabled."],
  company_required: ["Escribe al menos el nombre comercial.", "Enter at least the business name."],
  reason_required: ["El ajuste manual necesita una justificación (mínimo 15 caracteres).", "A manual adjustment needs a justification (15+ characters)."],
  commission_approval_forged: ["Aprueba tú la comisión: cambió o la aprobó otro propietario.", "Approve the commission yourself: it changed or another owner approved it."],
  attachment_hash_mismatch: ["El archivo no coincide con su huella de integridad. Vuelve a subirlo.", "The file does not match its integrity hash. Upload it again."],
  task_link_mismatch: ["La tarea apunta a una venta o proyecto de otro cliente.", "The task points to a sale or project of another client."],
  commission_needs_approval: ["Una comisión acordada necesita tu aprobación explícita (marca la casilla).", "An agreed commission needs your explicit approval (tick the box)."],
  unavailable: ["No se pudo completar. Comprueba tu conexión e inténtalo de nuevo: no se perdió nada de lo guardado.", "Could not complete. Check your connection and try again: nothing already saved was lost."],
};
export const intelErrorText = (lang: Lang, code: string) => pick(lang, ...(TEXT[code] ?? TEXT.unavailable));
