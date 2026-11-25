// AVALON-CLAUDE-CAX-OMEGA-001 (pure): e-mail templates, invitation template, onboarding rules, PDF manuals,
// contract versions and the SMTP transport guard. Synthetic data only.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const ts = require("typescript");

const cache = new Map();
const STUBS = { "server-only": {}, nodemailer: { createTransport: () => { throw Error("network transport must not be created in tests"); } } };
function load(file) {
  const abs = path.resolve(file);
  if (cache.has(abs)) return cache.get(abs).exports;
  const mod = { exports: {} }; cache.set(abs, mod);
  if (abs.endsWith(".json")) { mod.exports = JSON.parse(fs.readFileSync(abs, "utf8")); return mod.exports; }
  const out = ts.transpileModule(fs.readFileSync(abs, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, resolveJsonModule: true } }).outputText;
  const req = spec => {
    if (spec in STUBS) return STUBS[spec];
    const base = spec.startsWith("@/") ? path.join("src", spec.slice(2)) : spec.startsWith(".") ? path.join(path.dirname(abs), spec) : null;
    if (!base) return require(spec);
    return load(fs.existsSync(base) && base.endsWith(".json") ? base : base + ".ts");
  };
  new Function("module", "exports", "require", out)(mod, mod.exports, req);
  return mod.exports;
}
const email = load("src/lib/comms/email.ts");
const model = load("src/lib/onboarding/model.ts");
const manual = load("src/lib/docs/manual.ts");
const versions = load("src/lib/contracts/versions.ts");
const agreement = load("src/lib/contracts/agreement.ts");
const company = { ...email.DEFAULT_COMPANY };

test("agent invitation: signed by the inviting owner, real link, ES/EN, escaped", () => {
  const miguel = email.signerFrom({ user_id: "u1", email: "avalonagencymh@gmail.com" }, "es");
  const samuel = email.signerFrom({ user_id: "u2", email: "avaloncoreagencysm@gmail.com" }, "en");
  assert.deepEqual(miguel, { name: "Miguel Hobaica", title: "Cofundador" });
  assert.deepEqual(samuel, { name: "Samuel Muñoz", title: "Co-founder" });
  const es = email.renderAgentInvite({ lang: "es", inviter: miguel, inviteeName: "Ana <script>alert(1)</script>", roleLabel: "Agente comercial", actionUrl: "https://example.supabase.co/auth/v1/verify?token=abc&type=invite", expiresHours: 24, company });
  assert.equal(es.subject, "Avalon Core Agency — Miguel Hobaica te invita a unirte al equipo");
  assert.match(es.html, /ACTIVAR MI CUENTA/);
  assert.match(es.html, /Miguel Hobaica<\/strong><br><span[^>]*>Cofundador \| Avalon Core Agency/);
  assert.ok(!es.html.includes("<script>alert"), "user-controlled names are escaped");
  assert.match(es.html, /Ana &lt;script&gt;/);
  assert.match(es.html, /token=abc&amp;type=invite/);
  assert.match(es.html, /avalon-mark\.png/);
  assert.match(es.text, /Activar mi cuenta: https:\/\/example\.supabase\.co/);
  const en = email.renderAgentInvite({ lang: "en", inviter: samuel, inviteeName: "Ana", roleLabel: "", actionUrl: "https://x.test/a", expiresHours: 24, company });
  assert.equal(en.subject, "Avalon Core Agency — Samuel Muñoz invited you to join the team");
  assert.match(en.html, /Samuel Muñoz/);
  // A non-https link never becomes a button.
  const bad = email.renderAgentInvite({ lang: "es", inviter: miguel, inviteeName: "Ana", roleLabel: "", actionUrl: "javascript:alert(1)", expiresHours: 24, company });
  assert.ok(!bad.html.includes("javascript:"));
});

test("signer never comes from an e-mail prefix or a UUID", () => {
  assert.equal(email.signerFrom({ user_id: "u3", email: "someone@example.test" }, "es"), null);
  assert.equal(email.signerFrom({ user_id: "u3", email: "x@example.test", display_name: "3f1c9a2b-1111-4111-8111-123456789abc" }, "es"), null);
  assert.deepEqual(email.signerFrom({ user_id: "u3", email: "x@example.test", display_name: "Laura Gómez", title: "Agente" }, "es"), { name: "Laura Gómez", title: "Agente" });
  // An editable nickname can never claim a founder identity for another account.
  assert.notEqual(email.signerFrom({ user_id: "u4", email: "x@example.test", display_name: "avalonagencymh" }, "es")?.name, "Miguel Hobaica");
});

