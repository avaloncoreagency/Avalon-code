/**
 * Avalon Project Bridge — isolated in-app preview.
 *
 * Imported HTML is untrusted. It is never served from the Avalon OS origin as a normal page. Instead one HTML document
 * is built with every local asset inlined as a data: URI and served with
 *   Content-Security-Policy: sandbox allow-scripts; default-src 'none'; ... connect-src 'none'
 * so the page runs in an OPAQUE origin (no cookies, no storage, no access to Avalon OS) and cannot make network
 * requests. The library iframe adds sandbox="allow-scripts" as a second layer. Multi-page navigation and external
 * resources are intentionally not available here — the real, fully isolated preview is the Vercel Preview deployment.
 */
import { extensionOf, mimeOf } from "./policy";

export const PREVIEW_BUDGET_BYTES = 8 * 1024 * 1024;
export const PREVIEW_CSP = [
  "sandbox allow-scripts allow-forms",
  "default-src 'none'",
  "img-src data:",
  "media-src data:",
  "font-src data:",
  "style-src 'unsafe-inline' data:",
  "script-src 'unsafe-inline' data:",
  "connect-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

export type PreviewFile = { path: string; sha256: string; size: number };

function resolve(from: string, ref: string): string | null {
  if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref) || ref.startsWith("data:")) return null;
  const clean = ref.split(/[?#]/)[0];
  if (!clean) return null;
  const base = clean.startsWith("/") ? [] : from.split("/").slice(0, -1);
  for (const part of clean.replace(/^\/+/, "").split("/")) {
    if (part === "..") { if (!base.length) return null; base.pop(); } else if (part && part !== ".") base.push(decodeURIComponent(part));
  }
  return base.join("/");
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * Builds the self-contained preview document of `page`. `read(sha)` returns blob bytes. Assets beyond the budget are
 * dropped (and counted) instead of growing the response without limit.
 */
export async function buildPreview(files: PreviewFile[], page: string, read: (sha: string) => Promise<Uint8Array | null>) {
  const byPath = new Map(files.map(f => [f.path, f]));
  const entry = byPath.get(page);
  if (!entry || !/\.html?$/i.test(page)) return null;
  let budget = PREVIEW_BUDGET_BYTES;
  const stats = { inlined: 0, skipped: 0, external: 0 };
  const cache = new Map<string, string | null>();
  const text = async (f: PreviewFile) => { const b = await read(f.sha256); return b ? new TextDecoder().decode(b) : ""; };

  async function dataUri(path: string): Promise<string | null> {
    if (cache.has(path)) return cache.get(path)!;
    const f = byPath.get(path);
    let out: string | null = null;
    if (f && f.size <= budget) {
      if (extensionOf(path) === "css") {
        const css = await rewriteCss(await text(f), path);
        out = "data:text/css;base64," + b64(new TextEncoder().encode(css));
      } else {
        const bytes = await read(f.sha256);
        if (bytes) out = `data:${mimeOf(path).split(";")[0]};base64,` + b64(bytes);
      }
      if (out) { budget -= f.size; stats.inlined++; }
    } else if (f) stats.skipped++;
    cache.set(path, out);
    return out;
  }
  async function rewriteCss(css: string, from: string): Promise<string> {
    const parts: string[] = []; let last = 0;
    for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
      const target = resolve(from, m[2].trim());
      const uri = target ? await dataUri(target) : null;
      parts.push(css.slice(last, m.index!), uri ? `url("${uri}")` : m[0]);
      last = m.index! + m[0].length;
    }
    return parts.join("") + css.slice(last);
  }

  const html = await text(entry);
  const parts: string[] = []; let last = 0;
  for (const m of html.matchAll(/\b(src|href|poster)\s*=\s*(["'])([^"']*)\2/gi)) {
    const target = resolve(page, m[3].trim());
    let replacement = m[0];
    if (target === null) { if (/^(https?:)?\/\//i.test(m[3])) stats.external++; }
    else if (/\.html?$/i.test(target)) replacement = `${m[1]}="#" data-avalon-page="${escapeAttr(target)}"`;
    else { const uri = await dataUri(target); replacement = uri ? `${m[1]}="${uri}"` : `${m[1]}="" data-avalon-missing="${escapeAttr(target)}"`; }
    parts.push(html.slice(last, m.index!), replacement);
    last = m.index! + m[0].length;
  }
  let doc = parts.join("") + html.slice(last);
  const meta = `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(PREVIEW_CSP.replace(/^sandbox[^;]*; /, ""))}">`;
  doc = /<head[^>]*>/i.test(doc) ? doc.replace(/<head([^>]*)>/i, `<head$1>${meta}`) : meta + doc;
  return { html: doc, stats };
}
