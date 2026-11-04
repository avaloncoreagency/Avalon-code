const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("Higgsfield bridge is discoverable from the private Marketing Hub", () => {
  const marketing = fs.readFileSync("src/app/admin/workspace/marketing-hub/page.tsx", "utf8");
  const bridge = fs.readFileSync("src/app/admin/creative-bridge/page.tsx", "utf8");
  assert.match(marketing, /href="\/admin\/creative-bridge"/);
  assert.match(marketing, /No se generan contenidos ni se consumen créditos/);
  assert.match(marketing, /requireOwner\(\)/);
  assert.match(bridge, /requireOwner\(\)/);
  assert.match(bridge, /CreativeControls/);
  assert.doesNotMatch(marketing, /generate_image|generate_video|service_role/);
});