test("client welcome: real data only, support e-mail, phone only when approved", () => {
  const rep = { name: "Samuel Muñoz", title: "Cofundador" };
  const w = email.renderClientWelcome({ lang: "es", contactName: "Laura", companyName: "Café QA", service: "Sitio web", representative: rep, nextStep: null, documents: [], invoiceNumber: null, company });
  assert.equal(w.subject, "Bienvenido a Avalon Core Agency — Comencemos tu proyecto");
  assert.match(w.html, /avalonacoreagency@gmail\.com/);
  assert.ok(!/Teléfono/.test(w.html), "no phone placeholder when no approved business number");
  assert.ok(!/Próximo paso/.test(w.html), "no invented next step");
  const withPhone = email.renderClientWelcome({ lang: "en", contactName: "Laura", companyName: "Café QA", service: "Website", representative: rep, nextStep: "Kickoff", documents: ["Manual v1"], invoiceNumber: "FAC-V-1", company: { ...company, supportPhone: "+1 305 000 0000" } });
  assert.match(withPhone.html, /\+1 305 000 0000/);
  assert.match(withPhone.html, /Copy of invoice FAC-V-1/);
  assert.match(withPhone.text, /Next step: Kickoff/);
  const inv = email.renderInvoiceCopy({ lang: "es", contactName: "Laura", invoiceNumber: "FAC-V-1", companyName: "Café QA", representative: rep, company });
  assert.match(inv.text, /no crea cargos nuevos ni cambia el estado de pago/);
});

test("Supabase Auth invite template is generated from the same source and uses the real confirmation link", () => {
  execFileSync(process.execPath, ["scripts/email/build-auth-templates.cjs", "--check"], { stdio: "pipe" });
  const html = fs.readFileSync("supabase/templates/invite.html", "utf8");
  assert.match(html, /\{\{ \.ConfirmationURL \}\}/);
  assert.match(html, /\{\{ \.Data\.inviter_name \}\}/);
  assert.match(html, /\{\{ if eq \.Data\.lang "en" \}\}/);
  assert.ok(!/CONFIRMATION_URL\.invalid/.test(html));
});

test("onboarding: product checklists, no shortcut to delivered/welcome_sent, delivery gate lists every blocker", () => {
  for (const p of model.PRODUCT_TYPES) assert.ok(model.checklistFor(p).length >= 6, p);
  assert.ok(model.checklistFor("ecommerce").some(i => i.key === "returns"));
  assert.ok(model.checklistFor("ai_tools").some(i => i.key === "activation"), "paused AI products need explicit activation");
  assert.equal(model.canMove("delivery_ready", "delivered"), false);
  assert.equal(model.canMove("approved", "welcome_sent"), false);
  assert.equal(model.canMove("approved", "kickoff"), true);
  assert.equal(model.canMove("preparation", "qa"), false, "no jumping ahead");
  assert.equal(model.canMove("delivered", "support"), true);
  assert.equal(model.canMove("closed", "support"), false);
  const list = model.toggleItem(model.checklistFor("other"), "deliverables", true, "u1", "2026-11-24T00:00:00Z");
  assert.equal(model.progress(list).done, 1);
  assert.throws(() => model.toggleItem(list, "nope", true, "u1", "x"), /onboarding_checklist_unknown/);
  assert.deepEqual(model.deliveryBlockers({ productType: "website", checklist: list, qaPassed: false, liveUrl: "http://x", manualIssued: false, contractVerified: false, deliveredTo: "" }).sort(),
    ["checklist_incomplete", "contract_not_verified", "live_url_missing", "manual_missing", "qa_not_passed", "recipient_missing"]);
  // OPS-001: no URL is invented for services without a public URL; the rest of the gate still applies.
  assert.ok(!model.deliveryBlockers({ productType: "marketing", checklist: list, qaPassed: false, liveUrl: "", manualIssued: false, contractVerified: false, deliveredTo: "" }).includes("live_url_missing"));
  assert.ok(model.deliveryBlockers({ productType: "crm", checklist: list, qaPassed: true, liveUrl: "", manualIssued: true, contractVerified: true, deliveredTo: "Laura" }).includes("live_url_missing"));
  // OPS-004: acceptance needs a recorded delivery and evidence.
  assert.deepEqual(model.acceptanceBlockers({ deliveredAt: null, evidence: "" }).sort(), ["acceptance_evidence_missing", "not_delivered"]);
  assert.deepEqual(model.acceptanceBlockers({ deliveredAt: "2026-11-25T00:00:00Z", evidence: "Correo del cliente 2026-11-25" }), []);
  const done = model.checklistFor("other").map(i => ({ ...i, done: true }));
  assert.deepEqual(model.deliveryBlockers({ productType: "website", checklist: done, qaPassed: true, liveUrl: "https://client.example", manualIssued: true, contractVerified: true, deliveredTo: "Laura" }), []);
  assert.deepEqual(model.readChecklist([{ key: "a", label: ["A", "A"], done: true }, { bad: 1 }, "x"]).length, 1, "tolerant reader drops malformed items");
});

