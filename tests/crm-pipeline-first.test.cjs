const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const crm = fs.readFileSync("src/components/crm/crm.tsx", "utf8");
const board = fs.readFileSync("src/components/crm/lead-board.tsx", "utf8");

test("Leads displays the pipeline before advanced filters, with create-lead toolbar", () => {
  assert.match(crm, /section === "leads" && !focusedLead/);
  assert.match(crm, /className=\{\x60\$\{s\.actions\} \$\{section === "leads" \? s\.leadToolbar/);
  assert.match(crm, /primaryLeadAction/);
  assert.ok(crm.indexOf("<LeadBoard") < crm.indexOf('id="crm-lead-filters"'), "pipeline precedes advanced filters");
  assert.match(crm, /<details className=\{s\.leadFilters\}/);
});

test("Lead cards are two lines and move by drag or keyboard without bypassing closure rules", () => {
  // Kanban v2: no buttons on cards; Space + arrows is the keyboard alternative; Lost asks for a reason; Won is gated.
  assert.match(board, /<strong title=\{first\}>\{first\}<\/strong>\n\s*\{second && <span title=\{second\}>\{second\}<\/span>\}/);
  assert.doesNotMatch(board, /<button[^>]*>[^<]*(Anterior|Avanzar|Ficha|Más opciones)/);
  assert.match(board, /event\.key === "ArrowRight" \|\| event\.key === "ArrowLeft"/);
  assert.match(board, /code === "won_requires_contract"\) setWonBlocked\(lead\)/);
});
