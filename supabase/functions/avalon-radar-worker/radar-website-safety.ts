// Shared Avalon Radar research implementation; sync changes with src/lib/crm/radar-website-safety.ts.
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
 * Supabase Edge/Deno transport. Node's https.request() custom resolver
 * throws ERR_NOT_IMPLEMENTED here. Resolve DNS once, verify every address,
 * dial ONLY the vetted public IPv4 and authenticate the original hostname
 * using TLS SNI/certificate validation. Never follow fetch() redirects.
 */
async function publicIPv4(hostname: string): Promise<string> {
  let ips: string[];
  try {
    ips = await Deno.resolveDns(hostname, "A");
  } catch {
    throw new ResearchBlocked("dns_unavailable", "La web oficial no tiene DNS verificable.");
  }
  if (!ips.length || ips.some(ip => !isPublicAddress(ip)))
    throw new ResearchBlocked("unsafe_host", "El dominio no es seguro para una consulta automatizada.");
  return ips[0];
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const combined = new Uint8Array(total);
  let i = 0;
  for (const chunk of chunks) { combined.set(chunk, i); i += chunk.byteLength; }
  return combined;
}

function findCRLF(bytes: Uint8Array, from: number): number {
  for (let i = from; i + 1 < bytes.length; i++)
    if (bytes[i] === 13 && bytes[i + 1] === 10) return i;
  return -1;
}

export function decodeChunked(raw: Uint8Array, maxBytes: number): Uint8Array {
  let cursor = 0, total = 0;
  const parts: Uint8Array[] = [];
  for (let step = 0; step < 5000; step++) {
    const eol = findCRLF(raw, cursor);
    if (eol < 0 || eol - cursor > 40)
      throw new ResearchBlocked("chunk_invalid", "La respuesta HTTP está incompleta.");
    const line = decoder.decode(raw.subarray(cursor, eol)).split(";", 1)[0].trim();
    if (!/^[0-9a-f]{1,8}$/i.test(line))
      throw new ResearchBlocked("chunk_invalid", "La respuesta HTTP tiene un bloque inválido.");
    const size = Number.parseInt(line, 16);
    cursor = eol + 2;
    if (size === 0) return concat(parts, total);
    if (total + size > maxBytes)
      throw new ResearchBlocked("oversize", "La página supera el límite de lectura segura.");
    if (cursor + size + 2 > raw.length || raw[cursor + size] !== 13 || raw[cursor + size + 1] !== 10)
      throw new ResearchBlocked("chunk_invalid", "La respuesta HTTP está incompleta.");
    parts.push(raw.subarray(cursor, cursor + size));
    cursor += size + 2;
    total += size;
  }
  throw new ResearchBlocked("chunk_invalid", "La respuesta HTTP tiene demasiados bloques.");
}

export function parseHttpResponse(raw: Uint8Array, maxBytes: number, uncleanTlsClose = false): {
  status: number; contentType: string; location?: string; text: string;
} {
  let sep = -1;
  for (let i = 0; i + 3 < raw.length; i++) {
    if (raw[i] === 13 && raw[i+1] === 10 && raw[i+2] === 13 && raw[i+3] === 10) {
      sep = i; break;
    }
  }
  if (sep < 0 || sep > 32 * 1024)
    throw new ResearchBlocked("headers_invalid", "No se pudo interpretar la respuesta HTTPS.");
  const lines = decoder.decode(raw.subarray(0, sep)).split("\r\n");
  const match = /^HTTP\/1\.[01] (\d{3})(?: |$)/.exec(lines[0] ?? "");
  if (!match) throw new ResearchBlocked("protocol_invalid", "La web no respondió con HTTP/1.1.");
  const headers = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const colon = line.indexOf(":");
    if (colon <= 0) throw new ResearchBlocked("headers_invalid", "La cabecera HTTP no es válida.");
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (!headers.has(key)) headers.set(key, value);
  }
  const contentEncoding = (headers.get("content-encoding") ?? "identity").toLowerCase();
  if (contentEncoding !== "identity")
    throw new ResearchBlocked("encoding", "La web no permitió lectura sin compresión.");
  const lengthHeader = headers.get("content-length");
  let declared: number | null = null;
  if (lengthHeader !== undefined) {
    if (!/^\d{1,10}$/.test(lengthHeader))
      throw new ResearchBlocked("headers_invalid", "Longitud HTTP inválida.");
    declared = Number(lengthHeader);
    if (declared > maxBytes)
      throw new ResearchBlocked("oversize", "La página supera el límite de lectura segura.");
  }
  let bytes = raw.subarray(sep + 4);
  const chunked = (headers.get("transfer-encoding") ?? "").toLowerCase().includes("chunked");
  const status = Number(match[1]);
  // An unclean TLS close (no close_notify) cannot prove the body is complete
  // unless HTTP frames it with Content-Length or a terminating chunk. For
  // robots 404/410 and redirects, only the complete headers are needed.
  if (uncleanTlsClose && declared === null && !chunked &&
      ![301,302,303,307,308,404,410].includes(status))
    throw new ResearchBlocked("truncated", "No pudimos comprobar que el contenido llegó completo.");
  if (chunked) {
    bytes = decodeChunked(bytes, maxBytes);
  } else if (declared !== null) {
    if (bytes.length < declared) throw new ResearchBlocked("truncated", "La página llegó incompleta.");
    bytes = bytes.subarray(0, declared);
  }
  if (bytes.byteLength > maxBytes)
    throw new ResearchBlocked("oversize", "La página supera el límite de lectura segura.");
  return {
    status: Number(match[1]),
    contentType: (headers.get("content-type") ?? "").slice(0, 100).toLowerCase(),
    location: headers.get("location"),
    text: decoder.decode(bytes),
  };
}

