/**
 * Product delivery lifecycle (Commercial Core 360 · 8.2). Pure domain logic, mirrored by the database trigger
 * os_private.product_delivery_guard (the database is the authority).
 *
 * Stored in os_projects.settings.delivery = { stage, history[] }. A product without `delivery` is a draft.
 * A URL alone never makes a product "published": live_verified needs an HTTPS URL on the product AND written evidence.
 */

export const DELIVERY_STAGES = [
  "draft", "pending_development", "in_development", "in_review", "ready_to_deliver", "delivered", "live_verified", "maintenance",
] as const;
export type DeliveryStage = (typeof DELIVERY_STAGES)[number];

export const DELIVERY_TRANSITIONS: Record<DeliveryStage, readonly DeliveryStage[]> = {
  draft: ["pending_development", "in_development"],
  pending_development: ["in_development", "draft"],
  in_development: ["in_review", "pending_development"],
  in_review: ["ready_to_deliver", "in_development"],
  ready_to_deliver: ["delivered", "in_review"],
  delivered: ["live_verified", "in_review"],
  live_verified: ["maintenance", "in_review"],
  maintenance: ["in_review", "live_verified"],
};
/** Stages that record a fact about the client and therefore need a written note (≥ 8 characters). */
export const DELIVERY_NOTE_REQUIRED: readonly DeliveryStage[] = ["delivered", "live_verified"];
export const DELIVERY_HISTORY_MAX = 200;

export type DeliveryEvent = { from: DeliveryStage; to: DeliveryStage; at: string; by: string; note: string; evidence_url: string };
export type Delivery = { stage: DeliveryStage; history: DeliveryEvent[] };

export const DELIVERY_LABEL: Record<DeliveryStage, readonly [string, string]> = {
  draft: ["Borrador", "Draft"],
  pending_development: ["Pendiente de desarrollo", "Pending development"],
  in_development: ["En desarrollo", "In development"],
  in_review: ["En revisión", "In review"],
  ready_to_deliver: ["Listo para entregar", "Ready to deliver"],
  delivered: ["Entregado", "Delivered"],
  live_verified: ["Publicado y verificado", "Live and verified"],
  maintenance: ["Mantenimiento", "Maintenance"],
};
export const DELIVERY_TONE: Record<DeliveryStage, "neutral" | "info" | "warn" | "ok"> = {
  draft: "neutral", pending_development: "neutral", in_development: "info", in_review: "warn",
  ready_to_deliver: "info", delivered: "ok", live_verified: "ok", maintenance: "info",
};

const isStage = (v: unknown): v is DeliveryStage => typeof v === "string" && (DELIVERY_STAGES as readonly string[]).includes(v);
const httpsUrl = (v: unknown) => {
  if (typeof v !== "string" || !v) return false;
  try { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; }
};

/** Reads settings.delivery defensively; anything malformed is treated as an untouched draft (never as "published"). */
export function readDelivery(settings: unknown): Delivery {
  const raw = settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Record<string, unknown>).delivery : null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { stage: "draft", history: [] };
  const d = raw as Record<string, unknown>;
  const history = Array.isArray(d.history) ? d.history.filter((e): e is DeliveryEvent =>
    !!e && typeof e === "object" && isStage((e as DeliveryEvent).from) && isStage((e as DeliveryEvent).to) && typeof (e as DeliveryEvent).at === "string") : [];
  return { stage: isStage(d.stage) ? d.stage : "draft", history };
}

export type TransitionInput = { to: string; note: string; evidenceUrl: string; productUrl: string; actor: string; now: string };

/** Returns the next settings.delivery value, or throws a stable error code. */
export function nextDelivery(current: Delivery, input: TransitionInput): Delivery {
  if (!isStage(input.to)) throw Error("delivery_invalid_stage");
  if (!DELIVERY_TRANSITIONS[current.stage].includes(input.to)) throw Error("delivery_invalid_transition");
  const note = input.note.trim();
  if (note.length > 1000) throw Error("delivery_note_too_long");
  if (DELIVERY_NOTE_REQUIRED.includes(input.to) && note.length < 8) throw Error("delivery_note_required");
  const evidence = input.evidenceUrl.trim();
  if (evidence && !httpsUrl(evidence)) throw Error("delivery_invalid_evidence");
  if (input.to === "live_verified") {
    // Published means: the product has a real HTTPS address AND someone checked it, writing down how.
    if (!httpsUrl(input.productUrl)) throw Error("delivery_url_required");
    if (!evidence) throw Error("delivery_evidence_required");
  }
  if (current.history.length >= DELIVERY_HISTORY_MAX) throw Error("delivery_history_full");
  return {
    stage: input.to,
    history: [...current.history, { from: current.stage, to: input.to, at: input.now, by: input.actor, note, evidence_url: evidence }],
  };
}
