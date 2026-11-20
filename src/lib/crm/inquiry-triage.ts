/**
 * Conservative, read-only triage for owner-visible website inquiries.
 *
 * These are hints for a human, NOT a spam verdict, authorization check or
 * automated prospect mutation. Avoid looking at personal identity, region,
 * language, email provider or selected services to prevent unfair filtering.
 * A confirmed sales opportunity must always be decided by an owner.
 */
export type InquiryTriageReason = "indexing_solicitation" | "vendor_outreach" | null;

export function inquiryTriageReason(message: unknown): InquiryTriageReason {
  if (typeof message !== "string") return null;
  const body = message.slice(0, 5000).replace(/\s+/g, " ").trim().toLowerCase();
  if (!body) return null;

  // Common solicitations that impersonate an external search directory.
  const indexOffer = /\b(add|register|submit|list|include)\b.{0,120}\b(domain|website|site|avaloncoreagency\.com)\b.{0,120}\b(search index|search results|google(?:'s)? search|online search|indexing)\b/i;
  const inverseIndexOffer = /\b(search index|google(?:'s)? search|indexing)\b.{0,120}\b(register|submit|list|add)\b/i;
  if (indexOffer.test(body) || inverseIndexOffer.test(body)) return "indexing_solicitation";

  // Sales pitches TO Avalon, rather than businesses asking Avalon for help.
  // Require both an unsolicited seller-intent phrase and a provider offer.
  const sellerIntent = /\b(may i send you|can i send you|i wanted to reach out|we help businesses|we offer|our agency offers|our services help)\b/i;
  const outboundOffer = /\b(we offer|we help businesses|our agency offers|may i send you (?:a |our )?(?:quote|proposal|price list)|send you (?:a |our )?(?:quote|proposal|price list))\b/i;
  const marketingPitch = /\b(seo|rank higher|website traffic|search platforms|online visibility|backlinks|lead generation|price list)\b/i;
  if (sellerIntent.test(body) && outboundOffer.test(body) && marketingPitch.test(body)) return "vendor_outreach";

  return null;
}
