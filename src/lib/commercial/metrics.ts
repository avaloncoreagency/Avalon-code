/**
 * Verified KPI calculations. Unknown, disconnected or partial sources never
 * become a false zero. All monetary inputs are integer cents.
 */
export type ObservedCount = { status: "verified"; value: number }
  | { status: "unavailable" | "not_connected" | "partial" };
export type ObservedCents = { status: "verified"; cents: number }
  | { status: "unavailable" | "not_connected" | "partial" };
export type KpiValue = { status: "verified"; value: number } | { status: "n_a" };

function count(source: ObservedCount): number | null {
  return source.status === "verified" && Number.isSafeInteger(source.value) && source.value >= 0
    ? source.value : null;
}
function cents(source: ObservedCents): number | null {
  return source.status === "verified" && Number.isSafeInteger(source.cents) && source.cents >= 0
    ? source.cents : null;
}
const na = (): KpiValue => ({ status: "n_a" });

/** Returns a percentage; N/A when no verified denominator. */
export function conversionRate(wins: ObservedCount, eligibleLeads: ObservedCount): KpiValue {
  const numerator = count(wins);
  const denominator = count(eligibleLeads);
  if (numerator === null || denominator === null || denominator === 0 ||
      numerator > denominator) return na();
  return { status: "verified", value: numerator / denominator * 100 };
}

/** Cost per unique eligible lead in integer cents; never spend per submission. */
export function costPerLead(adSpend: ObservedCents, uniqueValidLeads: ObservedCount): KpiValue {
  const spend = cents(adSpend);
  const leads = count(uniqueValidLeads);
  if (spend === null || leads === null || leads === 0) return na();
  return { status: "verified", value: Math.round(spend / leads) };
}

/** Gross contractor job value is not Avalon revenue. Only reconciled commission receipts are. */
export function avalonCommissionRevenue(receivedCommission: ObservedCents): KpiValue {
  const actual = cents(receivedCommission);
  return actual === null ? na() : { status: "verified", value: actual };
}
