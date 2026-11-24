/**
 * Client-facing invoice document (pure). Built ONLY from stored records: crm_invoices (number, dates, amount, status),
 * the sale (lines, subtotal, discount, tax, total) and payments allocated to the invoice. Rendering, printing or
 * downloading never writes anything: no new number, no payment, no status change. Internal notes, commissions,
 * costs and margins are not part of this type, so they cannot reach the document.
 */
import { textWidth } from "@/lib/quotes/pdf";

export type InvoiceLine = { description: string; quantity: string; unitPrice: string; discount: string; total: string; billing: string };
export type InvoicePayment = { receivedOn: string; amount: string; method: string; status: "recorded" | "verified" };
export type InvoiceDoc = {
  number: string; issuedOn: string; dueOn: string | null; currency: string; amount: string; status: "issued" | "void"; voidReason: string;
  saleNumber: string; soldOn: string; quoteRef: string | null;
  issuer: { name: string; email: string; phone: string };
  client: { legalName: string; tradeName: string; code: string; location: string; country: string; contactName: string; contactEmail: string };
  lines: InvoiceLine[]; saleSubtotal: string; saleDiscount: string; saleTaxRate: string; saleTax: string; saleTotal: string;
  payments: InvoicePayment[]; agreedMethod: string | null;
  /** Who is responsible for the sale (seller recorded on crm_sales). */
  seller: string;
  /** How the sale was closed: fixed amount, a percentage (variable agreement) or both — from stored terms only. */
  closing: { model: "fixed" | "commission" | "hybrid"; pct: string | null; basis: string | null };
  /** Payment channels the client may use (split payments allowed). */
  acceptedMethods: string[];
};

/** "Cerrada por $1,000.00" · "Cerrada al 33% sobre ingresos brutos" · both for hybrid. */
export function closingText(doc: Pick<InvoiceDoc, "closing" | "saleTotal" | "currency">, lang: "es" | "en") {
  const t = (es: string, en: string) => lang === "es" ? es : en;
  const amount = money(cents(doc.saleTotal), doc.currency, lang);
  const pct = doc.closing.pct ? `${Number(doc.closing.pct)}%${doc.closing.basis ? t(" sobre ", " of ") + doc.closing.basis : ""}` : null;
  if (doc.closing.model === "commission" && pct) return t("Cerrada al ", "Closed at ") + pct;
  if (doc.closing.model === "hybrid" && pct) return t("Cerrada por ", "Closed at ") + amount + " + " + pct;
  return t("Cerrada por ", "Closed at ") + amount;
}
export type InvoiceState = "void" | "paid" | "partially_paid" | "payment_pending_verification" | "overdue" | "open";

const cents = (v: string | number) => Math.round(Number(v) * 100);
/** Money state of ONE invoice from its own allocated payments (reversed ones are never passed in). */
export function invoiceState(doc: Pick<InvoiceDoc, "status" | "amount" | "dueOn" | "payments">, today: string) {
  const amount = cents(doc.amount);
  const verified = doc.payments.filter(p => p.status === "verified").reduce((a, p) => a + cents(p.amount), 0);
  const recorded = doc.payments.reduce((a, p) => a + cents(p.amount), 0);
  const balance = Math.max(0, amount - verified);
  let state: InvoiceState;
  if (doc.status === "void") state = "void";
  else if (verified >= amount) state = "paid";
  else if (recorded >= amount) state = "payment_pending_verification";
  else if (doc.dueOn && doc.dueOn < today) state = "overdue";
  else if (verified > 0) state = "partially_paid";
  else state = "open";
  return { state, verifiedCents: verified, recordedCents: recorded, balanceCents: doc.status === "void" ? 0 : balance };
}
export const STATE_LABEL: Record<InvoiceState, [string, string]> = {
  void: ["Anulada", "Void"], paid: ["Pagada", "Paid"], partially_paid: ["Parcialmente pagada", "Partially paid"],
  payment_pending_verification: ["Pago registrado, pendiente de verificación", "Payment recorded, pending verification"],
  overdue: ["Vencida", "Overdue"], open: ["Pendiente de pago", "Awaiting payment"],
};
export const money = (c: number, currency: string, lang: "es" | "en") =>
  new Intl.NumberFormat(lang === "es" ? "es-US" : "en-US", { style: "currency", currency }).format(c / 100);
