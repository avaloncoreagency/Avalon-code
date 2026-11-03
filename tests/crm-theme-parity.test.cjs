const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = path => fs.readFileSync(path, "utf8");
const base = read("src/app/globals.css");
const crm = read("src/components/crm/crm.module.css");
const sales = read("src/components/sales/sales.module.css");
const calendar = read("src/components/crm/shared-calendar.module.css");
const kanban = read("src/components/crm/lead-board.module.css");
const radar = read("src/components/crm/titan.module.css");
const suite = read("src/components/suite/suite.module.css");

test("shared CRM tokens originate from Avalon OS, not a second independent theme", () => {
  for (const token of ["--crm-hud-bg", "--crm-panel-bg", "--crm-nav-bg", "--crm-active-bg",
    "--crm-cta-bg", "--crm-control-bg", "--crm-control-border", "--crm-border",
    "--crm-radius", "--crm-ink", "--crm-muted"]) {
    assert.ok(base.includes(token + ":"), "global theme token missing: " + token);
  }
  assert.match(base, /--crm-border:\s*var\(--line-strong\)/);
  assert.match(base, /--crm-ink:\s*var\(--text\)/);
});

test("CRM, operations, Titan Radar and calendar use exactly the same surface recipe", () => {
  for (const [name, css] of [["CRM", crm], ["Sales", sales], ["Calendar", calendar], ["Titan", radar]]) {
    assert.ok(css.includes("background:var(--crm-hud-bg)") ||
      css.includes("background: var(--crm-hud-bg)"), name + " must share Avalon HUD background");
    assert.ok(css.includes("var(--crm-border)"), name + " must share Avalon HUD borders");
    assert.ok(css.includes("var(--crm-radius)"), name + " must share Avalon HUD radius");
  }
  assert.ok(sales.includes("background:var(--crm-panel-bg)") || sales.includes("--panel:var(--crm-panel-bg)"));
  assert.ok(crm.includes("background: var(--crm-panel-bg)"));
  assert.ok(calendar.includes("background:var(--crm-panel-bg)"));
  assert.ok(kanban.includes("background: var(--crm-panel-bg)"));
  assert.ok(radar.includes("--panel:var(--crm-panel-bg)"));
});

test("tabs and interactive controls stay aligned without changing CRM state or routes", () => {
  for (const [name, css] of [["CRM", crm], ["Sales", sales], ["Calendar", calendar]]) {
    assert.ok(css.includes("var(--crm-active-bg)"), name + " active tab style missing");
    assert.ok(css.includes("var(--crm-control-bg)"), name + " control style missing");
  }
  assert.match(crm, /\.tab\[aria-current="page"\]/);
  assert.match(sales, /\.subnav a\[aria-current="page"\]/);
  assert.match(calendar, /\.segment/);
  assert.match(suite, /\.navItem\[aria-current="page"\]/);
  assert.match(suite, /\.mobileDock/);
});

test("semantic accents and personal day banners remain independent from the chrome", () => {
  for (const theme of ["blue", "teal", "green", "amber", "rose"]) {
    assert.ok(calendar.includes('.banner[data-theme="' + theme + '"]'));
  }
  assert.ok(calendar.includes("var(--calendar-accent"), "per-event swatch colors stay configurable");
  assert.ok(radar.includes("var(--green)"), "data review success states remain semantic");
  assert.ok(sales.includes('data-tone="warn"') || sales.includes('[data-tone="warn"]'));
});

test("mobile widths and reduced motion retain navigation/accessibility", () => {
  for (const [name, css] of [["CRM", crm], ["Sales", sales], ["Calendar", calendar], ["Kanban", kanban]]) {
    assert.match(css, /@media\s*\(?max-width\s*:/, name + " must have a mobile layout");
  }
  assert.match(suite, /prefers-reduced-motion|mobileDock/);
  assert.match(calendar, /:focus-visible/);
  assert.match(kanban, /:focus-visible/);
});