test("manual PDF: real data, no passwords, deterministic bytes, support from settings", () => {
  const input = { lang: "es", clientName: "Laura QA", companyName: "Café QA", productType: "website", productName: "Sitio Café QA", liveUrl: "https://cafe.example",
    version: 2, issuedOn: "2026-11-24", responsible: "Miguel Hobaica", contractRef: "ACA-MSA-1.2-2026-11 · abcd1234", scope: "Cinco páginas", exclusions: "Hosting",
    support: { email: "avalonagencymh@gmail.com", phone: null, hours: "" }, maintenance: "", warranty: "" };
  const snap = manual.buildManual(input);
  assert.ok(manual.isManualSnapshot(snap));
  const a = Buffer.from(manual.renderManualPdf(snap)), b = Buffer.from(manual.renderManualPdf(JSON.parse(JSON.stringify(snap))));
  assert.ok(a.equals(b), "same snapshot → identical bytes (hash-verifiable)");
  const s = a.toString("latin1");
  assert.ok(s.startsWith("%PDF-1.4"));
  assert.match(s, /MANUAL DEL PRODUCTO/);
  assert.match(s, /https:\/\/cafe\.example/);
  assert.match(s, /avalonagencymh@gmail\.com/);
  assert.match(s, /no contiene contrase/i);
  assert.ok(!/Tel[eé]fono:/.test(s), "no phone line without an approved number");
  assert.match(s, /no garantiza ventas/);
  assert.equal(manual.manualFileName(snap), "Avalon-Manual-Sitio-Caf-QA-v2.pdf".replace("Caf-", "Caf-"));
  for (const p of model.PRODUCT_TYPES) assert.ok(manual.buildManual({ ...input, productType: p }).sections.length >= 9, p);
});

test("contracts: v1.2 adds disclosures, stays under attorney review, old drafts keep their text", () => {
  const v12 = versions.masterVersion("ACA-MSA-1.2-2026-11"), v11 = versions.masterVersion("ACA-MSA-1.1-2026-11");
  assert.equal(v12.status, "attorney_review_required");
  assert.ok(!versions.MASTER_VERSIONS.some(v => v.status === "approved"), "nothing is presented as legally approved");
  assert.equal(versions.DEFAULT_MASTER_VERSION, "ACA-MSA-1.1-2026-11");
  assert.deepEqual(versions.selectableVersions().map(v => v.version), ["ACA-MSA-1.1-2026-11"], "a version pending attorney review is never offered for new drafts");
  assert.deepEqual(versions.reviewOnlyVersions().map(v => v.version), ["ACA-MSA-1.2-2026-11"]);
  const contractAction = fs.readFileSync("src/app/admin/workspace/crm/clients/[id]/contracts/actions.ts", "utf8");
  assert.match(contractAction, /!master\.availableForNewDrafts/, "server refuses review-only versions even if the form is tampered with");
  for (const n of ["24", "25", "26", "27", "28", "29"]) assert.ok(v12.clauses.some(c => c[0].startsWith(n + " / ")), n);
  assert.match(v12.clauses.find(c => c[0].startsWith("27"))[1], /never presumed, preselected/);
  assert.match(v12.clauses.find(c => c[0].startsWith("28"))[1], /no personal guarantee/);
  assert.doesNotMatch(v12.clauses.map(c => c[1]).join(" "), /immune|guarantee(s|d)? (results|sales|leads)/i);
  assert.equal(v11.clauses.length, 23);
  const data = { agencyLegalForm: "joint_individuals", agencyName: "Ana QA and Luis QA", agencyBrand: "Avalon Core Agency", agencyAddress: "1 Example", agencyEmail: "a@example.test",
    clientName: "Cliente QA", clientAddress: "2 Example", clientEmail: "c@example.test", county: "Broward", effectiveDate: "2026-11-24", services: ["Website"], scope: "Scope",
    exclusions: "", deliverables: "Site", milestones: "M", acceptance: "A", revisions: "2", term: "3 months", setupFee: "100.00", monthlyFee: "0.00", paymentSchedule: "Net 15", adSpend: "None", commission: "None", specialTerms: "" };
  assert.equal(agreement.makeAgreementSnapshot(data).clauses.length, 23);
  const s12 = agreement.makeAgreementSnapshot(data, "ACA-MSA-1.2-2026-11");
  assert.equal(s12.templateVersion, "ACA-MSA-1.2-2026-11");
  assert.equal(s12.clauses.length, 29);
  assert.ok(agreement.isAgreementSnapshot(s12));
  assert.throws(() => agreement.makeAgreementSnapshot(data, "ACA-MSA-9.9"), /agreement_version_invalid/);
});

