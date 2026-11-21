const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const src = fs.readFileSync("src/lib/crm/timeline-window.ts", "utf8");
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function("exports", js)(exports);
const { timelineWindow } = exports;
const history = [
  {id:"stage-1",type:"stage"},
  {id:"task-2",type:"activity"},
  {id:"edit-3",type:"edit"},
  {id:"file-4",type:"file"},
  ...Array.from({length:18},(_,i)=>({id:`change-${i}`,type:"stage"})),
];
test("default drawer renders only eight latest events, leaving all audit events intact", () => {
  const before = JSON.stringify(history);
  const view = timelineWindow(history,"all",false);
  assert.equal(view.visible.length,8);
  assert.equal(view.matching,22);
  assert.equal(view.hidden,14);
  assert.equal(view.visible[0].id,"stage-1");
  assert.equal(JSON.stringify(history),before);
});
test("show-all reveals every fetched record without changing ordering or backend limits", () => {
  const view = timelineWindow(history,"all",true);
  assert.deepEqual(view.visible,history);
  assert.equal(view.hidden,0);
});
test("typed filters keep all matching stages, activities, record edits and files", () => {
  for(const type of ["stage","activity","edit","file"]){
    const view=timelineWindow(history,type,true);
    assert.ok(view.visible.every(x=>x.type===type));
    assert.equal(view.matching,history.filter(x=>x.type===type).length);
  }
  assert.equal(timelineWindow([], "all", false).matching,0);
});
