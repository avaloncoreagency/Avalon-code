// Avalon Quoting Studio — pure model + PDF tests. Synthetic data only; no network, no database.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(relative, dependencies = {}) {
  const output = ts.transpileModule(fs.readFileSync(relative, "utf8"), {
    fileName: relative,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, Buffer, require: id => { if (id in dependencies) return dependencies[id]; if (id === "../identity/owners") return load("src/lib/identity/owners.ts"); throw Error("unexpected import: " + id); } }, { filename: relative });
  return exports;
}
const eq = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b);
const model = load("src/lib/quotes/model.ts");
const pdf = load("src/lib/quotes/pdf.ts", { "./model": model });

const base = () => ({
  schemaVersion: 1, lang: "es", currency: "USD", title: "Website y CRM para Barbería Demo",
  issueDate: "2026-11-19", validUntil: "2026-12-19",
  client: { company: "Barbería Demo QA", contact: "Contacto Sintético", email: "demo@example.test", phone: "", address: "" },
  issuer: { name: "Avalon Core Agency", email: "quotes@example.test", phone: "" },
  seller: "Equipo Avalon", objectives: "Más reservas confirmadas.", problem: "", solution: "Sitio web con reservas y CRM.",
  scope: "Cinco páginas y un CRM con etapas.", deliverables: "", exclusions: "Hosting y dominio.", dependencies: "Fotos del negocio.",
  timeline: "Tres semanas.", support: "30 días.", terms: "50 % al iniciar.", notes: "", thirdPartyCosts: "",
  model: "fixed",
  lines: [{ code: "desarrollo-web", name: "Implementación de website", description: "Responsive", kind: "one_time", qty: 1, unitPrice: "1500" }],
  commission: null,
});
const commission = (over = {}) => ({ status: "proposed", pct: "10", base: "gross_revenue", baseNote: "", trigger: "Cita atribuida y cobrada",
  attributionWindowDays: 30, evidence: "Reporte del sistema de reservas y comprobante", settlement: "monthly", exclusions: "Propinas",
  refunds: "Se descuentan reembolsos y contracargos", expiry: "12 meses", ...over });

test("exact cents: no floating point drift in totals", () => {
  const c = { ...base(), model: "hybrid", lines: [
    { code: null, name: "A", description: "", kind: "one_time", qty: 3, unitPrice: "0.10" },
    { code: null, name: "B", description: "", kind: "one_time", qty: 1, unitPrice: "0.20" },
    { code: null, name: "C", description: "", kind: "monthly", qty: 2, unitPrice: "149.99" },
  ] };
  const t = model.quoteTotals(c);
  assert.equal(t.oneTimeCents, 50);
  assert.equal(t.monthlyCents, 29998);
  assert.equal(model.centsToString(t.monthlyCents), "299.98");
  assert.throws(() => model.toCents("1.234"), /invalid_amount/);
  assert.throws(() => model.toCents("-5"), /invalid_amount/);
});

test("each billing model has a strict shape", () => {
  eq(model.validateQuote(base()), []);
  // Fixed price cannot hide a monthly fee or a commission.
  assert.ok(model.validateQuote({ ...base(), lines: [...base().lines, { code: null, name: "Soporte", description: "", kind: "monthly", qty: 1, unitPrice: "150" }] }).includes("model.fixed"));
  assert.ok(model.validateQuote({ ...base(), commission: commission() }).includes("model.fixed"));
  // Monthly subscription needs a monthly line.
  assert.ok(model.validateQuote({ ...base(), model: "monthly" }).includes("model.monthly"));
  eq(model.validateQuote({ ...base(), model: "monthly", lines: [{ code: null, name: "Mantenimiento", description: "", kind: "monthly", qty: 1, unitPrice: "150" }] }), []);
  // Commission-only quotes are valid without priced lines, but need the commission terms.
  assert.ok(model.validateQuote({ ...base(), model: "commission", lines: [] }).includes("model.commission"));
  eq(model.validateQuote({ ...base(), model: "commission", lines: [], commission: commission() }), []);
  // Hybrid needs at least two components shown separately.
  assert.ok(model.validateQuote({ ...base(), model: "hybrid" }).includes("model.hybrid"));
  eq(model.validateQuote({ ...base(), model: "hybrid", commission: commission() }), []);
});

