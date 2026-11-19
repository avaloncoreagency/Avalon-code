const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path,"utf8");

test("Contract studio previews the same stored agreement before downloading", () => {
  const page=read("src/app/admin/workspace/crm/clients/[id]/contracts/page.tsx");
  const pdf=read("src/app/admin/workspace/crm/clients/[id]/contracts/[agreementId]/route.ts");
  assert.match(page,/selectedAgreement/);
  assert.match(page,/view=inline/);
  assert.match(page,/iframe/);
  assert.match(page,/Descargar PDF revisado/);
  assert.match(pdf,/getOwnerSession\(/);
  assert.match(pdf,/snapshot_sha256/);
  assert.match(pdf,/canonicalSnapshot/);
  assert.match(pdf,/inline/);
  assert.match(pdf,/frame-ancestors 'self'/);
  assert.match(pdf,/attachment/);
  assert.match(pdf,/private, no-store/);
});

test("Commercial agreement defaults come from CRM without forging approval", () => {
  const page=read("src/app/admin/workspace/crm/clients/[id]/contracts/page.tsx");
  assert.match(page,/crm_commercial_terms/);
  assert.match(page,/eq\("kind","agreed"\)/);
  assert.match(page,/commission_approved_by/);
  assert.match(page,/NOT AGREED/);
  assert.match(page,/client\.origin_lead_id/);
  assert.match(page,/crm_contacts/);
});

test("Attribution ledger is separate from rep payouts and locked to finance members", () => {
  const sql=read("supabase/migrations/20261119150000_crm_attributed_conversions.sql");
  const page=read("src/app/admin/workspace/crm/clients/[id]/results/page.tsx");
  const action=read("src/app/admin/workspace/crm/clients/[id]/results/actions.ts");
  assert.match(sql,/create table public\.crm_attributed_conversions/);
  assert.match(sql,/can_view_client_finances\(\)/);
  assert.match(sql,/crm_private\.is_owner\(\)/);
  assert.match(sql,/commission_due numeric\(15,2\) generated always as/);
  assert.match(sql,/unique \(client_id,external_ref\)/);
  assert.match(sql,/status='verified_signed'/);
  assert.match(sql,/terms\.updated_at > signed\.verified_at/);
  assert.match(sql,/group by currency/);
  assert.match(sql,/revoke all on public\.crm_attributed_conversions/);
  assert.doesNotMatch(sql,/grant (?:insert|update|delete) on public\.crm_attributed_conversions to authenticated/i);
  assert.match(action,/ownerForAction\(/);
  assert.match(action,/getCrmCapabilities\(/);
  assert.match(action,/\.eq\("client_id",client\)/);
  assert.match(page,/requireOwner\(/);
  assert.match(page,/financeView/);
  assert.match(page,/commission_base==="gross_revenue"/);
  assert.match(page,/reported_count/);
});
