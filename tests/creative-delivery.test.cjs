const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("Avalon shell has a visible code-level motion implementation, not just a design prompt", () => {
  const css = fs.readFileSync("src/components/suite/suite.module.css", "utf8");
  const chrome = fs.readFileSync("src/components/suite/chrome.tsx", "utf8");
  assert.match(chrome, /<header className=\{s\.topbar\}>/);
  assert.match(css, /\.topbar::after\s*\{/);
  assert.match(css, /@keyframes avalon-signal\b/);
  assert.match(css, /\.navItem\[aria-current="page"\]::after\s*\{/);
  assert.match(css, /@keyframes avalon-status-pulse\b/);
  assert.match(css, /\.moduleCard:hover::before/);
  assert.match(css, /pointer-events:\s*none/);
});
test("Avalon motion explicitly respects reduced-motion and creative work has an acceptance gate", () => {
  const css = fs.readFileSync("src/components/suite/suite.module.css", "utf8");
  const instructions = fs.readFileSync("AGENTS.md", "utf8");
  const contract = fs.readFileSync("docs/HIGGSFIELD_TO_AVALON.md", "utf8");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.topbar::after[\s\S]*?animation:\s*none/);
  assert.match(instructions, /Higgsfield -> Avalon delivery gate/);
  assert.match(contract, /VISUALLY VERIFIED/);
  assert.match(contract, /exact same SHA/);
  assert.match(contract, /No Higgsfield asset is claimed/);
});
