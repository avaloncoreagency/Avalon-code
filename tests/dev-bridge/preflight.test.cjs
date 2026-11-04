const {test}=require("node:test");
const assert=require("node:assert/strict");
const {linkedIssues,assess}=require("../../scripts/dev-bridge/pr-preflight.cjs");
const SHA="a".repeat(40);
const pr=()=>({number:96,body:"Implements cooperation. Refs #95.",
  head:{sha:SHA}});
const issue=()=>({number:95,state:"open",labels:[{name:"owner:miguel"},{name:"module:dashboard"}],
  body:"Next action: Samuel verifies isolated tests and writes his own PR."});
test("PR readiness is attributed only to explicit current Issue owner labels",()=>{
 assert.deepEqual(linkedIssues("Refs #95, fixes #95, closes #96"),[95,96]);
 const ready=assess(pr(),[issue()],[{filename:"docs/dev-bridge/COOPERATION.md"}]);
 assert.equal(ready.status,"METADATA_READY");
 assert.equal(ready.owner,"miguel");
 assert.equal(ready.issue,95);
 assert.equal(ready.next_action_recorded,true);
 assert.equal(ready.exact_sha,SHA);
 assert.deepEqual(ready.warnings,[]);
 const ownerMismatch=assess(pr(),[{...issue(),labels:[{name:"owner:miguel"},{name:"owner:samuel"}]}],[]);
 assert.equal(ownerMismatch.owner,null);
 assert.equal(ownerMismatch.status,"NEEDS_HANDOFF");
 assert.ok(ownerMismatch.warnings.includes("missing_or_ambiguous_owner_label"));
});
test("closed/no Issue and multiple linked PR Issue refs cannot masquerade as handoff",()=>{
 const closed=assess(pr(),[{...issue(),state:"closed"}],[]);
 assert.equal(closed.status,"NEEDS_HANDOFF");
 assert.equal(closed.owner,null);
 assert.ok(closed.warnings.includes("issue_unavailable_or_closed"));
 const missing=assess({...pr(),body:"No issue mentioned."},[],[]);
 assert.ok(missing.warnings.includes("missing_linked_issue"));
 const ambiguous=assess({...pr(),body:"Refs #95 and #96"},[issue(),{...issue(),number:96}],[]);
 assert.ok(ambiguous.warnings.includes("multiple_linked_issues"));
 assert.equal(ambiguous.owner,null);
 const noAction=assess(pr(),[{...issue(),body:"No next action yet"}],[]);
 assert.ok(noAction.warnings.includes("missing_next_action"));
});
test("security/shared paths demand review and truncated file lists stay visibly incomplete",()=>{
 const sensitive=assess(pr(),[issue()],[{filename:"supabase/migrations/20261103_test.sql"}]);
 assert.equal(sensitive.shared_surface_review,true);
 assert.equal(sensitive.status,"METADATA_READY");
 assert.ok(sensitive.warnings.includes("shared_surface_review_needed"));
 const incomplete=assess(pr(),[issue()],Array.from({length:100},(_,n)=>({filename:"docs/file"+n})));
 assert.equal(incomplete.status,"NEEDS_HANDOFF");
 assert.ok(incomplete.warnings.includes("file_list_may_be_incomplete"));
 assert.ok(!JSON.stringify(incomplete).includes(issue().body),
   "never print task descriptions or client data into Actions summary");
});
