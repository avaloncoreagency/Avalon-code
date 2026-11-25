import { textWidth } from "@/lib/quotes/pdf";
import type { LibraryDoc } from "./library";

/**
 * Library documents (Employee / Client welcome packs) as PDFs in the ivory editorial identity shared with quotes
 * (#340), manuals (#351) and agreements. Pure and deterministic: the same document version always renders the same
 * bytes. A document that is not APPROVED carries «PENDIENTE DE REVISIÓN — NO DISTRIBUIR» on every page.
 * Markdown support is intentionally small (headings, bullets, numbered lists, tables as text, paragraphs); the
 * content is the department's text, never rewritten.
 */
const W = 612, H = 792, M = 56;
const PAPER = "0.992 0.985 0.973", SAND = "0.965 0.938 0.894", INK = "0.165 0.157 0.153", BODY = "0.24 0.226 0.214";
const MUTED = "0.422 0.408 0.388", ACCENT = "0.678 0.502 0.318", RULE = "0.873 0.851 0.814", WARN = "0.62 0.25 0.34";
const BLUE = "0.208 0.329 1", VIOLET = "0.478 0.361 1";
const clean = (s: string) => s.normalize("NFC").replace(/[‐-―]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...")
  .replace(/[→⇒]/g, "->").replace(/[✓✔]/g, "OK").replace(/[•·]/g, "-").replace(/[^\x20-\x7e\xa0-\xff]/g, "");
const esc = (s: string) => clean(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const inline = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_]/g, "");

type Block = { kind: "h1" | "h2" | "h3" | "p" | "li" | "rule"; text: string };
export function parseMarkdown(md: string): Block[] {
  const out: Block[] = []; let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ kind: "p", text: inline(para.join(" ")) }); para = []; } };
  for (const raw of md.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    let m: RegExpExecArray | null;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) { flush(); out.push({ kind: m[1].length === 1 ? "h1" : m[1].length === 2 ? "h2" : "h3", text: inline(m[2]) }); continue; }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { flush(); out.push({ kind: "rule", text: "" }); continue; }
    if (/^\s*\|?\s*:?-{3,}/.test(line) && line.includes("|")) continue; // table separator
    if (line.trim().startsWith("|")) { flush(); out.push({ kind: "li", text: inline(line.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim()).filter(Boolean).join(" · ")) }); continue; }
    if ((m = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line))) { flush(); out.push({ kind: "li", text: inline(m[1]) }); continue; }
    if (line.trim().startsWith(">")) { para.push(line.replace(/^\s*>\s?/, "")); continue; }
    para.push(line.trim());
  }
  flush();
  return out;
}

/** Shared ivory editorial renderer (library documents, review pack, client welcome package). */
export type EditorialInput = { ref: string; version: string; languages: string[]; title: string; markdown: string;
  /** Footer status; `warn` paints it in the warning colour and, with `banner`, adds the banner under the title. */
  status: { label: string; warn: boolean; banner?: string }; producer: string };

export function renderLibraryPdf(d: LibraryDoc): Uint8Array {
  const pending = d.approval !== "approved";
  return renderEditorialPdf({ ref: d.id, version: d.version, languages: d.languages, title: d.title, markdown: d.content, producer: "Avalon OS avalon-library-1",
    status: pending ? { label: "PENDIENTE DE REVISION / PENDING REVIEW", warn: true, banner: "PENDIENTE DE REVISION - NO DISTRIBUIR / PENDING REVIEW - DO NOT DISTRIBUTE" }
      : { label: "APROBADO / APPROVED", warn: false } });
}

