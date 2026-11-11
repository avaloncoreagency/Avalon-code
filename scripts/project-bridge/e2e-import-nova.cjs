#!/usr/bin/env node
// Import Codex's Nova deliveries into the Avalon library (isolated Supabase) through the REAL owner importer in the
// browser: Nova 1 → v1, Nova 2 → v2 of one "apps" project. Then verify, with the owner's own JWT, that every stored
// file's SHA-256 equals the blob of the exact Git commit that was verified and integrated (provenance end to end).
//   node scripts/project-bridge/e2e-import-nova.cjs <dir with creds.json + env.json> <base-url>
// Only source, tests, docs and the delivery manifests are packed (the library does not store Git bundles).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { chromium, devices } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const { buildZip } = require('../../tests/support/zip-builder.cjs');

const [dir, base] = process.argv.slice(2);
const creds = JSON.parse(fs.readFileSync(path.join(dir, 'creds.json'), 'utf8'));
const env = JSON.parse(fs.readFileSync(path.join(dir, 'env.json'), 'utf8'));
if (/ltbwzcrxeuczdhhtbqgm/.test(env.url)) { console.error('REFUSED: production Supabase project'); process.exit(3); }
const repo = path.resolve(__dirname, '../..');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const steps = [];
const step = (name, ok, detail = {}) => { steps.push({ name, ok: !!ok, ...detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name, JSON.stringify(detail)); };
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);

const DELIVERIES = [
  { id: 'nova1-d948066', commit: 'd948066e47f61036e6cb9e1345a36ea48f081a7d' },
  { id: 'nova2-809da98', commit: '809da980c533f97e7e8d7f852de02d3e876c300c' },
];
function pack(d) {
  const git = (...a) => execFileSync('git', a, { cwd: repo, maxBuffer: 64 << 20 });
  const files = git('diff', '--name-only', `8a0104d09a160558998416f13f642003aa13d6f2..${d.commit}`).toString().trim().split('\n').filter(Boolean);
  const entries = files.map(f => ({ name: f, data: git('show', `${d.commit}:${f}`) }));
  const q = path.join(repo, '.avalon-deliveries', d.id);
  entries.push({ name: 'avalon-delivery/DELIVERY.json', data: fs.readFileSync(path.join(q, 'delivery/DELIVERY.json')) });
  entries.push({ name: 'avalon-delivery/VERIFY_REPORT.json', data: fs.readFileSync(path.join(q, 'VERIFY_REPORT.json')) });
  const zip = buildZip(entries);
  const file = path.join(dir, `${d.id}.zip`);
  fs.writeFileSync(file, zip);
  return { file, expected: Object.fromEntries(files.map(f => [f, sha(git('show', `${d.commit}:${f}`))])) };
}

async function importVia(page, file, { name } = {}) {
  await page.locator('input[name="file"]').setInputFiles(file);
  if (name) { await page.locator('select[name="category"]').selectOption('apps'); await page.locator('input[name="projectName"]').fill(name); }
  await page.locator('select[name="sourceTool"]').selectOption('codex');
  await page.locator('form[aria-busy] button:not([type="button"])').first().click();
  const link = page.locator('a[href^="/admin/workspace/library/"]', { hasText: /Abrir|Open/ }).last();
  await link.waitFor({ timeout: 90000 });
  return { href: await link.getAttribute('href'), text: (await link.locator('..').innerText()).replace(/\s+/g, ' ') };
}

(async () => {
  const packs = DELIVERIES.map(pack);
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  let projectId = null;
  try {
    const page = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
    await page.goto(base + '/admin/login');
    await page.fill('input[name="email"]', creds.owner.email);
    await page.fill('input[name="password"]', creds.owner.password);
    await Promise.all([page.waitForURL(/\/admin\/dashboard/, { timeout: 30000 }), page.locator('button[type="submit"]').first().click()]);

    await page.goto(base + '/admin/workspace/library');
    const v1 = await importVia(page, packs[0].file, { name: `Codex Nova UI ${stamp}` });
    projectId = /library\/([0-9a-f-]{36})/.exec(v1.href)?.[1];
    step('Nova 1 imported through the owner importer as version 1', !!projectId && /1\b/.test(v1.text), { status: v1.text.slice(0, 120) });

    await page.goto(`${base}/admin/workspace/library/${projectId}`);
    const v2 = await importVia(page, packs[1].file);
    step('Nova 2 imported into the same project as version 2', /2\b/.test(v2.text), { status: v2.text.slice(0, 120) });
  } finally { await browser.close(); }

  const db = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
  await db.auth.signInWithPassword({ email: creds.owner.email, password: creds.owner.password });
  const versions = await db.from('os_project_versions').select('id,number').eq('project_id', projectId).order('number');
  step('library holds two immutable versions', versions.data?.length === 2, { numbers: versions.data?.map(v => v.number) });
  for (const [i, v] of (versions.data ?? []).entries()) {
    const files = await db.from('os_project_files').select('path,sha256').eq('version_id', v.id);
    const stored = Object.fromEntries((files.data ?? []).map(f => [f.path, f.sha256]));
    const exp = packs[i].expected;
    const mismatch = Object.keys(exp).filter(p => stored[p] !== exp[p]);
    step(`v${v.number}: every stored file matches the Git blob of ${DELIVERIES[i].commit.slice(0, 7)} (SHA-256)`, mismatch.length === 0 && Object.keys(exp).length > 0,
      { files: Object.keys(exp).length, manifests: ['avalon-delivery/DELIVERY.json', 'avalon-delivery/VERIFY_REPORT.json'].every(p => stored[p]), mismatch });
  }
  await db.auth.signOut();
  const failed = steps.filter(s => !s.ok).length;
  fs.writeFileSync(path.join(dir, 'evidence-import-nova.json'), JSON.stringify({ base, projectId, steps, result: failed ? 'FAILED' : 'PASSED', at: new Date().toISOString() }, null, 2));
  console.log('RESULT', failed ? 'FAILED' : 'PASSED', `${steps.length - failed}/${steps.length}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message); process.exit(2); });
