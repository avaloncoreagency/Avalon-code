// Reconcile rule-generated recommendations without erasing human decisions.
// When evidence changes (for example, a contractor loses required licensing),
// a stale automatic suggestion must never remain actionable.
import type { Recommendation } from "./recommendations";

export const AUTO_WITHDRAW_NOTE = "Retirada automáticamente: los datos actuales ya no respaldan esta recomendación.";

export type SavedRecommendation = {
  id: string; rule_id: string; status: "suggested" | "accepted" | "dismissed" | "edited";
  note: string; decided_by: string | null; version: number;
};

export type RecommendationChange = {
  id: string; version: number; ruleId: string; action: "withdraw" | "restore";
};

/**
 * Only automation-created, untouched suggestions may be withdrawn/restored automatically.
 * A human decision (accepted, edited or manually dismissed) is never overwritten.
 * All changes must additionally pass a version guard in the database.
 */
export function reconcileRecommendations(
  saved: SavedRecommendation[], current: Pick<Recommendation, "ruleId">[],
): { changes: RecommendationChange[]; humanReview: string[] } {
  const relevant = new Set(current.map(x => x.ruleId));
  const changes: RecommendationChange[] = [], humanReview: string[] = [];
  for (const old of saved) {
    if (relevant.has(old.rule_id)) {
      if (old.status === "dismissed" && old.note === AUTO_WITHDRAW_NOTE && old.decided_by === null)
        changes.push({ id: old.id, version: old.version, ruleId: old.rule_id, action: "restore" });
    } else if (old.status === "suggested") {
      changes.push({ id: old.id, version: old.version, ruleId: old.rule_id, action: "withdraw" });
    } else if (old.status === "accepted" || old.status === "edited") {
      humanReview.push(old.rule_id);
    }
  }
  return { changes, humanReview };
}
