const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = p => fs.readFileSync(p, "utf8");

test("client contracts are owner-scoped and not publicly accessible", () => {
  const page=read("src/app/admin/workspace/crm/clients/[id]/contracts/page.tsx");
  const route=read("src/app/admin/workspace/crm/clients/[id]/contracts/[agreementId]/route.ts");
  const action=read("src/app/admin/workspace/crm/clients/[id]/contracts/actions.ts");
  assert.match(page,/requireOwner\(/);
  assert.match(route,/getOwnerSession\(/);
  assert.match(route,/\.eq\("client_id",id\)/);
  assert.match(action,/ownerForAction\(/);
  assert.match(action,/\.eq\("id", clientId\)/);
  assert.match(route,/no-store/);
});
test("contracts remain drafts and cannot be mistaken for signatures", () => {
  const src=read("src/lib/contracts/agreement.ts");
  const migration=read("supabase/migrations/20261114160000_crm_client_agreement_drafts.sql");
  const page=read("src/app/admin/workspace/crm/clients/[id]/contracts/page.tsx");
  assert.match(src,/NOT SIGNED/);
  assert.match(migration,/check \(status = 'draft'\)/);
  assert.match(migration,/grant select, insert/);
  assert.doesNotMatch(migration,/grant\s+(?:update|delete)/i);
  assert.match(page,/DRAFT|BORRADOR/);
});
test("download generates PDF from persisted snapshot and not browser content", () => {
  const route=read("src/app/admin/workspace/crm/clients/[id]/contracts/[agreementId]/route.ts");
  const action=read("src/app/admin/workspace/crm/clients/[id]/contracts/actions.ts");
  assert.match(route,/data\.snapshot/);
  assert.match(route,/application\/pdf/);
  assert.match(route,/snapshot_sha256/);
  assert.match(route,/canonicalSnapshot/);
  assert.match(action,/createHash\("sha256"\)/);
  assert.match(action,/validateAgreement\(input\)/);
});
test("sensitive agreement details are stored only in the database, not URL", () => {
  const action=read("src/app/admin/workspace/crm/clients/[id]/contracts/actions.ts");
  assert.match(action,/makeAgreementSnapshot\(input\)/);
  assert.match(action,/snapshot,snapshot_sha256:digest/);
  assert.doesNotMatch(action,/JSON\.stringify\(input\).*back\(/);
});
