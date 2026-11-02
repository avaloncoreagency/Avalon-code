// Pure export helpers (no I/O). Used by owner-only route handlers.
import { readBlocks, safeHref, type Block } from "./domain";

/**
 * RFC 4180 CSV with spreadsheet formula-injection protection: any cell that a
 * spreadsheet would evaluate (= + - @ tab CR) is prefixed with an apostrophe.
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  // BOM so Excel opens UTF-8 (accents) correctly.
  return "﻿" + [header, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string);
}

function button(label: string, href: string) {
  const safe = safeHref(href);
  if (!label || !safe.ok || !safe.value) return "";
  const external = safe.value.startsWith("https://") ? ' target="_blank" rel="noopener noreferrer"' : "";
  return `<a class="btn" href="${escapeHtml(safe.value)}"${external}>${escapeHtml(label)}</a>`;
}

function blockHtml(block: Block): string {
  const h = (text: string, tag = "h2") => (text ? `<${tag}>${escapeHtml(text)}</${tag}>` : "");
  const p = (text: string) => (text ? text.split(/\n{2,}/).map(par => `<p>${escapeHtml(par).replace(/\n/g, "<br>")}</p>`).join("") : "");
  switch (block.type) {
    case "hero": return `<section class="hero">${h(block.heading, "h1")}${p(block.subheading)}${button(block.buttonLabel, block.buttonHref)}</section>`;
    case "text": return `<section>${h(block.heading)}${p(block.body)}</section>`;
    case "features": return `<section>${h(block.heading)}<ul class="features">${block.items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`;
    case "cta": return `<section class="cta">${h(block.heading)}${p(block.body)}${button(block.buttonLabel, block.buttonHref)}</section>`;
  }
}

/** Standalone, dependency-free HTML document for a Website Designer page. */
export function pageToHtml(page: { title: string; seo_description?: string; blocks: unknown }, lang: "es" | "en" = "es"): string {
  const blocks = readBlocks(page.blocks);
  const body = blocks.map(blockHtml).join("\n");
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)}</title>
${page.seo_description ? `<meta name="description" content="${escapeHtml(page.seo_description)}">\n` : ""}<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#14161f;--muted:#5b6275;--accent:#5b4cff;--soft:#f3f4fa}
@media (prefers-color-scheme:dark){:root{--bg:#070a16;--fg:#eef1ff;--muted:#a3abc6;--soft:#121a33}}
*{box-sizing:border-box}body{margin:0;font:17px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--fg)}
section{max-width:960px;margin:0 auto;padding:56px 20px}h1{font-size:clamp(34px,6vw,58px);line-height:1.08;margin:0 0 16px}h2{font-size:clamp(24px,4vw,34px);margin:0 0 12px}
p{color:var(--muted);margin:0 0 14px}.hero{padding-top:96px;padding-bottom:96px}.cta{background:var(--soft);border-radius:20px;margin:40px auto;text-align:center}
.features{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.features li{background:var(--soft);border-radius:14px;padding:18px}
.btn{display:inline-block;margin-top:10px;padding:12px 22px;border-radius:999px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600}
</style>
</head>
<body>
${body || "<section><p></p></section>"}
</body>
</html>
`;
}
