const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(relative, dependencies = {}) {
  const source = fs.readFileSync(relative, "utf8");
  const output = ts.transpileModule(source, {
    fileName: relative,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports, Buffer,
    require: id => {
      if (id in dependencies) return dependencies[id];
      if (id === "./master.json") return require("../src/lib/contracts/master.json");
      throw Error("unexpected import: " + id);
    }
  }, { filename: relative });
  return exports;
}
const schedules = load("src/lib/contracts/service-schedules.ts");
const agreement = load("src/lib/contracts/agreement.ts", { "./service-schedules": schedules });
const pdf = load("src/lib/contracts/pdf.ts", { "./agreement": agreement });
const sample = {
  agencyLegalForm: "joint_individuals", agencyName: "José Muñoz and Ana López",
  agencyBrand: "Avalon Core Agency", agencyAddress: "100 Example Ave, Florida", agencyEmail: "demo@example.test",
  clientName: "Café del Sol", clientAddress: "200 Example St, Florida",
  clientEmail: "client@example.test", county: "Broward", effectiveDate: "2026-11-14",
  services: ["Website", "AI Chatbot"], scope: "Five website pages and one chatbot; specific scope approved by both parties.",
  exclusions: "Advertising, domains and hosting", deliverables: "HTML/React files and approved chatbot configuration",
  milestones: "Design review, implementation, acceptance", acceptance: "Working links and forms on agreed browsers",
  revisions: "Two bounded revision rounds", term: "Three months; no auto-renewal",
  setupFee: "1200.00", monthlyFee: "150.00", paymentSchedule: "Deposit plus Net 15 invoices",
  adSpend: "No paid media until separately approved", commission: "None", specialTerms: ""
};
test("truthful contracting identity and fee/date validation", () => {
  assert.equal(agreement.validateAgreement(sample).length, 0);
  assert.ok(agreement.validateAgreement({ ...sample, agencyName: "Avalon Core Agency" }).includes("agencyName"));
  assert.ok(agreement.validateAgreement({ ...sample, agencyName: "Avalon Core Agency LLC" }).includes("agencyName"));
  assert.ok(agreement.validateAgreement({ ...sample, effectiveDate: "2026-02-30" }).includes("effectiveDate"));
  assert.ok(agreement.validateAgreement({ ...sample, monthlyFee: "-5" }).includes("monthlyFee"));
  assert.equal(agreement.validateAgreement({ ...sample, agencyLegalForm: "registered_entity", agencyName: "Avalon Core Agency LLC" }).includes("agencyName"), false);
});
test("frozen clause and schedule snapshots survive future template changes", () => {
  const snapshot = agreement.makeAgreementSnapshot(sample);
  assert.equal(snapshot.schedules.length, 2);
  assert.ok(agreement.isAgreementSnapshot(snapshot));
  const reversed = { ...snapshot, data: Object.fromEntries(Object.entries(sample).reverse()) };
  assert.equal(agreement.canonicalSnapshot(snapshot), agreement.canonicalSnapshot(reversed));
  assert.equal(agreement.isAgreementSnapshot({ ...snapshot, clauses: [] }), false);
  assert.equal(agreement.isAgreementSnapshot({ ...snapshot, schedules: [["Other", "bad"]] }), false);
  assert.ok(agreement.agreementLines(snapshot, "qa-0001").some(x => x.heading === "EXHIBIT B / SERVICE-SPECIFIC CONDITIONS"));
});
test("real PDF bytes contain clauses, full Latin legal names, valid xref and footer", () => {
  const snapshot = agreement.makeAgreementSnapshot(sample);
  const file = Buffer.from(pdf.renderAgreementPdf(snapshot, "88f45b15-250d-4494-8ff2-a1b64a565690"));
  const text = file.toString("latin1");
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text, /%%EOF$/);
  assert.ok(text.includes("José Muñoz") && text.includes("Café del Sol"));
  assert.ok(text.includes("EXHIBIT B / SERVICE-SPECIFIC CONDITIONS"));
  assert.ok(text.includes("NOT SIGNED"));
  const xref = /startxref\n(\d+)\n%%EOF$/.exec(text);
  assert.ok(xref, "cross-reference offset exists");
  assert.equal(text.slice(Number(xref[1]), Number(xref[1]) + 5), "xref\n");
  const streams = [...text.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)endstream/g)];
  assert.ok(streams.length >= 3, "multi-page content streams");
  for (const m of streams) assert.equal(Buffer.byteLength(m[2], "latin1"), Number(m[1]));
});