test("SMTP transport: nothing is sent without configuration; From must be the authenticated account", async () => {
  const transport = load("src/lib/comms/transport.ts");
  const msg = { from: "avalonagencymh@gmail.com", fromName: "Avalon Core Agency", to: "c@example.test", toName: "C", replyTo: "avalonagencymh@gmail.com", subject: "Hola", html: "<p>Hola</p>", text: "Hola", attachments: [] };
  const saved = { ...process.env };
  try {
    delete process.env.AVALON_SMTP_USER; delete process.env.AVALON_SMTP_PASS;
    assert.deepEqual(await transport.sendMail(msg), { status: "blocked_no_transport", reason: "not_configured" });
    process.env.AVALON_SMTP_USER = "other@gmail.com"; process.env.AVALON_SMTP_PASS = "x";
    assert.deepEqual(await transport.sendMail(msg), { status: "blocked_no_transport", reason: "sender_mismatch" });
    const sent = [];
    const ok = await transport.sendMail(msg, { sendMail: async m => { sent.push(m); return { messageId: "<id-1@test>" }; } });
    assert.deepEqual(ok, { status: "sent", provider: "test", messageId: "<id-1@test>" });
    assert.equal(sent.length, 1);
    const fail = await transport.sendMail(msg, { sendMail: async () => { const e = new Error("535 bad credentials for secret-user"); e.code = "EAUTH"; e.responseCode = 535; throw e; } });
    assert.equal(fail.status, "failed");
    assert.ok(!fail.error.includes("secret-user"), "provider messages are reduced to codes");
    // Header injection in subject/name is neutralised.
    let subject = "";
    await transport.sendMail({ ...msg, subject: "Hola\r\nBcc: x@evil.test" }, { sendMail: async m => { subject = m.subject; return { messageId: "<2>" }; } });
    assert.ok(!/[\r\n]/.test(subject));
  } finally { process.env = saved; }
});

test("agent invitations live in AGENT PORTAL, not in Configuración", () => {
  const settings = fs.readFileSync("src/app/admin/settings/communications/page.tsx", "utf8");
  const settingsAction = fs.readFileSync("src/app/admin/settings/communications/actions.ts", "utf8");
  const panel = fs.readFileSync("src/components/agents/invitation-panel.tsx", "utf8");
  const inviteAction = fs.readFileSync("src/components/agents/invite-actions.ts", "utf8");
  const portal = load("src/lib/agents/portal.ts");
  assert.equal(portal.AGENT_PORTAL_PATH, "/admin/staff", "one Agent Portal: the Staff portal route, not a second agent area");
  assert.deepEqual(portal.AGENT_PORTAL_LABEL, ["AGENT PORTAL", "AGENT PORTAL"]);
  for (const forbidden of ["invite_sender", "renderAgentInvite", "data-preview=\"invite\""]) {
    assert.ok(!settings.includes(forbidden), `Configuración must not contain ${forbidden}`);
    assert.ok(!settingsAction.includes(forbidden), `settings action must not write ${forbidden}`);
  }
  assert.match(settings, /AGENT_PORTAL_LABEL/);
  assert.match(panel, /signerForUser\(supabase, userId, lang\)/, "signature comes from the authenticated owner");
  assert.match(panel, /renderAgentInvite/);
  assert.match(inviteAction, /ownerForAction\(\)/);
  assert.match(inviteAction, /status === "verified" && evidence\.length < 10/, "«verified» needs evidence");
  assert.doesNotMatch(inviteAction, /support_|client_sender|reply_to/, "invite action only writes invitation columns");
});

