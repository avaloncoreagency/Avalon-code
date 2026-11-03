import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";

const BOT = "AvalonResearchBot";
const AGENT = "AvalonResearchBot/1.0 (+https://avaloncoreagency.com; owner-requested business research)";
const MAX_HTML = 128 * 1024;
const MAX_ROBOTS = 512 * 1024;
const TIMEOUT_MS = 5_000;
export const MAX_RESEARCH_PAGES = 3;

export type FetchedPage = {
  url: string;
  status: number;
  contentType: string;
  text: string;
  complete: boolean;
};

export class ResearchBlocked extends Error {
  constructor(public readonly code: string, description: string) {
    super(description);
    this.name = "ResearchBlocked";
  }
}

export function websiteUrl(value: string): URL | null {
  try {
    if (typeof value !== "string" || value.length < 9 || value.length > 500) return null;
    const url = new URL(value.trim());
    // Never request plain HTTP, credentials, nonstandard ports, or network addresses.
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || (url.port && url.port !== "443" && url.port !== "80")) return null;
    if (isIP(url.hostname) !== 0) return null;
    if (url.hostname.length > 253 || !/^[a-z0-9.-]+$/i.test(url.hostname)) return null;
    if (url.hostname.split(".").length < 2 || url.hostname.includes("..")) return null;
    if (url.hostname.split(".").some(p => !p || p.length > 63 || p.startsWith("-") || p.endsWith("-"))) return null;
    if (/(^|\.)localhost$|(^|\.)(local|lan|internal|invalid|test|example|onion|home|corp)$/i.test(url.hostname)) return null;
    // Safely upgrade legacy listings to HTTPS; failure means unknown, never "website missing".
    url.protocol = "https:";
    url.port = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const [a, b, c] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (family === 6) {
    const low = ip.toLowerCase();
    if (low.startsWith("::ffff:")) return isPublicAddress(low.slice(7));
    // Accept only global unicast 2000::/3, excluding the documentation prefix.
    return /^[23][0-9a-f]/.test(low) && !low.startsWith("2001:db8:");
  }
  return false;
}

function sameBusinessHost(a: string, b: string): boolean {
  return a.replace(/^www\./i, "").toLowerCase() === b.replace(/^www\./i, "").toLowerCase();
}

/**
 * Node 20+ may request lookup({ all: true }) when autoSelectFamily is enabled.
 * Returning a string to an all:true callback breaks every HTTPS request before
 * a TCP connection starts. Always return ONLY the vetted, pinned IPv4.
 */
export function pinnedDnsLookup(address: string) {
  return (
    _host: string,
    options: { all?: boolean },
    callback: (error: Error | null, addresses: string | { address: string; family: number }[], family?: number) => void,
  ) => {
    if (options?.all) callback(null, [{ address, family: 4 }]);
    else callback(null, address, 4);
  };
}

/** Pinned, vetted IPv4 resolution prevents a second DNS lookup from rebinding to an internal IP. */
async function publicIPv4(hostname: string): Promise<string> {
  let records: { address: string; family: number }[];
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new ResearchBlocked("dns_unavailable", "No se pudo resolver la web oficial; sin evidencia nueva.");
  }
  if (!records.length || records.some(r => !isPublicAddress(r.address)))
    throw new ResearchBlocked("unsafe_host", "El dominio no es seguro para una consulta automatizada.");
  const ipv4 = records.find(r => r.family === 4);
  if (!ipv4) throw new ResearchBlocked("unsupported_dns", "El dominio no ofrece una dirección IPv4 pública verificable.");
  return ipv4.address;
}

/**
 * HTTPS only: no redirects to third parties, cookies, internal IPs or arbitrary ports.
 * The response body and total time are bounded, even when the remote site streams forever.
 */