test("commission percentage pending negotiation can be presented but never accepted", () => {
  const pending = { ...base(), model: "commission", lines: [], commission: commission({ status: "to_negotiate", pct: "" }) };
  eq(model.validateQuote(pending), []);
  eq(model.acceptanceBlockers(pending), ["commission_to_negotiate"]);
  assert.ok(model.validateQuote({ ...pending, commission: commission({ status: "to_negotiate", pct: "12" }) }).includes("commission.pct"));
  assert.ok(model.validateQuote({ ...pending, commission: commission({ pct: "0" }) }).includes("commission.pct"));
  assert.ok(model.validateQuote({ ...pending, commission: commission({ pct: "101" }) }).includes("commission.pct"));
  assert.ok(model.validateQuote({ ...pending, commission: commission({ base: "other", baseNote: "" }) }).includes("commission.baseNote"));
  assert.ok(model.validateQuote({ ...pending, commission: commission({ evidence: " " }) }).includes("commission.evidence"));
});

test("dates, required text and line limits are validated", () => {
  assert.ok(model.validateQuote({ ...base(), validUntil: "2026-11-01" }).includes("validUntil"));
  assert.ok(model.validateQuote({ ...base(), issueDate: "2026-02-30" }).includes("issueDate"));
  assert.ok(model.validateQuote({ ...base(), title: " " }).includes("title"));
  assert.ok(model.validateQuote({ ...base(), solution: "" }).includes("solution"));
  assert.ok(model.validateQuote({ ...base(), client: { ...base().client, email: "nope" } }).includes("client.email"));
  assert.ok(model.validateQuote({ ...base(), lines: [{ ...base().lines[0], unitPrice: "abc" }] }).includes("lines.0.unitPrice"));
  assert.ok(model.validateQuote({ ...base(), lines: [{ ...base().lines[0], qty: 0 }] }).includes("lines.0.qty"));
  assert.ok(model.validateQuote({ ...base(), lines: [{ ...base().lines[0], code: "../x" }] }).includes("lines.0.code"));
  assert.ok(model.validateQuote({ ...base(), lines: [{ ...base().lines[0], unitPrice: "0" }] }).includes("lines.zero"));
});

test("status machine mirrors the database: no skipping to accepted, terminal states are final", () => {
  assert.equal(model.canTransition("draft", "accepted"), false);
  assert.equal(model.canTransition("approved", "accepted"), false);
  assert.equal(model.canTransition("sent", "accepted"), true);
  for (const s of ["accepted", "rejected", "expired", "superseded"]) eq(model.QUOTE_TRANSITIONS[s], []);
  assert.ok(model.NOTE_REQUIRED.includes("accepted"));
  assert.ok(!model.REVISABLE.includes("sent"));
});

test("canonical JSON is key-order independent", () => {
  assert.equal(model.canonicalQuote({ b: 1, a: [{ d: 2, c: 3 }] }), model.canonicalQuote({ a: [{ c: 3, d: 2 }], b: 1 }));
});

test("client-safe snapshot drops unknown fields and normalizes amounts", () => {
  const dirty = { ...base(), internal: { directCosts: "SECRET-COST-900" }, margin: "SECRET" };
  const safe = model.clientSafe(dirty);
  assert.equal(JSON.stringify(safe).includes("SECRET"), false);
  assert.equal(safe.lines[0].unitPrice, "1500.00");
});

