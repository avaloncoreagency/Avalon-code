// Seller pipeline shared helpers (staff portal). Data always comes from the brokered staff_seller_* RPCs, which
// return only the calling seller's own leads, proposals and sales; nothing here widens what the database allows.
import type { QuoteContent, QuoteStatus } from "@/lib/quotes/model";

export const SELLER_TITLES = ["seller", "account_executive"] as const;
export const isSellerTitle = (title: string | null | undefined) => (SELLER_TITLES as readonly string[]).includes(title ?? "");

export type SellerLead = {
  lead_id: string; company: string; contact: string; contact_title: string; email: string | null; phone: string; website: string;
  city: string; stage_id: string; stage_label: string; stage_kind: "open" | "won" | "lost"; value: string | number;
  next_action: string; follow_up_at: string | null; contract_status: string; version: number; updated_at: string;
};
export type SellerStage = { id: string; label: string; kind: "open" | "won" | "lost"; position: number };
export type SellerQuote = {
  quote_id: string; quote_number: string; lead_id: string; company: string; title: string; status: QuoteStatus; current_version: number;
  valid_until: string; model: string; one_time_total: string | number; monthly_total: string | number; version: number;
  sale_id: string | null; sale_number: string | null; updated_at: string;
};
export type SellerQuoteDetail = {
  quote_id: string; quote_number: string; lead_id: string; company: string; status: QuoteStatus; current_version: number; version: number;
  valid_until: string; content: QuoteContent; content_sha256: string; model: string;
  one_time_total: string | number; monthly_total: string | number; contract_status: string; contract_verified_for_revision: boolean; distribution_ready: boolean; sale_id: string | null; closed: boolean;
  events: { to: QuoteStatus; from: QuoteStatus | null; note: string | null; at: string; version: number }[];
};
export type SellerSale = {
  sale_id: string; sale_number: string; company: string | null; sold_on: string; status: string; currency: string;
  total: string | number; recurring_monthly: string | number | null; billing_mode: string; contract_status: string;
  quote_number: string | null; paid_verified: string | number;
};
export type SellerCatalog = {
  code: string; name: string; name_en: string; deliverables: string; billing_type: "one_time" | "monthly" | "annual";
  suggested_price: string | number | null; monthly_price: string | number | null; offer_status: string;
};

/** What a seller may do next with a proposal. Approval is the owners'; closing needs an owner-verified contract. */
export const SELLER_TRANSITIONS: Partial<Record<QuoteStatus, QuoteStatus[]>> = {
  draft: ["internal_review"],
  internal_review: ["draft"],
  approved: ["sent", "draft"],
  sent: ["accepted", "rejected"],
};

export const CONTRACT_LABEL: Record<string, string> = {
  not_started: "Sin contrato", draft: "Contrato en borrador", internal_review: "Contrato en revisión", sent_for_signature: "Enviado a firma",
  signed_pending_verification: "Firmado, pendiente de verificación", verified_signed: "Contrato verificado", rejected: "Contrato rechazado", expired: "Contrato vencido",
};

export const SELLER_MESSAGES: Record<string, string> = {
  "deletion-requested": "Solicitud enviada a la dirección.",
  "deletion-cancelled": "Solicitud cancelada.",
  commercial_offer_not_approved: "La oferta del catálogo requiere aprobación comercial.",
  "lead-created": "Lead creado. Es tuyo: solo tú y la dirección lo pueden ver.",
  "lead-existing": "Ese lead ya se había guardado; no se creó un duplicado.",
  "lead-saved": "Lead actualizado.",
  "quote-created": "Propuesta creada como borrador.",
  "quote-revised": "Nueva revisión guardada. Volvió a borrador.",
  "quote-status": "Estado de la propuesta actualizado.",
  "sale-closed": "Venta registrada. La dirección verifica pagos y comisiones.",
  staff_lead_invalid: "Revisa los datos del lead (empresa obligatoria, correo válido, valor positivo).",
  staff_lead_version_conflict: "El lead cambió mientras lo editabas. Revisa la versión actual.",
  staff_lead_won_by_sale: "Un lead se marca como ganado solo al cerrar la venta.",
  staff_lead_loss_reason_required: "Para marcarlo como perdido escribe el motivo.",
  quote_owner_approval_required: "La aprobación del precio la hace la dirección. Envíala a revisión interna.",
  won_requires_verified_contract: "Antes de cerrar la venta, la dirección debe registrar y verificar el contrato firmado.",
  quote_closed_by_other_seller: "Esta propuesta ya fue cerrada; no puedes acceder a una venta ajena.",
  commercial_offer_changed: "El servicio del catálogo cambió; solicita una nueva revisión y aprobación.",
  quote_not_accepted: "Solo se cierra una propuesta aceptada por el cliente.",
  quote_version_changed: "La propuesta cambió. Recarga antes de cerrar.",
  quote_line_not_in_catalog: "Cada línea debe ser un servicio del catálogo para poder cerrar la venta.",
  quote_needs_service_line: "La propuesta necesita al menos un servicio del catálogo.",
  crm_forbidden: "No tienes permiso sobre ese registro.",
  denied: "No tienes permiso para esa acción.",
  invalid: "Revisa los campos del formulario.",
  failed: "No se pudo confirmar el cambio. Revisa antes de repetirlo.",
};

const KNOWN = Object.keys(SELLER_MESSAGES);
/** Maps a database error to a known, user-safe code (never echoes raw messages). */
export function sellerErrorCode(error: { message?: string; code?: string } | null): string {
  if (!error) return "failed";
  const words = (error.message ?? "").match(/[a-z_]+/g) ?? [];
  return words.find(w => KNOWN.includes(w) && w.includes("_")) ?? (error.code === "42501" ? "denied" : "failed");
}

/** "HH:MM" (24 h) of an instant in a time zone, for <input type="time"> defaults. */
export const hhmm = (iso: string, tz: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

export const money = (v: string | number | null | undefined) =>
  new Intl.NumberFormat("es-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(v ?? 0));
