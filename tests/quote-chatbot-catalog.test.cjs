const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

function load() {
  const src = fs.readFileSync("src/lib/quotes/chatbot-catalog.ts", "utf8");
  const code = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", code)(exports);
  return exports;
}
const { hasChatbotCatalogEntry, proposedChatbotLine } = load();

test("chatbot can be proposed when missing from active catalog, without fabricated SKU or price", () => {
  assert.equal(hasChatbotCatalogEntry([{ code: "website", name: "Website" }]), false);
  for (const language of ["es", "en"]) {
    const line = proposedChatbotLine(language);
    assert.equal(line.code, null);
    assert.equal(line.unitPrice, "");
    assert.equal(line.kind, "one_time");
    assert.equal(line.qty, 1);
    assert.match(line.description, /(?:propuesta|proposal)/i);
  }
});
test("no duplicate fallback when an active chatbot catalog entry already exists", () => {
  assert.equal(hasChatbotCatalogEntry([{ code: "ai-chatbots", name: "Asistente web" }]), true);
  assert.equal(hasChatbotCatalogEntry([{ code: "bot-01", name: "AI Chatbots" }]), true);
  assert.equal(hasChatbotCatalogEntry([{ code: "chatbot", name: "Chatbot web" }]), true);
});
