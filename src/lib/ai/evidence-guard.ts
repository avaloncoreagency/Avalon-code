/**
 * Evidence and draft-text guards for AI-assisted sales analysis. Pure functions: no I/O, no secrets, no AI provider.
 *
 * Threat model (issue #68 / #98):
 *  - A "public source" must be something a stranger on the internet can read. An internal address
 *    (localhost, private/metadata IPs, intranet suffixes, Avalon's own admin or database hosts) is never a verified
 *    public source: it would let a crafted record turn a private page into "evidence".
 *  - Prospect-controlled text (company names, notes) is data. It may carry invisible or bidirectional characters
 *    that hide instructions from a human reviewer.
 *  - Model output is data too: a hijacked draft must not smuggle links, e-mail addresses or markup into text that
 *    an owner will read and copy.
 * Missing data never becomes a fact: every guard answers null/false when unsure.
 */

/** Hostnames that name private networks or a single machine. Matched as the exact host or any subdomain. */
const PRIVATE_SUFFIXES = [
  "localhost", "local", "localdomain", "internal", "intranet", "private", "lan", "home", "corp", "home.arpa",
];
/** Avalon's own surfaces. Never third-party evidence, and the admin app is behind the login. */
const AVALON_HOSTS = ["avaloncoreagency.com", "supabase.co", "supabase.in", "supabase.net"];

const hasSuffix = (host: string, suffix: string) => host === suffix || host.endsWith("." + suffix);

/**
 * Normalized https URL of a public web source, or null. Query string and fragment are dropped (they can carry
 * tokens or personal identifiers). Only the default HTTPS port is accepted.
 */
export function publicEvidenceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 1000) return null;
  // The WHATWG/IDNA parsers silently drop tabs, newlines, soft hyphens and zero-width characters, so a string that
  // looks different from the domain it resolves to would pass. Reject every control or invisible character.
  if (/[\u0000- \u007f-\u009f­​-‏‪-‮⁠-⁩﻿]/.test(value)) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port !== "") return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host.startsWith("[") || /^\d+(\.\d+){3}$/.test(host)) return null; // IP literals (v4 after normalization, v6)
  if (!host.includes(".")) return null; // single-label names resolve only inside a private network
  const tld = host.slice(host.lastIndexOf(".") + 1);
  if (!/[a-z]/.test(tld)) return null; // purely numeric top level: not a registrable domain
  if (PRIVATE_SUFFIXES.some(s => hasSuffix(host, s)) || AVALON_HOSTS.some(s => hasSuffix(host, s))) return null;
  url.hostname = host;
  url.search = "";
  url.hash = "";
  return url.toString();
}

const INVISIBLE = /[​-‏‪-‮⁠-⁩﻿­]/g;

/**
 * Label taken from prospect data (company name, stage…): normalized, without invisible/bidirectional characters,
 * repeated spaces collapsed. Null if empty, too long, or containing any control character (incl. tab/newline).
 */
export function cleanUntrustedLabel(value: unknown, max: number): string | null {
  if (typeof value !== "string" || value.length > max * 4) return null;
  // Labels are single-line: tabs and line breaks are rejected, not silently flattened.
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value)) return null;
  const text = value.normalize("NFKC").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
  return text.length > 0 && text.length <= max ? text : null;
}

const UNSAFE_DRAFT = [
  /\b(?:https?|ftp|file|javascript|data|vbscript|mailto|tel|sms|whatsapp):/i, // any URI scheme that can act
  /\bwww\./i,                                                                  // scheme-less links
  /[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+/,                                       // e-mail addresses
  /[<>]/,                                                                       // HTML / markup
  /\]\(/, /```/, /`/,                                                           // markdown links and code
  /[​-‏‪-‮⁠-⁩﻿]/,                            // invisible / bidirectional controls
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/,                      // control characters
];
export const containsUnsafeDraftContent = (text: string) => UNSAFE_DRAFT.some(rule => rule.test(text));

/**
 * Text produced by a model (suggested action, qualification questions). Accepted only if it is plain prose:
 * no links, addresses, markup or hidden characters. The draft is for HUMAN REVIEW; it must not carry anything
 * clickable or executable. Null means "reject the whole response".
 */
export function safeDraftText(value: unknown, max: number): string | null {
  if (typeof value !== "string" || value.length > max * 2) return null;
  const text = value.trim().replace(/\s+/g, " ");
  if (!text || text.length > max || containsUnsafeDraftContent(text)) return null;
  return text;
}
