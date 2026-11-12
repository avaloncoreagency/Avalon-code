/**
 * Pure, fail-closed policy evaluator for a FUTURE B2C contractor router.
 * It cannot save PII, send leads, change campaigns or create commissions.
 * This is deliberately NOT wired to the B2B agency CRM or public funnels.
 */
export type ContractorRoutePolicy = {
  campaignId: string;
  version: number;
  contractorId: string;
  enabled: boolean;
  signedContractVerified: boolean;
  licenseVerified: boolean;
  capacityAvailable: boolean;
  allowedZips: readonly string[];
  effectiveFromMs: number;
  effectiveUntilMs: number | null;
};
export type VisitorRouteRequest = {
  zip: string;
  displayedContractorId: string;
  consentedContractorId: string;
  displayedPolicyVersion: number;
  consentGiven: boolean;
  receivedAtMs: number;
};
export type RouteDecision = {
  status: "hold" | "eligible";
  contractorId: string | null;
  campaignId: string;
  policyVersion: number;
  reasons: string[];
};

/** Caller must independently enforce tenant isolation, RLS and idempotency. */
export function evaluateContractorRoute(
  policy: ContractorRoutePolicy,
  request: VisitorRouteRequest,
): RouteDecision {
  const reasons: string[] = [];
  if (!policy.campaignId || !policy.contractorId || !Number.isSafeInteger(policy.version) ||
      policy.version < 1) reasons.push("invalid_policy");
  if (!policy.enabled) reasons.push("campaign_inactive");
  if (!policy.signedContractVerified) reasons.push("contract_not_verified");
  if (!policy.licenseVerified) reasons.push("license_not_verified");
  if (!policy.capacityAvailable) reasons.push("capacity_unavailable");
  if (!/^\d{5}$/.test(request.zip) || !policy.allowedZips.includes(request.zip))
    reasons.push("out_of_service_area");
  if (!request.consentGiven) reasons.push("missing_consent");
  if (request.consentedContractorId !== policy.contractorId ||
      request.displayedContractorId !== policy.contractorId)
    reasons.push("destination_mismatch");
  if (request.displayedPolicyVersion !== policy.version) reasons.push("stale_disclosure");
  if (!Number.isFinite(request.receivedAtMs) ||
      !Number.isFinite(policy.effectiveFromMs) ||
      request.receivedAtMs < policy.effectiveFromMs ||
      (policy.effectiveUntilMs !== null &&
        (!Number.isFinite(policy.effectiveUntilMs) ||
         request.receivedAtMs >= policy.effectiveUntilMs)))
    reasons.push("policy_not_effective");
  return {
    status: reasons.length ? "hold" : "eligible",
    contractorId: reasons.length ? null : policy.contractorId,
    campaignId: policy.campaignId,
    policyVersion: policy.version,
    reasons,
  };
}
