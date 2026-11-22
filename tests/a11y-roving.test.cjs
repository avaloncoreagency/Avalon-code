// FE-STABLE-07 / FE-STABLE-08 regression: ARIA tabs and custom radiogroups use roving tabindex + arrow keys.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = f => fs.readFileSync(f, "utf8");

test("custom role=radio buttons are keyboard operable (FE-STABLE-08)", () => {
  for (const f of ["src/components/public/growth/demos/shop.tsx", "src/components/public/growth/demos/shared.tsx", "src/components/public/growth/demos/calendar.tsx", "src/components/public/growth/tree.tsx"]) {
    const s = read(f);
    const radios = (s.match(/role="radio"/g) || []).length;
    assert.ok(radios > 0, f);
    assert.equal((s.match(/role="radio" aria-checked=\{[^{}]+\} tabIndex=\{\(/g) || []).length, radios, `${f}: every radio has a roving tabIndex`);
    assert.equal((s.match(/role="radiogroup"(?! onKeyDown=\{e => rovingKeyDown\(e, "radio"\)\})/g) || []).length, 0, `${f}: every radiogroup handles arrow keys`);
  }
});

test("ARIA tablists in the CRM drawer and Office handle arrows and roving tabindex (FE-STABLE-07)", () => {
  const drawer = read("src/components/crm/lead-timeline.tsx"), office = read("src/components/office/office.tsx");
  assert.match(drawer, /role="tablist"[^>]*onKeyDown=\{e => rovingKeyDown\(e, "tab"\)\}/);
  assert.match(drawer, /aria-controls="lead-compose-panel"/);
  assert.match(drawer, /id="lead-compose-panel" role="tabpanel" aria-labelledby=/);
  assert.match(office, /role="tablist" aria-label=[^>]*onKeyDown=\{e => rovingKeyDown\(e, "tab"\)\}/);
  assert.match(office, /tabIndex=\{tab === k \? 0 : -1\}/);
  const lib = read("src/components/a11y/roving.ts");
  for (const k of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]) assert.match(lib, new RegExp(k));
});
