const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = (file) => fs.readFileSync(file, "utf8");

test("Avalon OS presents the existing Codex-backed tools with current names", () => {
  const modules = source("src/components/suite/modules.ts");
  const dashboard = source("src/app/admin/dashboard/page.tsx");
  const suite = source("src/components/suite/suite.tsx");

  assert.match(modules, /name: "Website Designer"/);
  assert.doesNotMatch(modules, /name: "Website Hunter"/);
  for (const path of [
    "/admin/workspace/crm/hunter",
    "/admin/workspace/crm/leads",
    "/admin/dev-bridge",
    "/admin/security",
  ]) {
    assert.ok(dashboard.includes(`href="${path}"`), `Missing quick access: ${path}`);
  }
  assert.ok(suite.includes('href="/admin/dev-bridge"'), "Dev Bridge stays in the owner sidebar");
});

test("Dev Bridge defaults to the actual deployed main branch", () => {
  const code = source("src/lib/dev-bridge/core.ts");
  const occurrences = code.match(/process\.env\.BRIDGE_CODE_REF\?\?'main'/g) ?? [];
  assert.equal(occurrences.length, 2, "GitHub commits and tree must share main default");
  assert.doesNotMatch(code, /BRIDGE_CODE_REF\?\?'feature\/avalon-dev-bridge'/);
});
