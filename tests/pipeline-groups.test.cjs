const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");

function load(file) {
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(require, mod, mod.exports);
  return mod.exports;
}
const g = load("src/lib/crm/pipeline-groups.ts");
const STAGES = ["new", "researched", "contact-pending", "contacted", "replied", "qualified", "meeting", "diagnosed", "proposal", "negotiation", "won", "lost", "nurture"]
  .map((id, position) => ({ id, label: id, kind: id === "won" ? "won" : id === "lost" ? "lost" : "open", position }));

test("the five approved groups cover every seeded stage exactly once, in the approved order", () => {
  assert.deepEqual(g.PIPELINE_GROUPS.map(x => x.label[0]), ["Nuevo", "En conversación", "Propuesta", "Ganado", "Perdido"]);
  const claimed = g.PIPELINE_GROUPS.flatMap(x => x.stages);
  assert.equal(new Set(claimed).size, claimed.length, "no stage in two groups");
  assert.deepEqual([...claimed].sort(), STAGES.map(s => s.id).sort(), "all 13 seeded stages mapped");
  assert.equal(g.groupOfStage("nurture").id, "conversation", "nurture keeps its follow-up inside conversation");
  for (const group of g.PIPELINE_GROUPS) assert.ok(group.stages.includes(group.target), `${group.id} target belongs to the group`);
});

test("grouping keeps detailed stages, page-scoped counts and never drops or auto-wins a custom stage", () => {
  const rows = [
    { id: "1", stage_id: "replied", value: 100 }, { id: "2", stage_id: "contacted", value: "50" },
    { id: "3", stage_id: "negotiation", value: -5 }, { id: "4", stage_id: "vip-custom", value: 999 }, { id: "5", stage_id: null },
  ];
  const { columns, unmapped } = g.groupPipelineFive(rows);
  const conversation = columns.find(c => c.group.id === "conversation");
  assert.deepEqual(conversation.leads.map(r => r.id), ["1", "2"]);
  assert.equal(conversation.estimatedValue, 150);
  assert.equal(columns.find(c => c.group.id === "proposal").estimatedValue, 0, "negative values are not revenue");
  assert.deepEqual(unmapped.map(r => r.id), ["4", "5"], "custom/missing stages stay visible for review");
  assert.equal(columns.find(c => c.group.id === "won").leads.length, 0, "nothing is auto-marked won");
  assert.equal(columns.reduce((n, c) => n + c.leads.length, 0) + unmapped.length, rows.length, "every fetched row appears once");
});

test("moving into a group writes its canonical stage; inside the same group nothing changes", () => {
  assert.equal(g.moveTarget({ stage_id: "replied" }, "conversation", STAGES), null, "Respondió stays Respondió");
  assert.equal(g.moveTarget({ stage_id: "replied" }, "proposal", STAGES), "proposal");
  assert.equal(g.moveTarget({ stage_id: "proposal" }, "won", STAGES), "won", "won still goes through the signed-contract gate server-side");
  assert.equal(g.moveTarget({ stage_id: "proposal" }, "lost", STAGES), "lost", "lost still requires the loss reason");
  assert.equal(g.moveTarget({ stage_id: "vip-custom" }, "new", STAGES), "new", "a reviewed custom stage can be placed in a group");
  assert.equal(g.moveTarget({ stage_id: "new" }, "nope", STAGES), null);
  assert.equal(g.moveTarget({ stage_id: "new" }, "proposal", STAGES.filter(s => s.id !== "proposal")), null, "missing canonical stage is not invented");
});

test("arrows move between open groups only; closed or unmapped cards need an explicit choice", () => {
  assert.equal(g.neighbourGroup({ stage_id: "researched" }, -1), null);
  assert.equal(g.neighbourGroup({ stage_id: "researched" }, 1).id, "conversation");
  assert.equal(g.neighbourGroup({ stage_id: "meeting" }, 1).id, "proposal");
  assert.equal(g.neighbourGroup({ stage_id: "negotiation" }, 1), null, "never advances into Ganado by arrow");
  assert.equal(g.neighbourGroup({ stage_id: "won" }, -1), null);
  assert.equal(g.neighbourGroup({ stage_id: "vip-custom" }, 1), null);
});