export function renderEditorialPdf(d: EditorialInput): Uint8Array {
  const pending = d.status.warn;
  const pages: string[][] = []; let ops: string[] = []; let y = H;
  const text = (x: number, yy: number, s: string, z: number, bold = false, col = BODY) =>
    ops.push("BT", `/${bold ? "F2" : "F1"} ${z} Tf`, col + " rg", `1 0 0 1 ${x.toFixed(2)} ${yy.toFixed(2)} Tm`, "(" + esc(s) + ") Tj", "ET");
  const rect = (x: number, yy: number, w: number, h: number, col: string) => ops.push("q", col + " rg", `${x} ${yy} ${w} ${h} re f`, "Q");
  const wrap = (s: string, size: number, max: number, bold = false) => {
    const out: string[] = []; let line = "";
    for (const word of clean(s).split(/\s+/).filter(Boolean)) {
      const cand = line ? line + " " + word : word;
      if (textWidth(cand, size, bold ? "F2" : "F1") <= max) line = cand; else { if (line) out.push(line); line = word; }
    }
    if (line) out.push(line);
    return out;
  };
  const newPage = () => { ops = []; pages.push(ops); rect(0, 0, W, H, PAPER); y = H - 72; };
  const need = (h: number) => { if (y - h < 72) newPage(); };
  const mark = (x: number, yy: number, size: number) => {
    const k = size / 140, P = (px: number, py: number) => `${(x + px * k).toFixed(2)} ${(yy + (130 - py) * k).toFixed(2)}`;
    ops.push("q", BLUE + " rg", `${P(70, 12)} m ${P(131, 112)} l ${P(99, 112)} l ${P(70, 62)} l ${P(40, 112)} l ${P(9, 112)} l h f`, VIOLET + " rg", `${P(70, 79)} m ${P(91, 115)} l ${P(49, 115)} l h f`, "Q");
  };

  newPage();
  rect(0, H - 150, W, 150, SAND);
  mark(M, H - 118, 52);
  text(M + 66, H - 86, "AVALON", 20, true, INK); text(M + 67, H - 101, "CORE AGENCY", 8, true, ACCENT);
  text(M, H - 176, d.ref + "  |  v" + d.version + "  |  " + d.languages.join("/").toUpperCase(), 8.5, true, ACCENT);
  y = H - 204;
  for (const l of wrap(d.title, 20, W - 2 * M, true).slice(0, 3)) { text(M, y, l, 20, true, INK); y -= 26; }
  rect(M, y + 8, 48, 2, ACCENT); y -= 18;
  if (d.status.banner) { text(M, y, d.status.banner, 8.5, true, pending ? WARN : ACCENT); y -= 22; }

  const blocks = parseMarkdown(d.markdown);
  if (blocks[0]?.kind === "h1" && clean(blocks[0].text) === clean(d.title)) blocks.shift(); // already on the cover
  for (const b of blocks) {
    if (b.kind === "rule") { need(14); rect(M, y + 4, W - 2 * M, 0.6, RULE); y -= 12; continue; }
    if (b.kind === "h1" || b.kind === "h2" || b.kind === "h3") {
      const size = b.kind === "h1" ? 15 : b.kind === "h2" ? 12.5 : 11; const lines = wrap(b.text, size, W - 2 * M, true);
      need(lines.length * (size + 5) + 16); y -= 6;
      for (const l of lines) { text(M, y, l, size, true, INK); y -= size + 5; }
      if (b.kind !== "h3") { rect(M, y + 6, 30, 1.6, ACCENT); y -= 10; }
      continue;
    }
    const indent = b.kind === "li" ? 14 : 0; const lines = wrap(b.text, 9.8, W - 2 * M - indent);
    lines.forEach((l, n) => { need(14); if (n === 0 && b.kind === "li") rect(M + 3, y + 3, 3.5, 3.5, ACCENT); text(M + indent, y, l, 9.8); y -= 14; });
    y -= b.kind === "li" ? 2 : 7;
  }

  const objects: string[] = []; const add = (s: string) => { objects.push(s); return objects.length; };
  const catalog = add(""), root = add("");
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  pages.forEach((p, i) => {
    const foot = ["q", RULE + " rg", `${M} 46 ${W - 2 * M} 0.6 re f`, "Q", "BT", "/F1 7.5 Tf", (pending ? WARN : MUTED) + " rg", `1 0 0 1 ${M} 32 Tm`,
      "(" + esc(`Avalon Core Agency  |  ${d.ref} v${d.version}  |  ${d.status.label}  |  ${i + 1} / ${pages.length}`) + ") Tj", "ET"];
    const stream = [...p, ...foot].join("\n") + "\n";
    const content = add("<< /Length " + Buffer.byteLength(stream, "latin1") + " >>\nstream\n" + stream + "endstream");
    kids.push(add(`<< /Type /Page /Parent ${root} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`));
  });
  const info = add(`<< /Title (${esc(d.ref + " " + d.title)}) /Producer (${esc(d.producer)}) >>`);
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${root} 0 R >>`;
  objects[root - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + " 0 R").join(" ")}] /Count ${kids.length} >>`;
  let pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"; const offsets: number[] = [];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf, "latin1")); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(Buffer.from(pdf, "latin1"));
}

export const libraryFileName = (d: LibraryDoc) => `Avalon-${d.id}-v${d.version}${d.approval === "approved" ? "" : "-PENDIENTE"}.pdf`;