export async function fetchPublicPage(initial: URL, kind: "robots" | "html"): Promise<FetchedPage> {
  const originalHost = initial.hostname;
  let current = new URL(initial.href);
  const maxBytes = kind === "robots" ? MAX_ROBOTS : MAX_HTML;
  for (let hop = 0; hop <= 2; hop++) {
    const accepted = websiteUrl(current.href);
    if (!accepted || !sameBusinessHost(accepted.hostname, originalHost))
      throw new ResearchBlocked("unsafe_redirect", "La web redirige fuera del dominio oficial; no se siguió el enlace.");
    const address = await publicIPv4(accepted.hostname);
    const page = await new Promise<FetchedPage & { location?: string }>((resolve, reject) => {
      const req = request(accepted, {
        method: "GET",
        timeout: TIMEOUT_MS,
        maxHeaderSize: 32 * 1024,
        headers: {
          "User-Agent": AGENT,
          "Accept": kind === "robots" ? "text/plain" : "text/html,application/xhtml+xml",
          "Accept-Encoding": "identity",
          "Cookie": "",
        },
        lookup: pinnedDnsLookup(address),
      }, res => {
        const status = res.statusCode ?? 0;
        const length = Number(res.headers["content-length"] ?? 0);
        if (Number.isFinite(length) && length > maxBytes) {
          req.destroy(new ResearchBlocked("oversize", "La página supera el límite de lectura segura."));
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > maxBytes) {
            req.destroy(new ResearchBlocked("oversize", "La página supera el límite de lectura segura."));
          } else chunks.push(chunk);
        });
        res.on("end", () => resolve({
          url: accepted.href,
          status,
          contentType: String(res.headers["content-type"] ?? "").slice(0, 100).toLowerCase(),
          text: Buffer.concat(chunks).toString("utf8"),
          complete: true,
          location: typeof res.headers.location === "string" ? res.headers.location : undefined,
        }));
        res.on("error", reject);
      });
      req.on("timeout", () => req.destroy(new ResearchBlocked("timeout", "La web no respondió a tiempo.")));
      req.on("error", reject);
      req.end();
    });
    if ([301, 302, 303, 307, 308].includes(page.status)) {
      if (!page.location || hop === 2) throw new ResearchBlocked("redirect_limit", "Demasiadas redirecciones.");
      const next = new URL(page.location, accepted);
      if (!websiteUrl(next.href) || !sameBusinessHost(next.hostname, originalHost))
        throw new ResearchBlocked("unsafe_redirect", "La web redirige fuera del dominio oficial; no se siguió el enlace.");
      current = next;
      continue;
    }
    if (kind === "html" && page.status === 200 && !/text\/html|application\/xhtml\+xml/.test(page.contentType))
      throw new ResearchBlocked("not_html", "El sitio respondió con contenido que no es una página web.");
    return page;
  }
  throw new ResearchBlocked("redirect_limit", "No se pudo completar la navegación segura.");
}

type RobotsRule = { action: "allow" | "disallow"; path: string };
type RobotsGroup = { agents: string[]; rules: RobotsRule[] };

/** RFC 9309-style longest matching rule; fail closed on malformed or unreachable robots.txt. */
export function robotsAllows(raw: string, path: string): boolean {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const cleaned = line.split("#", 1)[0]?.trim() ?? "";
    if (!cleaned) { if (current?.rules.length) current = null; continue; }
    const sep = cleaned.indexOf(":");
    if (sep < 0) continue;
    const key = cleaned.slice(0, sep).trim().toLowerCase();
    const value = cleaned.slice(sep + 1).trim();
    if (key === "user-agent") {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current?.agents.length && (key === "allow" || key === "disallow") && value.startsWith("/")) {
      current.rules.push({ action: key, path: value });
    }
  }
  let bestAgent = -1;
  const applicable: RobotsRule[] = [];
  for (const group of groups) {
    const matching = group.agents.filter(a => a === "*" || BOT.toLowerCase().includes(a));
    if (!matching.length) continue;
    const specificity = Math.max(...matching.map(a => a === "*" ? 0 : a.length));
    if (specificity > bestAgent) { applicable.length = 0; bestAgent = specificity; }
    if (specificity === bestAgent) applicable.push(...group.rules);
  }
  let choice: { len: number; allow: boolean } | null = null;
  for (const rule of applicable) {
    const escaped = rule.path.replace(/[.+?^()|[\]{}\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\$$/, "$");
    const match = new RegExp("^" + escaped).test(path);
    const len = rule.path.replace(/[\*$]/g, "").length;
    if (match && (!choice || len > choice.len || (len === choice.len && rule.action === "allow")))
      choice = { len, allow: rule.action === "allow" };
  }
  return choice ? choice.allow : true;
}

export async function checkRobots(url: URL): Promise<{ allows: (path: string) => boolean; warning?: string }> {
  const robots = new URL("/robots.txt", url);
  let page: FetchedPage;
  try { page = await fetchPublicPage(robots, "robots"); }
  catch (cause) {
    const technical = cause instanceof ResearchBlocked ? cause.code : "network_error";
    // Only expose our own known error code. Never expose hostnames or socket internals.
    const code = /^[a-z_]{3,40}$/.test(technical) ? technical : "network_error";
    throw new ResearchBlocked("robots_" + code,
      "No pudimos comprobar robots.txt (" + code + "); por seguridad no investigamos el sitio.");
  }
  if (page.status === 404 || page.status === 410) return { allows: () => true, warning: "robots.txt no publicado" };
  if (page.status !== 200 || !page.contentType.includes("text/plain"))
    throw new ResearchBlocked("robots_unavailable", "El permiso del sitio para bots no pudo comprobarse.");
  return { allows: (path: string) => robotsAllows(page.text, path) };
}
