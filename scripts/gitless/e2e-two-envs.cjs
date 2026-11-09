#!/usr/bin/env node
// Gitless end-to-end proof against the ISOLATED Supabase project: two independent working directories that share
// NOTHING but the Code Exchange — "Codex" (empty directory, agent token) and "Claude" (integrator token).
//   1-2 Codex builds its repo from the exchange only, commits locally   3 exports a verifiable package   4 the exchange
//   receives it   5 the integrator verifies/quarantines/dry-merges, detects a conflict   6 approved packages are merged
//   (a sensitive one waits for the OWNER, approved in the Avalon UI)   7 gates run   8 mainline bundle + local backup +
//   restore check from an empty directory   10 Codex continues from the new verified mainline.
// Tokens are created by the synthetic OWNER through RLS (never an admin key) and live only in this process' memory.
//   node scripts/gitless/e2e-two-envs.cjs <dir with creds.json + env.json> <app-base-url for the owner UI>
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync, execFileSync } = require('node:child_process');
const { createClient } = require('@supabase/supabase-js');
const { chromium, devices } = require('playwright');

const [dir, appBase] = process.argv.slice(2);
const creds = JSON.parse(fs.readFileSync(path.join(dir, 'creds.json'), 'utf8'));
const env = JSON.parse(fs.readFileSync(path.join(dir, 'env.json'), 'utf8'));
if (/ltbwzcrxeuczdhhtbqgm/.test(env.url)) { console.error('REFUSED: production Supabase project'); process.exit(3); }
const REPO = path.resolve(__dirname, '../..');
const ACX = path.join(REPO, 'scripts/gitless/acx.mjs');
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
const root = fs.mkdtempSync(path.join(dir, 'gitless-'));
const steps = [];
const step = (name, ok, detail = {}) => { steps.push({ name, ok: !!ok, ...detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name, JSON.stringify(detail).slice(0, 400)); };
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

function acx(cwd, token, args, extraEnv = {}) {
  const r = spawnSync(process.execPath, [ACX, ...args], { cwd, encoding: 'utf8', maxBuffer: 64 << 20, timeout: 1800000,
    env: { ...process.env, AVALON_BRIDGE_TOKEN: token, AVALON_EXCHANGE_URL: env.url, AVALON_EXCHANGE_KEY: env.key, ...extraEnv } });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  console.log(out.split('\n').filter(Boolean).map(l => '      │ ' + l).join('\n'));
  return { status: r.status, out };
}
async function rpc(token, fn, args) {
  const res = await fetch(`${env.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: env.key, 'content-type': 'application/json' }, body: JSON.stringify({ ...args, p_token_sha256: sha(token) }) });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const identity = cwd => { git(cwd, 'config', 'user.email', 'codex-e2e@avalon-test.invalid'); git(cwd, 'config', 'user.name', 'Codex (E2E)'); };
const link = cwd => { if (!fs.existsSync(path.join(cwd, 'node_modules'))) fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(cwd, 'node_modules')); };

(async () => {
  // ── Owner creates least-privilege tokens in the app's own table (RLS, owner session) ──
  const owner = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signIn, error } = await owner.auth.signInWithPassword({ email: creds.owner.email, password: creds.owner.password });
  if (error) throw error;
  const mk = async (name, scopes) => {
    const raw = 'avb_' + crypto.randomBytes(24).toString('base64url');
    const r = await owner.from('os_project_api_tokens').insert({ name, token_sha256: sha(raw), prefix: raw.slice(0, 8), scopes, expires_at: new Date(Date.now() + 2 * 86400e3).toISOString(), created_by: signIn.user.id });
    if (r.error) throw new Error(r.error.message);
    return raw;
  };
  const CODEX = await mk(`E2E Codex ${stamp}`, ['code:deliver', 'code:pull']);
  const CLAUDE = await mk(`E2E Claude integrator ${stamp}`, ['code:integrate', 'code:pull']);
  const READER = await mk(`E2E reader ${stamp}`, ['code:pull']);
  step('owner created three least-privilege tokens (agent, integrator, reader) through RLS', true);

  // ── Claude (integrator) workspace: its own clone; bootstrap the mainline if the exchange is empty ──
  const claude = path.join(root, 'claude');
  git(REPO, 'clone', '-q', '--no-local', REPO, claude);
  git(claude, 'checkout', '-q', git(REPO, 'rev-parse', 'HEAD'));
  git(claude, 'checkout', '-q', '-b', 'main');
  identity(claude); link(claude);
  const head0 = (await rpc(CLAUDE, 'os_code_head', {})).body;
  if (!head0.chain.length) {
    const p = acx(claude, CLAUDE, ['publish', '--backup-dir', path.join(root, 'backups')]);
    step('integrator published the FIRST verified mainline (full bundle, gates green)', p.status === 0 && /PUBLISHED mainline #1/.test(p.out));
  } else {
    acx(claude, CLAUDE, ['sync', '--checkout']);
    git(claude, 'reset', '-q', '--hard', head0.chain.at(-1).commit);
  }
  const base = (await rpc(CLAUDE, 'os_code_head', {})).body.chain.at(-1);

  // ── Codex: EMPTY directory → sync from the exchange only ──
  const codex = path.join(root, 'codex');
  const s1 = acx(root, CODEX, ['sync', '--dir', codex]);
  step('Codex starts from an EMPTY directory and rebuilds the verified mainline from the exchange only', s1.status === 0 && git(codex, 'rev-parse', 'HEAD') === base.commit, { mainline: base.seq });
  identity(codex); link(codex);
  step('Codex holds no GitHub remote', git(codex, 'remote') === '');

  // Delivery A (safe): new doc. Delivery B (sensitive: scripts/). Delivery C conflicts with A (same file, other text).
  const note = `docs/gitless/e2e/${stamp}.md`;
  fs.mkdirSync(path.join(codex, path.dirname(note)), { recursive: true });
  fs.writeFileSync(path.join(codex, note), `# Entrega E2E ${stamp}\n\nCambio A (Codex)\n`);
  git(codex, 'add', '.'); git(codex, 'commit', '-q', '-m', `docs(e2e): gitless delivery A ${stamp}`);
  const dA = acx(codex, CODEX, ['deliver', '--id', `e2e-a-${stamp}`, '--module', 'gitless-e2e', '--author', 'codex', '--notes', 'E2E delivery A: documentation only.']);
  step('3-4 Codex exports delivery A (gates run locally) and the exchange receives it', dA.status === 0 && /submitted/.test(dA.out));

  git(codex, 'checkout', '-q', '-b', 'sensitive', base.commit);
  fs.writeFileSync(path.join(codex, `scripts/gitless/e2e-${stamp}.txt`), 'E2E: a change under scripts/ must wait for the owner.\n');
  git(codex, 'add', '.'); git(codex, 'commit', '-q', '-m', `chore(e2e): sensitive delivery B ${stamp}`);
  const dB = acx(codex, CODEX, ['deliver', '--id', `e2e-b-${stamp}`, '--module', 'gitless-e2e', '--author', 'codex', '--skip-tests', '--notes', 'E2E delivery B: touches scripts/.']);
  step('Codex exports delivery B (sensitive path)', dB.status === 0);

  git(codex, 'checkout', '-q', '-b', 'conflict', base.commit);
  fs.mkdirSync(path.join(codex, path.dirname(note)), { recursive: true });
  fs.writeFileSync(path.join(codex, note), `# Entrega E2E ${stamp}\n\nCambio C (conflicto)\n`);
  git(codex, 'add', '.'); git(codex, 'commit', '-q', '-m', `docs(e2e): conflicting delivery C ${stamp}`);
  const dC = acx(codex, CODEX, ['deliver', '--id', `e2e-c-${stamp}`, '--module', 'gitless-e2e', '--author', 'codex', '--skip-tests', '--notes', 'E2E delivery C: conflicts with A on purpose.']);
  step('Codex exports delivery C (will conflict with A)', dC.status === 0);

  // ── Least privilege, checked live ──
  const pub = await rpc(CODEX, 'os_code_publish', { p_commit: 'a'.repeat(40), p_parent: base.commit, p_bundle_sha256: 'b'.repeat(64), p_full_sha256: null, p_tests: { passed: 1, failed: 0 } });
  const inbox = await rpc(CODEX, 'os_code_inbox', {});
  const appr = await rpc(CODEX, 'os_code_set_status', { p_delivery: crypto.randomUUID(), p_status: 'approved' });
  step('agent token cannot publish, list the inbox or approve (28000)', [pub, inbox, appr].every(r => r.body?.code === '28000'), { codes: [pub, inbox, appr].map(r => r.body?.code) });
  const myA = (await rpc(CODEX, 'os_code_my_deliveries', {})).body.find(d => d.key === `e2e-a-${stamp}`);
  const pkgRead = await rpc(READER, 'os_code_inbox', {});
  step('pull-only token cannot see deliveries', pkgRead.body?.code === '28000');

  // ── 5-8 Integrator cycle ──
  const c1 = acx(claude, CLAUDE, ['cycle', '--auto-approve-safe', '--backup-dir', path.join(root, 'backups')]);
  step('5 integrator verified the three packages (quarantine + dry merge, nothing executed from them)', /APPROVED\s+e2e-a-/.test(c1.out) && /READY\s+e2e-b-.*owner approval required/.test(c1.out) && /APPROVED\s+e2e-c-/.test(c1.out));
  step('6-7 A merged and gates passed; C detected as CONFLICT and NOT merged; B waits for the owner', /INTEGRATED e2e-a-/.test(c1.out) && /FAILED e2e-c-.*conflicts/.test(c1.out) && !/INTEGRATED e2e-b-/.test(c1.out));
  step('8 new mainline published, backed up locally and RESTORED byte-identical in an empty directory', /PUBLISHED mainline #\d+/.test(c1.out) && /RESTORE OK/.test(c1.out));

  // ── Owner approves the sensitive delivery in the Avalon UI ──
  let uiApproved = false;
  if (appBase) {
    const browser = await chromium.launch();
    try {
      const page = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
      await page.goto(appBase + '/admin/login');
      await page.fill('input[name="email"]', creds.owner.email); await page.fill('input[name="password"]', creds.owner.password);
      await Promise.all([page.waitForURL(/\/admin\/dashboard/, { timeout: 30000 }), page.locator('button[type="submit"]').first().click()]);
      await page.goto(appBase + '/admin/workspace/library/code');
      const card = page.getByTestId('awaiting-delivery').filter({ hasText: `e2e-b-${stamp}` });
      await card.locator('input[name="note"]').fill('Aprobado en la prueba E2E (cambio en scripts/ revisado)');
      await Promise.all([page.waitForURL(/ok=delivery_approved/, { timeout: 30000 }), card.getByRole('button', { name: /Aprobar|Approve/ }).click()]);
      await page.screenshot({ path: path.join(dir, 'gitless-owner-approval.png'), fullPage: true });
      uiApproved = true;
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      step('owner approved the sensitive delivery in Avalon → Library → Code (iPhone profile, no overflow)', width <= 390, { width });
    } finally { await browser.close(); }
  }
  if (!uiApproved) {
    const { data: d } = await owner.from('os_code_deliveries').select('id').eq('delivery_key', `e2e-b-${stamp}`).single();
    const r = await owner.rpc('os_code_review', { p_delivery: d.id, p_decision: 'approved', p_note: 'E2E owner approval (API)' });
    step('owner approved the sensitive delivery (owner session RPC)', !r.error);
  }
  const c2 = acx(claude, CLAUDE, ['cycle', '--auto-approve-safe', '--backup-dir', path.join(root, 'backups')]);
  step('after the owner approval the integrator merged B, ran the gates and published', /INTEGRATED e2e-b-/.test(c2.out) && /PUBLISHED mainline #\d+/.test(c2.out) && /RESTORE OK/.test(c2.out));

  // ── 10 Codex continues from the latest verified version ──
  git(codex, 'checkout', '-q', 'main');
  const s2 = acx(codex, CODEX, ['sync', '--checkout']);
  const headN = (await rpc(READER, 'os_code_head', {})).body.chain.at(-1);
  const hasA = fs.existsSync(path.join(codex, note)) && /Cambio A/.test(fs.readFileSync(path.join(codex, note), 'utf8'));
  const hasB = fs.existsSync(path.join(codex, `scripts/gitless/e2e-${stamp}.txt`));
  step('10 Codex syncs the new verified mainline (contains A and B, not C) and can keep working on it', s2.status === 0 && git(codex, 'rev-parse', 'HEAD') === headN.commit && hasA && hasB, { mainline: headN.seq });
  const my = (await rpc(CODEX, 'os_code_my_deliveries', {})).body.filter(d => d.key.endsWith(stamp));
  const st = Object.fromEntries(my.map(d => [d.key.split('-')[1], d.status]));
  step('Codex sees the outcome of each delivery (A integrated, B integrated, C failed with conflicts)', st.a === 'integrated' && st.b === 'integrated' && st.c === 'failed'
    && my.find(d => d.key.startsWith('e2e-c-'))?.report?.conflicts?.includes(note), st);
  const backups = fs.readdirSync(path.join(root, 'backups'));
  step('local backups exist for every published mainline (bundle + sha256 + manifest)', backups.filter(f => f.endsWith('.bundle')).length >= 2 && backups.every(f => !/token|secret/i.test(f)), { files: backups.length });

  // Evidence (no tokens, no passwords)
  await owner.from('os_project_api_tokens').update({ revoked_at: new Date().toISOString() }).in('token_sha256', [sha(CODEX), sha(CLAUDE), sha(READER)]);
  const revoked = await rpc(CODEX, 'os_code_head', {});
  step('revoking a token cuts access immediately', revoked.body?.code === '28000');
  await owner.auth.signOut();
  const failed = steps.filter(s => !s.ok).length;
  fs.writeFileSync(path.join(dir, 'evidence-gitless.json'), JSON.stringify({ stamp, steps, mainline: headN, result: failed ? 'FAILED' : 'PASSED', at: new Date().toISOString() }, null, 2));
  console.log('RESULT', failed ? 'FAILED' : 'PASSED', `${steps.length - failed}/${steps.length}`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR', e.stack); process.exit(2); });
