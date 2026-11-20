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

test("Lead cards offer quick stage movement without bypassing closure rules", () => {
  // Approved five groups (#253): arrows move between OPEN groups only; closing stays an explicit choice.
  assert.match(board, /neighbourGroup\(lead, -1\)/);
  assert.match(board, /previousGroup && moveToGroup\(lead, previousGroup\.id\)/);
  assert.match(board, /nextGroup && moveToGroup\(lead, nextGroup\.id\)/);
  assert.match(board, /PIPELINE_GROUPS\.map\(\(option\) =>/);
  assert.match(crm, /target\.kind === "lost"/);
});
