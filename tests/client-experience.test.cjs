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
  assert.match(w.html, /avalonagencymh@gmail\.com/);
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
  assert.deepEqual(model.deliveryBlockers({ checklist: list, qaPassed: false, liveUrl: "http://x", manualIssued: false, contractLinked: false, deliveredTo: "" }).sort(),
    ["checklist_incomplete", "contract_missing", "live_url_missing", "manual_missing", "qa_not_passed", "recipient_missing"]);
  const done = model.checklistFor("other").map(i => ({ ...i, done: true }));
  assert.deepEqual(model.deliveryBlockers({ checklist: done, qaPassed: true, liveUrl: "https://client.example", manualIssued: true, contractLinked: true, deliveredTo: "Laura" }), []);
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
  assert.equal(email.LIFECYCLE_KINDS.length, 5);
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
  assert.match(sup.text, /avalonagencymh@gmail\.com/);
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
