/**
 * Commercial Foundation: local estimates only. No sales, invoices, payments or
 * commissions are created here. Prices and costs are supplied by a human;
 * this module does not provide approved catalog prices.
 *
 * Exact decimal arithmetic uses bigint internally. Values returned to the UI
 * are integer USD cents and never include inferred or unknown costs.
 */
export type SetupInput = {
  setupPrice: string;
  laborHours: string;
  hourlyRate: string;
  externalCosts: string;
  contingency: string;
  targetMargin: string;
};
export type SetupEstimate =
  | { status: "incomplete" | "invalid" }
  | { status: "ready"; priceCents: number; costCents: number;
      profitCents: number; marginPercent: number; minimumPriceCents: number };

export type CommissionInput = {
  collectedAmount: string;
  excludedAmount: string;
  ratePercent: string;
  signedTerms: boolean;
  eligibleAttribution: boolean;
  collectionVerified: boolean;
  legalReviewApproved: boolean;
};
export type CommissionEstimate =
  | { status: "incomplete" | "invalid"; reasons: string[] }
  | { status: "pending" | "eligible"; baseCents: number;
      estimatedCents: number; eligibleCents: number | null; reasons: string[] };

const MONEY_PATTERN = /^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,2})?$/;
const HOURS_PATTERN = /^(?:0|[1-9][0-9]{0,4})(?:\.[0-9]{1,2})?$/;
const PERCENT_PATTERN = /^(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,2})?$/;
const MAX_CENTS = BigInt(9999999999);

function hundredths(value: string, pattern: RegExp): bigint | null {
  if (typeof value !== "string" || !pattern.test(value)) return null;
  const [whole, decimals = ""] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(decimals.padEnd(2, "0") || "0");
}
function toSafeCents(value: bigint): number | null {
  if (value > MAX_CENTS || value < -MAX_CENTS) return null;
  return Number(value);
}
function missing(fields: string[]): boolean {
  return fields.some(value => typeof value !== "string" || value.trim() === "");
}

/** Setup estimate; a separate call must be made for each billing cadence. */
export function estimateSetup(input: SetupInput): SetupEstimate {
  if (missing([input.setupPrice, input.laborHours, input.hourlyRate,
               input.externalCosts, input.contingency, input.targetMargin])) return { status: "incomplete" };
  const price = hundredths(input.setupPrice, MONEY_PATTERN);
  const hours = hundredths(input.laborHours, HOURS_PATTERN);
  const rate = hundredths(input.hourlyRate, MONEY_PATTERN);
  const external = hundredths(input.externalCosts, MONEY_PATTERN);
  const contingency = hundredths(input.contingency, MONEY_PATTERN);
  const margin = hundredths(input.targetMargin, PERCENT_PATTERN);
  if (price === null || hours === null || rate === null || external === null ||
      contingency === null || margin === null || price <= BigInt(0) || margin > BigInt(9000))
    return { status: "invalid" };
  const labor = (hours * rate + BigInt(50)) / BigInt(100); // round half-up to a cent
  const cost = labor + external + contingency;
  const profit = price - cost;
  const denominator = BigInt(10000) - margin;
  const minimumPrice = (cost * BigInt(10000) + denominator - BigInt(1)) / denominator;
  const costCents = toSafeCents(cost);
  const minimumPriceCents = toSafeCents(minimumPrice);
  const profitCents = toSafeCents(profit);
  if (costCents === null || minimumPriceCents === null || profitCents === null)
    return { status: "invalid" };
  return {
    status: "ready",
    priceCents: Number(price),
    costCents,
    profitCents,
    marginPercent: Number((profit * BigInt(10000)) / price) / 100,
    minimumPriceCents,
  };
}

/**
 * Estimates a potential commission but never declares it paid or collected.
 * Eligibility requires independently verified contractual and legal evidence.
 */
export function estimateCommission(input: CommissionInput): CommissionEstimate {
  if (missing([input.collectedAmount, input.excludedAmount, input.ratePercent]))
    return { status: "incomplete", reasons: ["missing_fields"] };
  const collected = hundredths(input.collectedAmount, MONEY_PATTERN);
  const excluded = hundredths(input.excludedAmount, MONEY_PATTERN);
  const rate = hundredths(input.ratePercent, PERCENT_PATTERN);
  if (collected === null || excluded === null || rate === null ||
      rate > BigInt(10000) || excluded > collected)
    return { status: "invalid", reasons: ["invalid_amount_or_rate"] };
  const base = collected - excluded;
  const commission = (base * rate + BigInt(5000)) / BigInt(10000); // nearest cent
  const baseCents = toSafeCents(base);
  const estimatedCents = toSafeCents(commission);
  if (baseCents === null || estimatedCents === null)
    return { status: "invalid", reasons: ["amount_overflow"] };
  const reasons: string[] = [];
  if (!input.signedTerms) reasons.push("terms_not_verified");
  if (!input.eligibleAttribution) reasons.push("attribution_not_verified");
  if (!input.collectionVerified) reasons.push("collection_not_verified");
  if (!input.legalReviewApproved) reasons.push("legal_review_pending");
  return {
    status: reasons.length ? "pending" : "eligible",
    baseCents,
    estimatedCents,
    eligibleCents: reasons.length ? null : estimatedCents,
    reasons,
  };
}