test("lifecycle e-mails: only recorded facts, owner note required where needed, ES/EN, support channels from settings", () => {
  const rep = { name: "Samuel Muñoz", title: "Cofundador" };
  const base = { lang: "es", contactName: "Laura", companyName: "Café QA", product: "Sitio Café QA", representative: rep, company, stageLabel: "Construcción",
    progress: { done: 4, total: 9 }, nextStep: "Revisión con el cliente", note: "", liveUrl: null, deliveredOn: null };
  assert.equal(email.LIFECYCLE_KINDS.length, 12, "EM-001 onboarding events added in AVL-COMMS-FINAL-001");
  const conf = email.renderLifecycle({ ...base, kind: "onboarding_confirmation" });
  assert.match(conf.subject, /Confirmamos el inicio de Sitio Café QA/);
  assert.match(conf.text, /Etapa actual: Construcción\./);
  assert.equal(email.renderLifecycle({ ...base, kind: "progress_update" }), null, "no auto-written progress");
  const prog = email.renderLifecycle({ ...base, kind: "progress_update", note: "Terminamos la página de menú <b>hoy</b>." });
  assert.match(prog.text, /4 de 9 puntos/);
  assert.ok(!prog.html.includes("<b>hoy</b>"), "owner note is escaped");
  assert.equal(email.renderLifecycle({ ...base, kind: "delivery_notice" }), null, "no delivery notice without a recorded delivery");
  assert.equal(email.renderLifecycle({ ...base, kind: "delivery_notice", deliveredOn: "2026-11-24", liveUrl: "javascript:alert(1)" }), null);
  const del = email.renderLifecycle({ ...base, lang: "en", kind: "delivery_notice", deliveredOn: "2026-11-24", liveUrl: "https://cafe.example" });
  assert.match(del.subject, /delivered/);
  assert.match(del.text, /reply to this e-mail to confirm receipt/);
  const sup = email.renderLifecycle({ ...base, kind: "support_info" });
  assert.match(sup.text, /avalonacoreagency@gmail\.com/);
  assert.ok(!/Teléfono/.test(sup.text), "no phone without an approved number");
  assert.equal(email.renderLifecycle({ ...base, kind: "renewal_review" }), null);
  const ren = email.renderLifecycle({ ...base, kind: "renewal_review", note: "Proponemos renovar el mantenimiento 12 meses." });
  assert.match(ren.text, /Nada se renueva ni se cobra automáticamente/);
  for (const r of [conf, prog, del, sup, ren]) { assert.match(r.html, /Samuel Muñoz/); assert.match(r.html, /avalon-mark\.png/); }
});

test("Contract Studio SOW: payment model, client responsibilities and cancellation terms are optional, validated and rendered", () => {
  const data = { agencyLegalForm: "joint_individuals", agencyName: "Ana QA and Luis QA", agencyBrand: "Avalon Core Agency", agencyAddress: "1 Example", agencyEmail: "a@example.test",
    clientName: "Cliente QA", clientAddress: "2 Example", clientEmail: "c@example.test", county: "Broward", effectiveDate: "2026-11-24", services: ["Website"], scope: "Scope",
    exclusions: "", deliverables: "Site", milestones: "M", acceptance: "A", revisions: "2", term: "3 months", setupFee: "100.00", monthlyFee: "0.00", paymentSchedule: "Net 15", adSpend: "None", commission: "None", specialTerms: "" };
  assert.deepEqual(agreement.validateAgreement(data), [], "old drafts without the new fields stay valid");
  assert.ok(agreement.validateAgreement({ ...data, paymentModel: "crypto" }).includes("paymentModel"));
  assert.ok(agreement.validateAgreement({ ...data, paymentModel: "commission" }).includes("commission"), "commission model needs approved commission terms");
  const full = { ...data, paymentModel: "hybrid", clientResponsibilities: "Logo y textos antes del día 5.", cancellationTerms: "Aviso de 30 días; depósito no reembolsable una vez iniciado el diseño." };
  assert.deepEqual(agreement.validateAgreement(full), []);
  const lines = agreement.agreementLines(agreement.makeAgreementSnapshot(full), "abcd1234");
  const text = lines.map(l => l.heading + ": " + l.text).join("\n");
  assert.match(text, /Payment model: Hybrid \(setup \+ recurring\)/);
  assert.match(text, /Client responsibilities and materials: Logo y textos/);
  assert.match(text, /Cancellation, refunds and non-payment \(this SOW\): Aviso de 30 días/);
  const old = agreement.agreementLines(agreement.makeAgreementSnapshot(data), "abcd1234").map(l => l.heading);
  assert.ok(!old.includes("Payment model") && !old.includes("Client responsibilities and materials"), "nothing invented for older drafts");
});

test("document identity: manuals render in the ivory v2 identity; issued v1 manuals keep their exact bytes", () => {
  const input = { lang: "es", clientName: "Laura QA", companyName: "Café QA", productType: "website", productName: "Sitio Café QA", liveUrl: "https://cafe.example",
    version: 1, issuedOn: "2026-11-24", responsible: "Miguel Hobaica", contractRef: "", scope: "S", exclusions: "", support: { email: "avalonagencymh@gmail.com", phone: null, hours: "" }, maintenance: "", warranty: "" };
  const snap = manual.buildManual(input);
  assert.equal(manual.MANUAL_GENERATOR, "avalon-manual-2");
  const v2 = Buffer.from(manual.renderManualPdf(snap)).toString("latin1"), v1 = Buffer.from(manual.renderManualPdf(snap, "avalon-manual-1")).toString("latin1");
  assert.notEqual(v1, v2);
  assert.match(v2, /0\.992 0\.985 0\.973 rg/, "ivory paper");
  assert.ok(!v2.includes("0.035 0.067 0.161 rg"), "no navy cover in v2");
  assert.match(v1, /0\.035 0\.067 0\.161 rg/, "v1 keeps its original cover so stored sha256 still verifies");
  assert.match(v1, /Producer \(Avalon OS avalon-manual-1\)/);
  assert.throws(() => manual.renderManualPdf(snap, "avalon-manual-9"), /manual_generator_unknown/);
});

