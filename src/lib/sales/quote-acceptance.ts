/**
 * Compare the exact accepted quote (a versioned, immutable offer) with the
 * sale being confirmed. This function has no I/O; caller must verify owner,
 * quote status, canonical lead/client and catalog activation separately.
 *
 * A quote is not evidence of a signed agreement. This protects against
 * accidentally recording different items/prices against an accepted quote.
 */
import type { SaleLineInput } from "./domain";

export type AcceptedQuoteLine = {
  code: string | null; qty: number; unitPrice: string; description: string; kind: "one_time" | "monthly";
};
export type SaleCatalogLine = { code: string; billing_type: string };

const VALID_AMOUNT = /^\d{1,9}(\.\d{1,2})?$/;
function cents(v: string): number | null {
  if (!VALID_AMOUNT.test(v)) return null;
  const [whole, fraction = ""] = v.split(".");
  return Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
}

export function saleMatchesAcceptedQuote(
  saleLines: readonly SaleLineInput[],
  quoteLines: readonly AcceptedQuoteLine[],
  catalog: readonly SaleCatalogLine[],
  overallDiscount?: string, taxRate?: string,
): boolean {
  if (!saleLines.length || saleLines.length !== quoteLines.length || saleLines.length > 20) return false;
  if (Number(overallDiscount || 0) !== 0 || Number(taxRate || 0) !== 0) return false;
  const byCode = new Map(catalog.map(row => [row.code, row.billing_type]));
  return saleLines.every((sale, index) => {
    const quote = quoteLines[index];
    if (!quote || !quote.code || sale.service_code !== quote.code || byCode.get(quote.code) !== quote.kind) return false;
    if (Number(sale.discount ?? "0") !== 0 || (sale.description ?? "").trim() !== quote.description.trim()) return false;
    if (!Number.isFinite(quote.qty) || !Number.isInteger(quote.qty) || quote.qty < 1) return false;
    if (!sale.quantity || Number(sale.quantity) !== quote.qty || !sale.unit_price) return false;
    const salePrice = cents(sale.unit_price), quotePrice = cents(quote.unitPrice);
    return salePrice !== null && salePrice === quotePrice;
  });
}