/**
 * One-click invoice for a sale: bills exactly what has not been invoiced yet (sale total − live invoices).
 * The number is derived from the real sale number (FAC-<sale>, then FAC-<sale>-2 …), never invented; a double click
 * finds the first invoice and bills nothing more. Returns null when there is nothing left to bill.
 */
export function nextSaleInvoice(saleNumber: string, saleTotal: string | number, invoices: { amount: string | number; status: string }[]) {
  const issued = invoices.filter(i => i.status === "issued").reduce((a, i) => a + cents(i.amount), 0);
  const remaining = cents(saleTotal) - issued;
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  const base = "FAC-" + saleNumber.replace(/[^A-Za-z0-9-]+/g, "-").slice(0, 48);
  return { number: invoices.length === 0 ? base : `${base}-${invoices.length + 1}`, amount: (remaining / 100).toFixed(2) };
}
export const fileName = (number: string) => `Avalon-Invoice-${number.replace(/[^A-Za-z0-9._-]+/g, "-")}.pdf`;

// ── PDF (US Letter, dependency-free) ────────────────────────────────────────────────────────────────────────
const W = 612, H = 792, M = 54;
const NAVY = "0.035 0.067 0.161", INK = "0.118 0.153 0.243", MUTED = "0.42 0.45 0.53", ACCENT = "0.161 0.475 1", RULE = "0.88 0.9 0.94",
  TINT = "0.955 0.965 0.985", WHITE = "1 1 1", GOLD = "0.93 0.74 0.36", RED = "0.75 0.18 0.2";
