const {test}=require("node:test");const assert=require("node:assert/strict");const fs=require("node:fs");
const page=fs.readFileSync("src/app/admin/workspace/marketing-hub/commercial/overview/page.tsx","utf8");
test("owner overview reads existing canonical finance and CRM, with exact count",()=>{
 assert.match(page,/await requireOwner\(\)/);
 assert.match(page,/crm_sales_metrics/);
 assert.match(page,/countRows\(supabase,"crm_leads"/);
 assert.match(page,/agency_b2b/);
 assert.match(page,/crm_growth_funnel_submissions/);
 assert.match(page,/unavailable data or no USD row/);
});
test("owner overview cannot mutate payments, leads or jobs",()=>{
 assert.doesNotMatch(page,/\.insert\(|\.update\(|\.delete\(|service_role|fetch\(/);
 assert.match(page,/N\/D/);
});
