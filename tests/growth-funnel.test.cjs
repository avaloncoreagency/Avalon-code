const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

const source = fs.readFileSync("src/lib/growth/funnel.ts", "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function("module", "exports", output)(loaded, loaded.exports);
const { FUNNEL_TEMPLATES, validSlug, publicFunnel, isFunnelTemplate } = loaded.exports;

test("growth funnel: three independent templates never claim payments or booked appointments", () => {
  assert.deepEqual(Object.keys(FUNNEL_TEMPLATES).sort(), ["appointments", "capture", "sales"]);
  assert.ok(Object.values(FUNNEL_TEMPLATES).every(t => t.cta && t.title && t.subheading));
  assert.equal(isFunnelTemplate("sales"), true);
  assert.equal(isFunnelTemplate("payments"), false);
  assert.ok(FUNNEL_TEMPLATES.appointments.subheading.includes("No reservamos"));
  assert.ok(FUNNEL_TEMPLATES.sales.subheading.includes("no es una compra"));
});

test("growth funnel: public display strictly validates contract and rejects unsafe slugs", () => {
  assert.equal(validSlug("capture-demo-001"), true);
  for (const slug of ["bad/path", "CamelCase", "../admin", "x", "", "has spaces", "a".repeat(61)])
    assert.equal(validSlug(slug), false, slug);
  const data = {
    slug: "capture-demo-001", title: "Synthetic landing", subheading: "Public copy",
    cta: "Request quote", template: "capture",
  };
  assert.deepEqual(publicFunnel({ ...data, owner_id: "private-uuid" }), data,
    "private identifiers must not be forwarded to the public page");
  assert.equal(publicFunnel({ ...data, slug: "../../admin" }), null);
  assert.equal(publicFunnel({ ...data, template: "fake" }), null);
  assert.equal(publicFunnel({ ...data, title: "" }), null);
});

test("growth funnel: admin page and public intake are separated, no bypass or paid integrations", () => {
  const owner = fs.readFileSync("src/app/admin/workspace/marketing-hub/funnels/page.tsx", "utf8");
  const controls = fs.readFileSync("src/app/admin/workspace/marketing-hub/funnels/actions.ts", "utf8");
  const publicPage = fs.readFileSync("src/app/f/[slug]/page.tsx", "utf8");
  const publicAction = fs.readFileSync("src/app/f/[slug]/actions.ts", "utf8");
  const publicForm = fs.readFileSync("src/app/f/[slug]/form.tsx", "utf8");
  const marketing = fs.readFileSync("src/app/admin/workspace/marketing-hub/growth/page.tsx", "utf8");
  const communications = fs.readFileSync("src/app/admin/workspace/ai-communications/page.tsx", "utf8");
  assert.match(owner, /await requireOwner\(\)/);
  assert.match(controls, /await requireOwner\(\)/);
  assert.match(publicPage, /crm_growth_funnel_view/);
  assert.match(publicPage, /notFound\(\)/);
  assert.match(publicAction, /crm_growth_funnel_submit/);
  assert.match(publicAction, /authLimiter\.hit/);
  assert.match(publicForm, /name="consent"/);
  assert.match(publicForm, /name="website_url"/);
  assert.match(marketing, /ads.*no.*conectad|Sin conexión externa/i);
  assert.match(communications, /AI Receptionist/);
  for (const text of [publicPage, publicAction, publicForm, controls, marketing]) {
    assert.doesNotMatch(text, /service_role|GROQ_API_KEY|META_ACCESS_TOKEN|GITHUB_TOKEN|publish_ad\(|create_payment\(/);
  }
});

test("growth funnel: SQL privileges are narrow and isolated; no anonymous table reads", () => {
  const sql = fs.readFileSync("docs/sql/growth-funnel-prototype.sql", "utf8");
  assert.match(sql, /alter table public\.crm_growth_funnels enable row level security/i);
  assert.match(sql, /alter table public\.crm_growth_funnel_submissions enable row level security/i);
  assert.match(sql, /from anon, authenticated/);
  assert.match(sql, /grant execute on function public\.crm_growth_funnel_submit\(jsonb\) to anon, authenticated/i);
  assert.match(sql, /if request->'consent' is distinct from 'true'::jsonb/);
  assert.match(sql, /unique\(funnel_id,email_hash\)/);
  assert.match(sql, /select id into v_lead from public\.crm_leads/i);
  assert.match(sql, /set_config\('request\.jwt\.claim\.sub'/);
  assert.doesNotMatch(sql, /grant insert on public\.crm_leads to anon/i);
  assert.doesNotMatch(sql, /insert into public\.crm_sales|insert into public\.crm_events/i);
});
