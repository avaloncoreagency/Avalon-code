import { authorDisplayName } from "../identity/owners";
import { formatUsd, quoteTotals, toCents, type Lang, type QuoteContent } from "./model";

/**
 * Premium commercial quote PDF (US Letter), dependency-free and server-side.
 * The renderer only accepts QuoteContent — internal costs, margins and notes cannot reach it by type.
 */

const W = 612, H = 792, M = 54;
type Font = "F1" | "F2";
type Op = { k: "t"; x: number; y: number; s: string; f: Font; z: number; c: string } | { k: "r"; x: number; y: number; w: number; h: number; c: string };

// Helvetica advance widths (AFM, 1/1000 em) for ASCII 32..126. Bold is approximated (+6 %) for layout only.
const AFM = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const clean = (s: string) => s.normalize("NFC").replace(/[‐-―]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/…/g, "...").replace(/•/g, "-").replace(/[^\x20-\x7e\xa0-\xff\n]/g, "?");
export function textWidth(s: string, size: number, f: Font = "F1") {
  let w = 0;
  for (const ch of clean(s)) { const c = ch.charCodeAt(0); w += c >= 32 && c <= 126 ? AFM[c - 32] : 556; }
  return (w * size / 1000) * (f === "F2" ? 1.06 : 1);
}
function wrap(s: string, size: number, max: number, f: Font = "F1"): string[] {
  const out: string[] = [];
  for (const para of clean(s).split(/\r?\n/)) {
    let line = "";
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (textWidth(word, size, f) > max) {
        let cut = word.length; while (cut > 1 && textWidth(word.slice(0, cut), size, f) > max) cut--;
        if (line) { out.push(line); line = ""; }
        out.push(word.slice(0, cut)); word = word.slice(cut);
      }
      if (!word) continue;
      const next = line ? line + " " + word : word;
      if (textWidth(next, size, f) > max) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}

const NAVY = "0.035 0.067 0.161", INK = "0.118 0.153 0.243", MUTED = "0.42 0.45 0.53", ACCENT = "0.161 0.475 1", VIOLET = "0.42 0.29 0.70",
  RULE = "0.88 0.9 0.94", TINT = "0.955 0.965 0.985", WHITE = "1 1 1", GOLD = "0.93 0.74 0.36";

const L = (lang: Lang) => lang === "es" ? {
  quote: "COTIZACIÓN", proposal: "PROPUESTA COMERCIAL", preparedFor: "PREPARADO PARA", issued: "EMITIDA", valid: "VÁLIDA HASTA",
  number: "COTIZACIÓN", version: "VERSIÓN", investment: "INVERSIÓN ESTIMADA", oneTime: "Pago único", monthly: "Mensualidad", perMonth: "/ mes",
  summary: "Resumen ejecutivo", objectives: "Objetivos del cliente", problem: "Situación actual", solution: "Solución propuesta",
  scope: "Alcance", deliverables: "Entregables", exclusions: "Exclusiones", dependencies: "Dependencias del cliente",
  invest: "Inversión", model: "Modelo de cobro", timeline: "Cronograma estimado", support: "Soporte incluido",
  terms: "Condiciones", notes: "Notas", next: "Vigencia y próximos pasos", concept: "Concepto", type: "Tipo", qty: "Cant.", unit: "Precio", amount: "Importe",
  total1: "Total pago único", totalM: "Total mensual", commission: "Comisión por resultados", pctToNegotiate: "Porcentaje por acordar",
  pctLabel: "Porcentaje", base: "Base de cálculo", trigger: "Genera derecho a comisión", window: "Ventana de atribución", days: "días", evidence: "Evidencia requerida",
  settlement: "Liquidación", refunds: "Reembolsos y contracargos", expiry: "Vencimiento", thirdParty: "Costos de terceros (no son ingresos de Avalon)",
  models: { fixed: "Precio fijo", monthly: "Suscripción mensual", commission: "Comisión por resultados", hybrid: "Modelo híbrido: cada componente se cobra por separado" },
  bases: { gross_revenue: "Ingresos brutos atribuibles efectivamente cobrados", gross_profit: "Utilidad bruta atribuible", other: "Otra base acordada" },
  settle: { weekly: "Semanal", biweekly: "Quincenal", monthly: "Mensual", quarterly: "Trimestral" },
  nextText: (until: string) => `Esta cotización es válida hasta el ${until}. No constituye un contrato ni una factura. Si la propuesta es aceptada, prepararemos un contrato con estas condiciones para su revisión y firma.`,
  contact: "Contacto", footer: "Documento confidencial preparado para su destinatario", page: "Página", of: "de",
} : {
  quote: "QUOTE", proposal: "COMMERCIAL PROPOSAL", preparedFor: "PREPARED FOR", issued: "ISSUED", valid: "VALID UNTIL",
  number: "QUOTE", version: "VERSION", investment: "ESTIMATED INVESTMENT", oneTime: "One-time", monthly: "Monthly", perMonth: "/ month",
  summary: "Executive summary", objectives: "Client objectives", problem: "Current situation", solution: "Proposed solution",
  scope: "Scope", deliverables: "Deliverables", exclusions: "Exclusions", dependencies: "Client dependencies",
  invest: "Investment", model: "Billing model", timeline: "Estimated timeline", support: "Included support",
  terms: "Terms", notes: "Notes", next: "Validity and next steps", concept: "Item", type: "Type", qty: "Qty", unit: "Price", amount: "Amount",
  total1: "One-time total", totalM: "Monthly total", commission: "Performance commission", pctToNegotiate: "Percentage to be agreed",
  pctLabel: "Percentage", base: "Calculation base", trigger: "Earned when", window: "Attribution window", days: "days", evidence: "Required evidence",
  settlement: "Settlement", refunds: "Refunds and chargebacks", expiry: "Ends", thirdParty: "Third-party costs (not Avalon revenue)",
  models: { fixed: "Fixed price", monthly: "Monthly subscription", commission: "Performance commission", hybrid: "Hybrid model: each component is billed separately" },
  bases: { gross_revenue: "Attributable gross revenue actually collected", gross_profit: "Attributable gross profit", other: "Other agreed base" },
  settle: { weekly: "Weekly", biweekly: "Biweekly", monthly: "Monthly", quarterly: "Quarterly" },
  nextText: (until: string) => `This quote is valid until ${until}. It is not a contract or an invoice. If accepted, we will prepare an agreement with these terms for review and signature.`,
  contact: "Contact", footer: "Confidential document prepared for its recipient", page: "Page", of: "of",
};

function longDate(iso: string, lang: Lang, short = false) {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString(lang === "es" ? "es-US" : "en-US", { year: "numeric", month: short ? "short" : "long", day: "numeric", timeZone: "UTC" });
}

export function renderQuotePdf(c: QuoteContent, meta: { number: string; version: number }): Uint8Array {
  const t = L(c.lang);
  const totals = quoteTotals(c);
  const pages: Op[][] = [];
  const text = (p: Op[], x: number, y: number, s: string, z: number, f: Font = "F1", col = INK) => p.push({ k: "t", x, y, s: clean(s), f, z, c: col });
  const rect = (p: Op[], x: number, y: number, w: number, h: number, col: string) => p.push({ k: "r", x, y, w, h, c: col });
  const right = (p: Op[], xr: number, y: number, s: string, z: number, f: Font = "F1", col = INK) => text(p, xr - textWidth(s, z, f), y, s, z, f, col);

  // ── Cover ──────────────────────────────────────────────────────────────────────────────────────────────
  const cover: Op[] = []; pages.push(cover);
  rect(cover, 0, 300, W, H - 300, NAVY);
  rect(cover, 0, 300, W, 4, ACCENT);
  rect(cover, M, 712, 34, 3, GOLD);
  text(cover, M, 680, "AVALON", 40, "F2", WHITE);
  text(cover, M + 2, 660, "CORE AGENCY", 10, "F2", "0.74 0.8 0.95");
  text(cover, M, 560, t.proposal, 10, "F2", GOLD);
  let cy = 528;
  for (const l of wrap(c.title, 28, W - 2 * M, "F2").slice(0, 3)) { text(cover, M, cy, l, 28, "F2", WHITE); cy -= 34; }
  text(cover, M, 360, t.preparedFor, 9, "F2", "0.74 0.8 0.95");
  text(cover, M, 338, wrap(c.client.company, 18, W - 2 * M, "F2")[0] ?? "", 18, "F2", WHITE);
  if (c.client.contact) text(cover, M, 318, c.client.contact, 11, "F1", "0.85 0.89 1");
  // Meta grid
  const meta4: [string, string][] = [[t.number, meta.number], [t.version, "v" + meta.version], [t.issued, longDate(c.issueDate, c.lang, true)], [t.valid, longDate(c.validUntil, c.lang, true)]];
  meta4.forEach(([k, v], i) => {
    const x = M + i * ((W - 2 * M) / 4);
    text(cover, x, 250, k, 8, "F2", MUTED); text(cover, x, 233, v, 11, "F2", INK);
  });
  rect(cover, M, 205, W - 2 * M, 1, RULE);
  // Investment highlight
  text(cover, M, 176, t.investment, 8, "F2", VIOLET);
  let hx = M;
  const highlight = (label: string, value: string) => {
    text(cover, hx, 150, value, 22, "F2", NAVY); text(cover, hx, 134, label, 9, "F1", MUTED);
    hx += Math.max(150, textWidth(value, 22, "F2") + 36);
  };
  if (totals.oneTimeCents) highlight(t.oneTime, formatUsd(totals.oneTimeCents, c.lang));
  if (totals.monthlyCents) highlight(t.monthly, formatUsd(totals.monthlyCents, c.lang) + " " + t.perMonth);
  if (c.commission) highlight(t.commission, c.commission.status === "proposed" ? c.commission.pct + "%" : t.pctToNegotiate);
  text(cover, M, 82, c.issuer.name, 10, "F2", INK);
  text(cover, M, 68, [c.issuer.email, c.issuer.phone].filter(Boolean).join("   |   "), 9, "F1", MUTED);

  // ── Interior flow ──────────────────────────────────────────────────────────────────────────────────────
  let page: Op[] = []; pages.push(page);
  let y = H - 86;
  const bottom = 72;
  const newPage = () => { page = []; pages.push(page); y = H - 86; };
  const need = (h: number) => { if (y - h < bottom) newPage(); };
  const heading = (s: string) => {
    need(44);
    y -= 8; rect(page, M, y - 2, 3, 14, ACCENT);
    text(page, M + 12, y, s, 13, "F2", NAVY); y -= 22;
  };
  const para = (s: string, z = 10, col = INK) => {
    for (const l of wrap(s, z, W - 2 * M)) { need(z + 4); text(page, M, y, l, z, "F1", col); y -= z + 4.5; }
    y -= 6;
  };
  const section = (title: string, body: string) => { if (body.trim()) { heading(title); para(body); } };
  const kv = (k: string, v: string) => {
    const lines = wrap(v, 9.5, W - 2 * M - 170);
    need(Math.max(1, lines.length) * 13 + 4);
    text(page, M + 14, y, k, 9, "F2", MUTED);
    lines.forEach((l, i) => text(page, M + 170, y - i * 13, l, 9.5, "F1", INK));
    y -= Math.max(1, lines.length) * 13 + 4;
  };

  // Executive summary is the solution itself; short quotes stay short.
  section(t.objectives, c.objectives);
  section(t.problem, c.problem);
  section(t.solution, c.solution);
  section(t.scope, c.scope);
  section(t.deliverables, c.deliverables);

  // Investment table
  if (c.lines.length) {
    heading(t.invest);
    const cols = { concept: M + 10, type: M + 262, qty: M + 352, unit: M + 432, amount: W - M - 10 };
    need(26);
    rect(page, M, y - 7, W - 2 * M, 20, NAVY);
    text(page, cols.concept, y, t.concept, 8.5, "F2", WHITE); text(page, cols.type, y, t.type, 8.5, "F2", WHITE);
    right(page, cols.qty, y, t.qty, 8.5, "F2", WHITE); right(page, cols.unit, y, t.unit, 8.5, "F2", WHITE);
    right(page, cols.amount, y, t.amount, 8.5, "F2", WHITE);
    y -= 22;
    c.lines.forEach((l, i) => {
      const desc = l.description ? wrap(l.description, 8.5, 240) : [];
      const nameLines = wrap(l.name, 10, 240, "F2");
      const h = nameLines.length * 13 + desc.length * 11 + 10;
      need(h);
      if (i % 2 === 0) rect(page, M, y - h + 13, W - 2 * M, h, TINT);
      nameLines.forEach((n, j) => text(page, cols.concept, y - j * 13, n, 10, "F2", INK));
      desc.forEach((d, j) => text(page, cols.concept, y - nameLines.length * 13 - j * 11 + 1, d, 8.5, "F1", MUTED));
      text(page, cols.type, y, l.kind === "monthly" ? t.monthly : t.oneTime, 9, "F1", INK);
      right(page, cols.qty, y, String(l.qty), 9.5);
      right(page, cols.unit, y, formatUsd(toCents(l.unitPrice), c.lang), 9.5);
      right(page, cols.amount, y, formatUsd(toCents(l.unitPrice) * l.qty, c.lang) , 9.5, "F2");
      y -= h;
    });
    need(48);
    y -= 4; rect(page, W - M - 230, y - 4, 230, 1, RULE); y -= 16;
    if (totals.oneTimeCents) { text(page, W - M - 230, y, t.total1, 10, "F2", MUTED); right(page, W - M - 10, y, formatUsd(totals.oneTimeCents, c.lang), 12, "F2", NAVY); y -= 18; }
    if (totals.monthlyCents) { text(page, W - M - 230, y, t.totalM, 10, "F2", MUTED); right(page, W - M - 10, y, formatUsd(totals.monthlyCents, c.lang) + " " + t.perMonth, 12, "F2", NAVY); y -= 18; }
    y -= 8;
  }

  heading(t.model);
  para(t.models[c.model]);
  if (c.commission) {
    const cm = c.commission;
    need(30);
    text(page, M + 14, y, t.commission, 10.5, "F2", VIOLET); y -= 18;
    kv(t.pctLabel, cm.status === "proposed" ? cm.pct + "%" : t.pctToNegotiate);
    kv(t.base, cm.base === "other" ? cm.baseNote : t.bases[cm.base]);
    kv(t.trigger, cm.trigger);
    if (cm.attributionWindowDays) kv(t.window, cm.attributionWindowDays + " " + t.days);
    kv(t.evidence, cm.evidence);
    kv(t.settlement, t.settle[cm.settlement]);
    if (cm.exclusions) kv(t.exclusions, cm.exclusions);
    if (cm.refunds) kv(t.refunds, cm.refunds);
    if (cm.expiry) kv(t.expiry, cm.expiry);
    y -= 6;
  }
  if (c.thirdPartyCosts) { need(30); text(page, M, y, t.thirdParty, 9.5, "F2", MUTED); y -= 15; para(c.thirdPartyCosts, 9.5); }

  section(t.timeline, c.timeline);
  section(t.support, c.support);
  section(t.exclusions, c.exclusions);
  section(t.dependencies, c.dependencies);
  section(t.terms, c.terms);
  section(t.notes, c.notes);
  heading(t.next);
  para(t.nextText(longDate(c.validUntil, c.lang)));
  if (c.seller) { need(16); text(page, M, y, t.contact + ": " + authorDisplayName(c.seller), 9.5, "F2", INK); y -= 16; }

  // ── Serialize ──────────────────────────────────────────────────────────────────────────────────────────
  const objects: string[] = [];
  const add = (s: string) => { objects.push(s); return objects.length; };
  const catalog = add(""), root = add("");
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const kids: number[] = [];
  pages.forEach((ops, i) => {
    const cmds: string[] = [];
    if (i > 0) {
      cmds.push("q", NAVY + " rg", `0 ${H - 34} ${W} 34 re f`, ACCENT + " rg", `0 ${H - 36} ${W} 2 re f`, "Q");
      cmds.push("BT", "/F2 9 Tf", WHITE + " rg", `1 0 0 1 ${M} ${H - 22} Tm`, "(" + esc("AVALON  /  CORE AGENCY") + ") Tj", "ET");
      const tag = clean(`${meta.number}  v${meta.version}`);
      cmds.push("BT", "/F1 8.5 Tf", "0.74 0.8 0.95 rg", `1 0 0 1 ${W - M - textWidth(tag, 8.5)} ${H - 22} Tm`, "(" + esc(tag) + ") Tj", "ET");
    }
    for (const op of ops) {
      if (op.k === "r") cmds.push("q", op.c + " rg", `${op.x} ${op.y} ${op.w} ${op.h} re f`, "Q");
      else cmds.push("BT", `/${op.f} ${op.z} Tf`, op.c + " rg", `1 0 0 1 ${op.x.toFixed(2)} ${op.y.toFixed(2)} Tm`, "(" + esc(op.s) + ") Tj", "ET");
    }
    const foot = clean(`${t.footer}  |  ${t.page} ${i + 1} ${t.of} ${pages.length}`);
    cmds.push("q", RULE + " rg", `${M} 46 ${W - 2 * M} 0.6 re f`, "Q");
    cmds.push("BT", "/F1 7.5 Tf", MUTED + " rg", `1 0 0 1 ${M} 32 Tm`, "(" + esc(foot) + ") Tj", "ET");
    const stream = cmds.join("\n") + "\n";
    const content = add("<< /Length " + Buffer.byteLength(stream, "latin1") + " >>\nstream\n" + stream + "endstream");
    kids.push(add(`<< /Type /Page /Parent ${root} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`));
  });
  const infoId = add(`<< /Title (${esc(clean(c.title))}) /Producer (Avalon OS Quoting Studio) >>`);
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${root} 0 R >>`;
  objects[root - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + " 0 R").join(" ")}] /Count ${kids.length} >>`;
  let pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"; const offsets: number[] = [];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf, "latin1")); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}
