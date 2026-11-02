// Navigation integrity: the HUD always opens the real CRM and its modules; no ghost placeholders.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const src = walk('src').filter(f => /\.(ts|tsx)$/.test(f));
const read = f => fs.readFileSync(f, 'utf8');

test('no screen presents the CRM as "in development by Samuel" or points at PR #6', () => {
  for (const file of src) {
    const body = read(file);
    assert.doesNotMatch(body, /desarrollo por Samuel|development by Samuel|En desarrollo · Samuel|CRM \(Samuel\)/i, file);
    assert.doesNotMatch(body, /PR #6|20261102040501_crm_core/, file);
  }
});

test('the CRM has a real static route and the dynamic module segment never renders a placeholder', () => {
  assert.ok(fs.existsSync('src/app/admin/workspace/crm/page.tsx'), 'static CRM route');
  const crm = read('src/app/admin/workspace/crm/page.tsx');
  assert.match(crm, /<CrmOverview\s*\/>/);
  assert.match(crm, /requireOwner\(\)/);
  const dynamic = read('src/app/admin/workspace/[module]/page.tsx');
  assert.doesNotMatch(dynamic, /<Empty|<Panel|en desarrollo/i, 'fallback only redirects or 404s');
  assert.match(dynamic, /requireOwner\(\)/);
  assert.match(dynamic, /redirect\(item\.href\)/);
  assert.match(dynamic, /notFound\(\)/);
});

test('every HUD module card points at an existing static route', () => {
  const modules = read('src/components/suite/modules.ts');
  const hrefs = [...modules.matchAll(/href: "([^"]+)"/g)].map(m => m[1]);
  assert.equal(hrefs.length, 6);
  for (const href of hrefs) assert.ok(fs.existsSync(path.join('src/app', href, 'page.tsx')), `${href} has a page`);
  assert.doesNotMatch(read('src/components/suite/module-cards.tsx'), /Samuel|external/);
});

test('CRM primary order and secondary access exist as real pages', () => {
  const domain = read('src/lib/crm/domain.ts');
  const nav = domain.slice(domain.indexOf('export const crmNavigation'));
  const order = ['hunter', 'leads', 'sales', 'calendar', 'tasks'].map(slug => nav.indexOf(`slug: "${slug}"`));
  assert.ok(order.every((x, i) => x >= 0 && (i === 0 || x > order[i - 1])), 'Lead Hunter → Leads Pipeline → Ventas → Calendario → Tareas');
  for (const p of ['sales', 'sales/new', 'clients', 'notifications', 'activity', 'settings', 'calendar', 'tasks']) {
    const file = `src/app/admin/workspace/crm/${p}/page.tsx`;
    assert.ok(fs.existsSync(file), file);
    assert.match(read(file), /requireOwner\(\)/, `${file} verifies the owner server-side`);
  }
  const ui = read('src/components/sales/ui.tsx');
  for (const href of ['/crm/clients', '/crm/notifications', '/crm/activity', '/crm/settings']) assert.ok(ui.includes(`/admin/workspace${href}`), href);
});

test('dashboard and settings report CRM state from real tables, not owner names', () => {
  const dash = read('src/app/admin/dashboard/page.tsx');
  assert.match(dash, /crm_sales_metrics/);
  assert.match(dash, /href="\/admin\/workspace\/crm\/sales\/new"/);
  assert.doesNotMatch(dash, /Google OAuth/);
  const settings = read('src/app/admin/settings/page.tsx');
  for (const m of ['20261102085430_crm_core.sql', '20261102170000_avalon_sales_core.sql', '20261102180000_crm_pipeline_13.sql']) assert.ok(settings.includes(m), m);
});