const clean = (s: string) => s.normalize("NFC").replace(/[‐-―]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
const esc = (s: string) => clean(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const date = (iso: string, lang: "es" | "en") => new Date(iso + "T12:00:00Z").toLocaleDateString(lang === "es" ? "es-US" : "en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

export function renderInvoicePdf(doc: InvoiceDoc, lang: "es" | "en", today: string): Uint8Array {
  const t = (es: string, en: string) => lang === "es" ? es : en;
  const st = invoiceState(doc, today);
  const pages: string[][] = [];
  let ops: string[] = []; pages.push(ops);
  let y = H;
  const text = (x: number, yy: number, s: string, z: number, bold = false, col = INK) =>
    ops.push("BT", `/${bold ? "F2" : "F1"} ${z} Tf`, col + " rg", `1 0 0 1 ${x.toFixed(2)} ${yy.toFixed(2)} Tm`, "(" + esc(s) + ") Tj", "ET");
  const right = (xr: number, yy: number, s: string, z: number, bold = false, col = INK) => text(xr - textWidth(s, z, bold ? "F2" : "F1"), yy, s, z, bold, col);
  const rect = (x: number, yy: number, w: number, h: number, col: string) => ops.push("q", col + " rg", `${x} ${yy} ${w} ${h} re f`, "Q");
  const fit = (s: string, z: number, max: number, bold = false) => { let o = clean(s); while (o.length > 1 && textWidth(o, z, bold ? "F2" : "F1") > max) o = o.slice(0, -2) + "…"; return o; };
  const need = (h: number) => { if (y - h < 80) { ops = []; pages.push(ops); y = H - 60; } };

  // Header band
  rect(0, H - 96, W, 96, NAVY); rect(0, H - 98, W, 2, ACCENT); rect(M, H - 34, 28, 3, GOLD);
  text(M, H - 60, "AVALON", 24, true, WHITE); text(M + 1, H - 76, "CORE AGENCY", 8.5, true, "0.74 0.8 0.95");
  right(W - M, H - 52, t("FACTURA", "INVOICE"), 20, true, WHITE);
  right(W - M, H - 70, doc.number, 11, true, "0.85 0.89 1");
  y = H - 130;
  // Issuer / client / meta
  text(M, y, t("EMISOR", "FROM"), 8, true, MUTED); text(M + 190, y, t("FACTURAR A", "BILL TO"), 8, true, MUTED); text(M + 380, y, t("DETALLES", "DETAILS"), 8, true, MUTED);
  y -= 15;
  const col = (x: number, lines: string[]) => lines.filter(Boolean).slice(0, 5).forEach((l, i) => text(x, y - i * 13, fit(l, 9.5, 180, i === 0), 9.5, i === 0));
  col(M, [doc.issuer.name, doc.issuer.email, doc.issuer.phone]);
  col(M + 190, [doc.client.legalName, doc.client.tradeName && doc.client.tradeName !== doc.client.legalName ? doc.client.tradeName : "", doc.client.contactName,
    doc.client.contactEmail, [doc.client.location, doc.client.country].filter(Boolean).join(", ")]);
  const meta: [string, string][] = [[t("Emisión", "Issued"), date(doc.issuedOn, lang)], [t("Vencimiento", "Due"), doc.dueOn ? date(doc.dueOn, lang) : "—"],
    [t("Venta", "Sale"), doc.saleNumber], ...(doc.quoteRef ? [[t("Cotización", "Quote"), doc.quoteRef] as [string, string]] : []),
    [t("Responsable", "Sales rep"), doc.seller || "—"], [t("Moneda", "Currency"), doc.currency]];
  meta.forEach(([k, v], i) => { text(M + 380, y - i * 13, k, 8.5, false, MUTED); right(W - M, y - i * 13, fit(v, 9, 110, true), 9, true); });
  y -= Math.max(5, meta.length) * 13 + 18;
  // Status pill
  const label = t(...STATE_LABEL[st.state]);
  rect(M, y - 6, textWidth(label, 9, "F2") + 20, 20, st.state === "void" || st.state === "overdue" ? RED : st.state === "paid" ? "0.13 0.55 0.33" : ACCENT);
  text(M + 10, y, label, 9, true, WHITE);
  if (doc.status === "void" && doc.voidReason) text(M + textWidth(label, 9, "F2") + 32, y, fit(t("Motivo: ", "Reason: ") + doc.voidReason, 9, 330), 9, false, RED);
  else right(W - M, y, fit(closingText(doc, lang), 9.5, 300, true), 9.5, true, NAVY);
  y -= 34;
  // Lines
  const cols = { d: M + 8, q: M + 240, u: M + 330, total: W - M - 8 };
  rect(M, y - 6, W - 2 * M, 22, NAVY);
  text(cols.d, y, t("Servicio / descripción", "Service / description"), 8.5, true, WHITE); right(cols.q + 30, y, t("Cant.", "Qty"), 8.5, true, WHITE);
  right(cols.u + 70, y, t("Precio unit.", "Unit price"), 8.5, true, WHITE); right(cols.total, y, t("Importe", "Amount"), 8.5, true, WHITE);
  y -= 24;
  doc.lines.forEach((l, i) => {
    need(20);
    if (i % 2 === 0) rect(M, y - 6, W - 2 * M, 18, TINT);
    text(cols.d, y, fit(l.description, 9, 225), 9); right(cols.q + 30, y, String(Number(l.quantity)), 9);
    right(cols.u + 70, y, money(cents(l.unitPrice), doc.currency, lang), 9); right(cols.total, y, money(cents(l.total), doc.currency, lang), 9, true);
    y -= 18;
  });
  y -= 8; ops.push("q", RULE + " rg", `${M} ${y} ${W - 2 * M} 0.8 re f`, "Q"); y -= 18;
  // Totals
  const total = (k: string, v: string, bold = false, colr = INK) => { need(16); text(M + 300, y, k, 9.5, bold, bold ? NAVY : MUTED); right(W - M - 8, y, v, bold ? 11 : 9.5, bold, colr); y -= bold ? 18 : 14; };
  const invoiceIsWholeSale = cents(doc.amount) === cents(doc.saleTotal);
  total(t("Subtotal de la venta", "Sale subtotal"), money(cents(doc.saleSubtotal), doc.currency, lang));
  if (cents(doc.saleDiscount)) total(t("Descuento", "Discount"), "- " + money(cents(doc.saleDiscount), doc.currency, lang));
  if (cents(doc.saleTax)) total(t(`Impuestos (${Number(doc.saleTaxRate)}%)`, `Tax (${Number(doc.saleTaxRate)}%)`), money(cents(doc.saleTax), doc.currency, lang));
  if (!invoiceIsWholeSale) total(t("Total de la venta", "Sale total"), money(cents(doc.saleTotal), doc.currency, lang));
  total(invoiceIsWholeSale ? t("Total facturado", "Total invoiced") : t("Importe de esta factura", "This invoice amount"), money(cents(doc.amount), doc.currency, lang), true, NAVY);
  if (st.verifiedCents) total(t("Pagos verificados", "Verified payments"), "- " + money(st.verifiedCents, doc.currency, lang));
  if (st.recordedCents > st.verifiedCents) total(t("Pagos registrados sin verificar", "Recorded, unverified payments"), money(st.recordedCents - st.verifiedCents, doc.currency, lang));
  total(t("Saldo pendiente", "Balance due"), money(st.balanceCents, doc.currency, lang), true, st.balanceCents ? RED : "0.13 0.55 0.33");
  // Payments + terms
  if (doc.payments.length) {
    y -= 10; need(30); text(M, y, t("PAGOS APLICADOS A ESTA FACTURA", "PAYMENTS APPLIED TO THIS INVOICE"), 8, true, MUTED); y -= 14;
    for (const p of doc.payments) { need(14); text(M, y, `${date(p.receivedOn, lang)} · ${p.method} · ${p.status === "verified" ? t("verificado", "verified") : t("registrado", "recorded")}`, 9); right(W - M - 8, y, money(cents(p.amount), doc.currency, lang), 9); y -= 13; }
  }
  if (doc.acceptedMethods.length) { y -= 8; need(16); text(M, y, fit(t("Métodos de pago aceptados: ", "Accepted payment methods: ") + doc.acceptedMethods.join(", "), 9, W - 2 * M), 9, false, MUTED); y -= 14; }
  else if (doc.agreedMethod) { y -= 8; need(16); text(M, y, t("Método de pago acordado: ", "Agreed payment method: ") + doc.agreedMethod, 9, false, MUTED); y -= 14; }
  y -= 6; need(16); text(M, y, fit(t("Responsable de la venta: ", "Sales representative: ") + (doc.seller || "—") + "  ·  " + closingText(doc, lang), 9, W - 2 * M), 9, false, MUTED); y -= 14;

  // Serialize
  const objects: string[] = []; const add = (s: string) => { objects.push(s); return objects.length; };
  const catalog = add(""), root = add("");
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  pages.forEach((p, i) => {
    const foot = `Avalon Core Agency  |  ${doc.number}  |  ${t("Página", "Page")} ${i + 1} / ${pages.length}`;
    const stream = [...p, "q", RULE + " rg", `${M} 46 ${W - 2 * M} 0.6 re f`, "Q", "BT", "/F1 7.5 Tf", MUTED + " rg", `1 0 0 1 ${M} 32 Tm`, "(" + esc(foot) + ") Tj", "ET"].join("\n") + "\n";
    const content = add("<< /Length " + Buffer.byteLength(stream, "latin1") + " >>\nstream\n" + stream + "endstream");
    kids.push(add(`<< /Type /Page /Parent ${root} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`));
  });
  const info = add(`<< /Title (${esc(t("Factura ", "Invoice ") + doc.number)}) /Producer (Avalon OS) >>`);
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${root} 0 R >>`;
  objects[root - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + " 0 R").join(" ")}] /Count ${kids.length} >>`;
  let pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"; const offsets: number[] = [];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf, "latin1")); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}
