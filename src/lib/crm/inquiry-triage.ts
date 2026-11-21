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

  // Very specific directory-registration pitch. Do not flag legitimate clients
  // who merely ask Avalon to help submit their own site to a search index.
  const listingPitch = /\b(?:add|list|register)\b.{0,100}\b(?:[a-z0-9-]+\.(?:com|net|org)|website|domain|site)\b.{0,100}\b(?:google(?:'s)? search index|search index|online search results)\b/i;
  const unsolicitedCta = /\b(?:register now|sign up now|submit now|to be displayed in online search results)\b/i;
  if (listingPitch.test(body) && unsolicitedCta.test(body)) return "indexing_solicitation";

  // An offer TO Avalon needs explicit sales outreach plus a vendor's service
  // pitch. Mentioning SEO, a price list or marketing alone is not suspicious.
  const unsolicitedApproach = /\b(?:may i send you|can i send you|i wanted to reach out|we help businesses)\b/i;
  const providerOffer = /\b(?:we offer|we help businesses|our agency offers|may i send you (?:a |our )?(?:quote|proposal|price list))\b/i;
  const marketingPitch = /\b(?:seo|rank higher|website traffic|search platforms|online visibility|backlinks|lead generation|price list)\b/i;
  if (unsolicitedApproach.test(body) && providerOffer.test(body) && marketingPitch.test(body)) return "vendor_outreach";

  return null;
}