test("OPS-002/003 wiring: delivery and manuals rely on the verified signature, never on a draft's existence", () => {
  const actions = fs.readFileSync("src/app/admin/workspace/crm/onboarding/actions.ts", "utf8");
  const evidence = fs.readFileSync("src/lib/onboarding/evidence-server.ts", "utf8");
  assert.match(evidence, /eq\("status", "verified_signed"\)/);
  assert.match(evidence, /import "server-only"/, "not a server action endpoint");
  assert.doesNotMatch(actions, /contractLinked/);
  assert.match(actions, /contractVerified: Boolean\(verified\)/);
  assert.match(actions, /manual_contract_not_verified|signedAgreement/);
  assert.match(actions, /to === "closed" && !o.client_accepted_at/);
});

test("document library: department packs integrated verbatim, hashed, and only APPROVED documents are distributable", () => {
  execFileSync(process.execPath, ["scripts/docs/build-library.cjs", "--check"], { stdio: "pipe" });
  const lib = load("src/lib/docs/library.ts");
  const crypto = require("node:crypto");
  assert.equal(lib.ALL_DOCUMENTS.filter(d => d.pack === "sales").length, 10);
  assert.equal(lib.ALL_DOCUMENTS.filter(d => d.pack === "client").length, 12);
  for (const d of lib.ALL_DOCUMENTS) {
    assert.equal(crypto.createHash("sha256").update(fs.readFileSync(d.source, "utf8")).digest("hex"), d.sha256, `${d.id} content is the repository file`);
    assert.equal(d.approval, "pending", `${d.id}: nothing is approved by code`);
  }
  assert.deepEqual(lib.staffDocuments(), [], "no pending document reaches sellers");
  assert.deepEqual(lib.clientDocuments("website"), [], "no pending document reaches clients");
  // Simulated owner approval through the manifest: only that document, only for its audience/service.
  const doc = lib.documentById("OB-WEB-001");
  doc.approval = "approved";
  try {
    assert.deepEqual(lib.clientDocuments("website").map(d => d.id), ["OB-WEB-001"]);
    assert.deepEqual(lib.clientDocuments("ecommerce"), []);
    assert.deepEqual(lib.staffDocuments(), []);
  } finally { doc.approval = "pending"; }
  const page = fs.readFileSync("src/app/admin/workspace/crm/documents/page.tsx", "utf8");
  assert.match(page, /await requireOwner\(\)/, "owner-only library");
});

test("A08 library PDFs: ivory identity, deterministic, pending documents watermarked on every page, owner-only route", () => {
  const lib = load("src/lib/docs/library.ts"), pdf = load("src/lib/docs/library-pdf.ts");
  const doc = lib.ALL_DOCUMENTS[0];
  const a = Buffer.from(pdf.renderLibraryPdf(doc)), b = Buffer.from(pdf.renderLibraryPdf(doc));
  assert.equal(a.subarray(0, 5).toString(), "%PDF-"); assert.ok(a.equals(b), "same version → same bytes");
  const s = a.toString("latin1"), pages = Number(/\/Count (\d+)/.exec(s)[1]);
  assert.ok(pages >= 1); assert.match(s, /avalon-library-1/);
  if (doc.approval !== "approved") {
    assert.equal((s.match(/PENDIENTE DE REVISION \/ PENDING REVIEW/g) || []).length, pages, "footer warning on every page");
    assert.match(s, /NO DISTRIBUIR/); assert.match(pdf.libraryFileName(doc), /-PENDIENTE\.pdf$/);
  }
  const approved = pdf.renderLibraryPdf({ ...doc, approval: "approved" });
  assert.doesNotMatch(Buffer.from(approved).toString("latin1"), /NO DISTRIBUIR/);
  for (const d of lib.ALL_DOCUMENTS) assert.equal(Buffer.from(pdf.renderLibraryPdf(d)).subarray(0, 5).toString(), "%PDF-", d.id);
  const blocks = pdf.parseMarkdown("# T\n\n| a | b |\n|---|---|\n| 1 | 2 |\n- x\n1. y\n\ntext **bold**");
  assert.deepEqual(blocks.map(x => x.kind), ["h1", "li", "li", "li", "li", "p"]); assert.equal(blocks[5].text, "text bold");
  const route = fs.readFileSync("src/app/admin/workspace/crm/documents/[id]/route.ts", "utf8");
  assert.match(route, /getOwnerSession\(\)/); assert.match(route, /status: 401/); assert.match(route, /no-store/);
  assert.match(fs.readFileSync("src/app/admin/workspace/crm/documents/page.tsx", "utf8"), /data-library-pdf/);
});

