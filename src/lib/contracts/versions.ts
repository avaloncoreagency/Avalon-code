import v11 from "./master.json";
import v12 from "./master-1.2.json";

/**
 * Master agreement versions. Lifecycle: draft → internal_review → attorney_review_required → approved → retired.
 * No version here is "approved": none has completed professional legal review, so every generated document keeps the
 * ATTORNEY REVIEW REQUIRED banner. Accepted/generated drafts freeze their clause text in the snapshot, so publishing a
 * new version never changes a document retroactively.
 */
export type ReviewStatus = "draft" | "internal_review" | "attorney_review_required" | "approved" | "retired";
/** availableForNewDrafts: only a version the owners already use (1.1) or one an attorney has approved may start NEW drafts.
 * A new version under review is published for reading/review only — never offered as a contract to sign. */
export type MasterVersion = { version: string; status: ReviewStatus; clauses: [string, string][]; changeSummary: string[]; supersedes: string | null; availableForNewDrafts: boolean };

export const MASTER_VERSIONS: MasterVersion[] = [
  { version: v11.version, status: "attorney_review_required", clauses: v11.clauses.map(c => [c[0], c[1]]), changeSummary: [], supersedes: null, availableForNewDrafts: true },
  { version: v12.version, status: "attorney_review_required", clauses: v12.clauses.map(c => [c[0], c[1]] as [string, string]), changeSummary: v12.changeSummary, supersedes: v12.supersedes, availableForNewDrafts: false },
];
/** Default for new drafts stays the version the owners have been using until they explicitly switch. */
export const DEFAULT_MASTER_VERSION = v11.version;
export const REVIEW_LABEL: Record<ReviewStatus, [string, string]> = {
  draft: ["Borrador", "Draft"], internal_review: ["Revisión interna", "Internal review"], attorney_review_required: ["Requiere revisión de abogado", "Attorney review required"],
  approved: ["Aprobado", "Approved"], retired: ["Retirado", "Retired"],
};
export function masterVersion(version: string | null | undefined): MasterVersion | null {
  return MASTER_VERSIONS.find(v => v.version === version) ?? null;
}
/** Versions that may be used for NEW drafts (never retired ones, never versions still pending attorney review). */
export const selectableVersions = () => MASTER_VERSIONS.filter(v => v.status !== "retired" && v.availableForNewDrafts);
/** Versions shown for review only (not offered for new drafts until an attorney approves them). */
export const reviewOnlyVersions = () => MASTER_VERSIONS.filter(v => v.status !== "retired" && !v.availableForNewDrafts);