async function pinnedRequest(url: URL, kind: "robots" | "html"): Promise<FetchedPage & {location?: string}> {
  const address = await publicIPv4(url.hostname);
  const maxBytes = kind === "robots" ? MAX_ROBOTS : MAX_HTML;
  let tcp: Deno.Conn | null = null;
  let tls: Deno.TlsConn | null = null;
  let uncleanTlsClose = false;
  let expired = false;
  let timer: number | undefined;
  const task = async () => {
    tcp = await Deno.connect({ hostname: address, port: 443 });
    if (expired) throw new ResearchBlocked("timeout", "La web no respondió a tiempo.");
    tls = await Deno.startTls(tcp, { hostname: url.hostname, alpnProtocols: ["http/1.1"] });
    tcp = null;
    if (expired) throw new ResearchBlocked("timeout", "La web no respondió a tiempo.");
    const target = (url.pathname || "/") + url.search;
    const headers = [
      "GET " + target + " HTTP/1.1",
      "Host: " + url.hostname,
      "User-Agent: " + AGENT,
      "Accept: " + (kind === "robots" ? "text/plain" : "text/html,application/xhtml+xml"),
      "Accept-Encoding: identity",
      "Cookie:",
      "Connection: close",
      "",
      "",
    ].join("\r\n");
    await tls.write(encoder.encode(headers));
    const received: Uint8Array[] = [];
    let bytes = 0;
    const buf = new Uint8Array(8192);
    for (;;) {
      let n: number | null;
      try { n = await tls.read(buf); }
      catch (cause) {
        // Many legitimate HTTPS servers omit TLS close_notify. Keep the
        // received bytes, but only accept complete HTTP framing below.
        if (cause instanceof Error && cause.name === "UnexpectedEof") {
          uncleanTlsClose = true;
          break;
        }
        throw cause;
      }
      if (n === null) break;
      bytes += n;
      if (bytes > maxBytes + 64 * 1024)
        throw new ResearchBlocked("oversize", "La página supera el límite de lectura segura.");
      if (n > 0) received.push(buf.slice(0, n));
    }
    const parsed = parseHttpResponse(concat(received, bytes), maxBytes, uncleanTlsClose);
    return { url: url.href, ...parsed, complete: true };
  };
  try {
    const timed = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        expired = true;
        try { tls?.close(); } catch { /* socket closed */ }
        try { tcp?.close(); } catch { /* socket closed */ }
        reject(new ResearchBlocked("timeout", "La web no respondió a tiempo."));
      }, TIMEOUT_MS);
    });
    return await Promise.race([task(), timed]);
  } catch (cause) {
    if (cause instanceof ResearchBlocked) throw cause;
    throw new ResearchBlocked("network_unavailable", "La conexión segura no estuvo disponible.");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    try { tls?.close(); } catch { /* socket closed */ }
    try { tcp?.close(); } catch { /* socket closed */ }
  }
}

/** HTTPS-only; same-business-host redirect cap, robots handled by checkRobots. */
export async function fetchPublicPage(initial: URL, kind: "robots" | "html"): Promise<FetchedPage> {
  const originalHost = initial.hostname;
  let current = new URL(initial.href);
  for (let hop = 0; hop <= 2; hop++) {
    const accepted = websiteUrl(current.href);
    if (!accepted || !sameBusinessHost(accepted.hostname, originalHost))
      throw new ResearchBlocked("unsafe_redirect", "La web redirige fuera del dominio oficial.");
    const page = await pinnedRequest(accepted, kind);
    if ([301, 302, 303, 307, 308].includes(page.status)) {
      if (!page.location || hop === 2)
        throw new ResearchBlocked("redirect_limit", "Demasiadas redirecciones.");
      const next = new URL(page.location, accepted);
      if (!websiteUrl(next.href) || !sameBusinessHost(next.hostname, originalHost))
        throw new ResearchBlocked("unsafe_redirect", "La web redirige fuera del dominio oficial.");
      current = next;
      continue;
    }
    if (kind === "html" && page.status === 200 && !/text\/html|application\/xhtml\+xml/.test(page.contentType))
      throw new ResearchBlocked("not_html", "El sitio respondió sin contenido HTML.");
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
