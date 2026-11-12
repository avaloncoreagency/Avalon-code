// Possible-duplicate detection for Quick Add. It only WARNS: records are never merged automatically, because two
// businesses can share a name (chains, franchises) or a phone (shared offices).
export type LeadLike = { id: string; company: string; phone: string; email: string | null; website: string; zip?: string; city?: string };
export type DuplicateHit = { id: string; company: string; reasons: ("phone" | "domain" | "email" | "name")[] };

export const phoneDigits = (p: string | null | undefined) => {
  const d = String(p ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;     // +1 (US) prefix is not part of the number
};
export function domainOf(url: string | null | undefined): string {
  const raw = String(url ?? "").trim().toLowerCase();
  if (!raw) return "";
  try { return new URL(/^https?:\/\//.test(raw) ? raw : "https://" + raw).hostname.replace(/^www\./, ""); } catch { return ""; }
}
const FREE_MAIL = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com", "live.com", "msn.com"]);
export const emailDomain = (e: string | null | undefined) => {
  const d = String(e ?? "").trim().toLowerCase().split("@")[1] ?? "";
  return FREE_MAIL.has(d) ? "" : d;
};
export const normName = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/\b(llc|inc|corp|co|ltd|the)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export function findDuplicates(candidate: Omit<LeadLike, "id">, existing: LeadLike[]): DuplicateHit[] {
  const phone = phoneDigits(candidate.phone), dom = domainOf(candidate.website) || emailDomain(candidate.email), name = normName(candidate.company);
  const email = (candidate.email ?? "").trim().toLowerCase();
  const hits: DuplicateHit[] = [];
  for (const e of existing) {
    const reasons: DuplicateHit["reasons"] = [];
    if (phone.length >= 7 && phoneDigits(e.phone) === phone) reasons.push("phone");
    if (dom && (domainOf(e.website) === dom || emailDomain(e.email) === dom)) reasons.push("domain");
    if (email && (e.email ?? "").trim().toLowerCase() === email) reasons.push("email");
    if (name && normName(e.company) === name) reasons.push("name");
    if (reasons.length) hits.push({ id: e.id, company: e.company, reasons });
  }
  return hits;
}

/**
 * Arguments for the server-side candidate search crm_lead_duplicate_candidates (migration 20261112090000). The database
 * returns a bounded superset over ALL leads (no 5,000-row read); findDuplicates then applies the exact rules above.
 */
export function duplicateCandidateArgs(candidate: Omit<LeadLike, "id">) {
  return {
    p_phone: phoneDigits(candidate.phone),
    p_email: (candidate.email ?? "").trim().toLowerCase(),
    p_domain: domainOf(candidate.website) || emailDomain(candidate.email),
    p_name: candidate.company ?? "",
  };
}
