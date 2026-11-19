// HARU-001: non-destructive contract regression for the canonical 13-stage CRM pipeline.
// Runs against checked-in migrations only; does NOT connect to any Supabase project.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const core = fs.readFileSync("supabase/migrations/20261102085430_crm_core.sql", "utf8");
const extension = fs.readFileSync("supabase/migrations/20261102180000_crm_pipeline_13.sql", "utf8");

const expected = [
  ["new", "Nuevo lead"], ["researched", "Investigado"],
  ["contact-pending", "Contacto pendiente"], ["contacted", "Contactado"],
  ["replied", "Respondió"], ["qualified", "Calificado"],
  ["meeting", "Reunión agendada"], ["diagnosed", "Diagnóstico realizado"],
  ["proposal", "Propuesta enviada"], ["negotiation", "Negociación"],
  ["won", "Ganado"], ["lost", "Perdido"],
  ["nurture", "Nutrición / seguimiento futuro"],
];

function stageMap(sql) {
  const section = sql.match(/from \(values\s*([\s\S]*?)\) as v\(id,label,pos,stale,prob,fu,fu_text\)/i);
  assert.ok(section, "Stage configuration VALUES block must exist");
  const entries = [...section[1].matchAll(/\('([a-z-]+)','([^']+)',(\d+),/g)];
  return entries.map(([, id, label, pos]) => [id, label, Number(pos)]);
}

test("stage catalog is exactly 13, with stable IDs, labels and positions", () => {
  const stages = stageMap(extension);
  assert.equal(stages.length, 13);
  assert.deepEqual(stages, expected.map(([id, label], position) => [id, label, position]));
  assert.equal(new Set(stages.map(([id]) => id)).size, 13);
});

test("original CRM stages are preserved and exactly five additional stage IDs introduced", () => {
  const original = core.match(/insert into public\.crm_stages\(id,label,kind,position\) values\s*([\s\S]*?);/i);
  const inserted = extension.match(/insert into public\.crm_stages\(id, label, kind, position\) values\s*([\s\S]*?);/i);
  assert.ok(original && inserted, "Both migration stage seeds must be present");
  const originalIds = [...original[1].matchAll(/\('([a-z-]+)'\s*,/g)].map(x => x[1]);
  const addedIds = [...inserted[1].matchAll(/\('([a-z-]+)'\s*,/g)].map(x => x[1]);
  assert.equal(originalIds.length, 8);
  assert.deepEqual(addedIds, ["researched", "contact-pending", "replied", "diagnosed", "nurture"]);
  assert.ok(originalIds.every(id => expected.some(([target]) => id === target)));
  assert.equal(new Set([...originalIds, ...addedIds]).size, 13);
});

test("won and lost retain their terminal kinds; nurture remains open", () => {
  assert.match(core, /\('won','Ganado','won',6\)/);
  assert.match(core, /\('lost','Perdido','lost',7\)/);
  assert.match(extension, /\('nurture', 'Nutrición \/ seguimiento futuro', 'open', 104\)/);
});

test("stage migration blocks destructive stage changes and preserves single client model", () => {
  assert.match(extension, /crm_private\.stage_guard/);
  assert.match(extension, /old\.active and not new\.active/);
  assert.match(extension, /crm_private\.lead_stage/);
  assert.match(extension, /public\.crm_clients/);
  assert.doesNotMatch(extension, /\bdrop table\s+(?:if exists\s+)?(?:public\.)?crm_(?:stages|leads|clients)\b/i);
  assert.doesNotMatch(extension, /\bdelete\s+from\s+(?:public\.)?crm_stages\b/i);
});