test("A06 service checklists: website, CRM and marketing collect what delivery actually needs", () => {
  const keys = t => model.checklistFor(t).map(i => i.key);
  for (const k of ["branding", "references", "access", "design_approval"]) assert.ok(keys("website").includes(k), "website " + k);
  for (const k of ["integrations", "migration", "training"]) assert.ok(keys("crm").includes(k), "crm " + k);
  assert.ok(keys("marketing").includes("audience"));
});

test("M07 onboarding e-mails: EM-001 events, recorded facts or owner note only, service checklist, corporate mailbox, ES/EN", () => {
  const rep = { name: "Miguel Hobaica", title: "Cofundador" };
  const base = { lang: "es", contactName: "Laura", companyName: "Café QA", product: "Sitio web Café QA", representative: rep, company: email.DEFAULT_COMPANY,
    stageLabel: "Preparación", progress: { done: 2, total: 9 }, nextStep: null, note: "", liveUrl: null, deliveredOn: null };
  for (const kind of ["information_request", "review_request", "approval_request", "receipt_confirmation", "maintenance_notice"])
    assert.equal(email.renderLifecycle({ ...base, kind }), null, kind + " needs the owner's note");
  assert.equal(email.renderLifecycle({ ...base, kind: "materials_request" }), null, "no pending items and no note → nothing to request");
  assert.equal(email.renderLifecycle({ ...base, kind: "kickoff_confirmation" }), null, "no next step and no note → no kickoff claim");
  const mats = email.renderLifecycle({ ...base, kind: "materials_request", pending: ["Logo en alta resolución", "Textos de la página de inicio"] });
  assert.match(mats.text, /• Logo en alta resolución/); assert.match(mats.text, /No envíes contraseñas/); assert.match(mats.subject, /Materiales necesarios/);
  const approval = email.renderLifecycle({ ...base, kind: "approval_request", lang: "en", note: "Homepage design v2 (link in the project portal)." });
  assert.match(approval.subject, /Approval requested/); assert.match(approval.text, /Silence is never taken as approval/);
  for (const r of [mats, approval]) {
    assert.match(r.html, /avalonacoreagency@gmail\.com/); assert.ok(!/avalonagencymh/.test(r.html + r.text), "corporate mailbox only");
    assert.match(r.html, /brand\/email\/avalon-mark\.png/); assert.match(r.text, /Miguel Hobaica/);
  }
  assert.equal(email.LIFECYCLE_KINDS.length, 12);
  assert.equal(email.DEFAULT_COMPANY.clientSender, "avalonacoreagency@gmail.com");
  const invite = fs.readFileSync("supabase/templates/invite.html", "utf8");
  assert.ok(!/avalonagencymh/.test(invite), "invitation template shows the corporate mailbox only");
  assert.match(invite, /\{\{ \.ConfirmationURL \}\}/); assert.match(invite, /\{\{ \.Data\.inviter_name \}\}/);
  const center = fs.readFileSync("src/app/admin/workspace/crm/communications/page.tsx", "utf8");
  assert.match(center, /requireOwner\(\)/); assert.ok(!/sendMail|approveAndSend/.test(center), "the Communication Center never sends by itself");
});