test("PDF: valid Letter document, amounts match the approved totals, no internal data", () => {
  const c = model.clientSafe({ ...base(), model: "hybrid",
    lines: [...base().lines, { code: "marketing-mensual", name: "Mantenimiento y soporte", description: "", kind: "monthly", qty: 1, unitPrice: "150" }],
    commission: commission() });
  eq(model.validateQuote(c), []);
  const bytes = pdf.renderQuotePdf(c, { number: "Q-2026-0001", version: 2 });
  const text = Buffer.from(bytes).toString("latin1");
  assert.ok(text.startsWith("%PDF-1.4"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));
  assert.match(text, /\/MediaBox \[0 0 612 792\]/);
  assert.match(text, /\(\$1,500\.00\)/);
  assert.match(text, /\(\$150\.00 \/ mes\)/);
  assert.match(text, /\(10%\)/);
  assert.match(text, /Q-2026-0001  v2/);
  assert.match(text, /Página 1 de \d/);
  // xref offsets point at real objects
  const start = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(text.slice(start, start + 4), "xref");
  for (const m of text.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)) assert.match(text.slice(Number(m[1]), Number(m[1]) + 12), /^\d+ 0 obj/);
  assert.equal(/SECRET|direct_cost|margin/i.test(text), false);
});

test("PDF: English, long text wraps across pages, special characters are safe", () => {
  const c = model.clientSafe({ ...base(), lang: "en", title: "Quote (draft) \\ test — “quotes”", scope: "Long scope. ".repeat(400) });
  const text = Buffer.from(pdf.renderQuotePdf(c, { number: "Q-2026-0002", version: 1 })).toString("latin1");
  const pages = Number(text.match(/\/Count (\d+)/)[1]);
  assert.ok(pages >= 3, "long scope spills onto extra pages");
  assert.match(text, /Page 1 of /);
  assert.match(text, /Quote \\\(draft\\\) \\\\ test - "quotes"/);
  assert.match(text, /This quote is valid until December 19, 2026/);
});

test("PDF: Avalon vector logo and ivory palette replace the blue corporate design", () => {
  const content = model.clientSafe({ ...base(), model: "hybrid",
    lines: [...base().lines, { code: "mantenimiento", name: "Monthly care", description: "", kind: "monthly", qty: 1, unitPrice: "150" }],
    commission: commission() });
  const text = Buffer.from(pdf.renderQuotePdf(content, { number: "Q-2026-0099", version: 1 })).toString("latin1");
  const pageCount = Number(text.match(/\\/Count (\\d+)/)[1]);
  assert.ok(pageCount >= 2);
  assert.equal((text.match(/0\\.992 0\\.985 0\\.973 rg/g) || []).length, pageCount, "all sheets use ivory paper");
  assert.match(text, /0\\.208 0\\.329 1 rg/, "official Avalon blue symbol is drawn");
  assert.match(text, /0\\.478 0\\.361 1 rg/, "official Avalon violet symbol detail is drawn");
  assert.match(text, /\\(AVALON\\) Tj/);
  assert.match(text, /\\(CORE AGENCY\\) Tj/);
  assert.match(text, /0 0 612 792 re f/, "US Letter sheets are tinted");
  assert.doesNotMatch(text, /0 300 612 492 re f/, "old navy slab must be removed");
  assert.match(text, /\\(\\$1,500\\.00\\)/, "commercial totals do not change");
});

test("contract prefill uses exact accepted amounts and references the quote version", () => {
  const c = model.clientSafe({ ...base(), model: "hybrid", commission: commission(),
    lines: [...base().lines, { code: null, name: "Soporte", description: "", kind: "monthly", qty: 1, unitPrice: "150" }] });
  const p = model.contractPrefill(c, "Q-2026-0001", 3);
  assert.equal(p.setupFee, "1500.00");
  assert.equal(p.monthlyFee, "150.00");
  assert.match(p.commission, /^10% of attributable gross revenue actually collected/);
  assert.match(p.specialTerms, /Q-2026-0001 v3/);
  eq(p.services, ["desarrollo-web"]);
  assert.equal(model.contractPrefill({ ...c, commission: null }, "Q", 1).commission, "None.");
  assert.equal(model.quoteFileName("Q-2026-0001", 3), "Avalon-Quote-Q-2026-0001-v3.pdf");
  assert.equal(model.quoteFileName("Q/../x", 1), "Avalon-Quote-Qx-v1.pdf");
});
