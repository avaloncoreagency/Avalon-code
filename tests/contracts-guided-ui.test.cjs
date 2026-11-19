const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const page = fs.readFileSync("src/app/admin/workspace/crm/clients/[id]/contracts/page.tsx", "utf8");
const review = fs.readFileSync("src/app/admin/workspace/crm/clients/[id]/contracts/review-before-download.tsx", "utf8");

test("contract creation uses a guided four-part workflow without replacing the real PDF generator", () => {
  for (const step of ["contract-identity", "contract-services", "contract-terms", "contract-finish"]) {
    assert.match(page, new RegExp('id="' + step + '"'));
  }
  assert.match(page, /createClientAgreement/);
  assert.match(page, /contracts\/"\+selectedAgreement\.id\+"\?view=inline"/);
  assert.match(page, /ReviewBeforeDownload/);
  assert.match(page, /AGREEMENT_VERSION/);
});

test("PDF review acknowledgement is not a signature or silent download", () => {
  assert.match(review, /useState\(false\)/);
  assert.match(review, /reviewed \? \(/);
  assert.match(review, /type="button" disabled/);
  assert.match(review, /legal approval or a signature/);
});