test("G04 Welcome Package: canonical data only, verified agreement by reference, approved documents only, deterministic, hashed", () => {
  const wp = load("src/lib/docs/welcome-package.ts");
  const base = { lang: "es", version: 1, issuedOn: "2026-11-25", client: { contactName: "Laura QA", companyName: "Barbería Sintética QA" },
    service: { label: "Sitio web", title: "Sitio web Barbería QA" }, representative: { name: "Miguel Hobaica", title: "Cofundador" },
    contract: { verified: false, ref: "ACA-MSA-1.2 · deadbeef" }, invoice: null, nextStep: null,
    checklist: { pending: ["Logo en alta resolución", "Accesos delegados al dominio"], done: 3, total: 14 },
    support: { email: "avalonacoreagency@gmail.com", phone: null, hours: "" }, documents: [] };
  const w = wp.buildWelcomePackage(base);
  assert.equal(w.contract.ref, "", "an unverified agreement never shows a reference");
  let md = wp.welcomeMarkdown(w);
  assert.match(md, /no sustituye, resume ni modifica sus condiciones/); assert.ok(!/ACA-MSA/.test(md));
  assert.match(md, /- Logo en alta resolución/); assert.match(md, /3 de 14 puntos/);
  assert.ok(!/Teléfono/.test(md), "no phone without an approved number"); assert.ok(!/Factura emitida/.test(md), "no invoice section without an issued invoice");
  assert.match(md, /se compartirán cuando estén aprobados/, "no pending documents listed");
  const signed = wp.buildWelcomePackage({ ...base, lang: "en", contract: { verified: true, ref: "ACA-MSA-1.1 · 1234abcd" }, invoice: { number: "INV-QA-0001" },
    nextStep: { text: "Kickoff call", confirmedOn: "2026-12-01" }, documents: [{ id: "WP-001", title: "Welcome" }] });
  md = wp.welcomeMarkdown(signed);
  assert.match(md, /Signed and verified agreement: ACA-MSA-1\.1 · 1234abcd/); assert.match(md, /Issued invoice: INV-QA-0001/);
  assert.match(md, /Kickoff call \(confirmed for 2026-12-01\)/); assert.match(md, /- WP-001 · Welcome/);
  const a = Buffer.from(wp.renderWelcomePackagePdf(signed)), b = Buffer.from(wp.renderWelcomePackagePdf(signed));
  assert.equal(a.subarray(0, 5).toString(), "%PDF-"); assert.ok(a.equals(b), "same snapshot → same bytes (sha256 stays valid)");
  assert.ok(!/PENDIENTE|NO DISTRIBUIR/.test(a.toString("latin1")), "a client document carries no internal review stamp");
  assert.ok(wp.isWelcomeSnapshot(signed)); assert.ok(!wp.isWelcomeSnapshot({ schema: "avalon-manual-1" }));
  assert.match(wp.welcomeFileName(signed), /^Avalon-Welcome-Barberia-Sintetica-QA-v1\.pdf$/);
  const actions = fs.readFileSync("src/app/admin/workspace/crm/onboarding/actions.ts", "utf8");
  const gen = actions.slice(actions.indexOf("export async function generateWelcomePackage"), actions.indexOf("// ── E-mail outbox"));
  assert.match(gen, /clientDocuments\(o\.product_type, L\)/, "only library documents the owners approved");
  assert.match(gen, /signedAgreement\(supabase, o\.client_id\)/); assert.match(gen, /invoice\.status === "issued" && invoice\.client_id === o\.client_id/);
  assert.match(gen, /kind: "welcome_package"/); assert.match(gen, /sha256: sha\(pdf\)/);
  const page = fs.readFileSync("src/app/admin/workspace/crm/onboarding/[id]/page.tsx", "utf8");
  assert.match(page, /manualIssued: docRows\.some\(d => d\.kind === "manual" && d\.status === "issued"\)/, "a welcome package never satisfies the manual gate");
});

test("G03 library: search and filters, owners' review pack with the approval matrix, matrix file in sync", () => {
  const lib = load("src/lib/docs/library.ts");
  const all = lib.ALL_DOCUMENTS;
  assert.equal(lib.filterLibrary(all, {}).length, all.length);
  assert.ok(lib.filterLibrary(all, { audience: "staff" }).every(d => d.audience === "staff"));
  assert.ok(lib.filterLibrary(all, { approval: "approved" }).every(d => d.approval === "approved"));
  assert.ok(lib.filterLibrary(all, { service: "crm" }).every(d => d.service === "crm" || d.service === "all"));
  assert.ok(lib.filterLibrary(all, { q: "bienvenida" }).some(d => d.id === "WP-001"), "accent-insensitive text search");
  const pack = lib.reviewPackMarkdown(all);
  for (const d of all) { assert.match(pack, new RegExp(`\\| ${d.id} \\|`)); assert.match(pack, new RegExp(`- ${d.id}: \\[ \\] Aprobar \\(Miguel\\)`)); }
  assert.match(pack, /este paquete no aprueba nada por sí mismo/);
  const route = fs.readFileSync("src/app/admin/workspace/crm/documents/review-pack/route.ts", "utf8");
  assert.match(route, /getOwnerSession\(\)/); assert.match(route, /status: 401/); assert.match(route, /no-store/); assert.match(route, /NO DISTRIBUIR/);
  const matrix = fs.readFileSync("docs/library/APPROVAL_MATRIX.md", "utf8");
  assert.equal((matrix.match(/^\| (AG|WP|OB|MN|EM|DEL)-/gm) || []).length, all.length);
  execFileSync(process.execPath, ["scripts/docs/build-library.cjs", "--check"], { stdio: "pipe" });
});
