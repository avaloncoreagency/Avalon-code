const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const src = fs.readFileSync("src/lib/crm/inquiry-presentation.ts", "utf8");
const compiled = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleExports = {};
new Function("exports", compiled)(moduleExports);
const { presentInquiry } = moduleExports;

test("lead need appears before optional interests, without dropping original message", () => {
  const stored = "Interés adicional: Chatbots IA, Embudo de ventas\nQuiero responder consultas desde mi página y obtener citas.";
  const preview = presentInquiry(stored, ["website"], "es");
  assert.equal(preview.text, "Quiero responder consultas desde mi página y obtener citas.");
  assert.deepEqual(Array.from(preview.services), ["Desarrollo web", "Chatbot con IA", "Embudo de ventas"]);
  assert.match(stored, /^Interés adicional/);
});
test("English view normalizes stored Spanish aliases and deduplicates service interests", () => {
  const preview = presentInquiry("Additional interest: AI chatbots, Sales funnels\nHelp me book customers.", ["chatbots", "crm"], "en");
  assert.equal(preview.text, "Help me book customers.");
  assert.deepEqual(Array.from(preview.services), ["AI chatbot", "CRM", "Sales funnel"]);
});
test("historical message without prefix remains intact and empty selection stays honest", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(presentInquiry("I need a booking page.", [], "en"))), {
    text: "I need a booking page.", services: [],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(presentInquiry(null, [], "es"))), { text: "", services: [] });
});

test("legacy SQL opportunity header does not hide the customer's actual need", () => {
  const original = "Solicitud web (es) · servicios: website, crm\nInterés adicional: Chatbots IA\nQuiero un chatbot para atender consultas sin perder clientes.";
  const view = presentInquiry(original, ["website"], "es");
  assert.equal(view.text, "Quiero un chatbot para atender consultas sin perder clientes.");
  assert.deepEqual(Array.from(view.services), ["Desarrollo web", "CRM", "Chatbot con IA"]);
});
test("legacy SQL opportunity without services still extracts the original request", () => {
  const view = presentInquiry("Solicitud web (en)\nI need a booking calendar.", [], "en");
  assert.equal(view.text, "I need a booking calendar.");
  assert.deepEqual(Array.from(view.services), []);
});
