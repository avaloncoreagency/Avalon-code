const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { decision, decisionWithNetwork } = require('../scripts/ci/vercel-ignore-build.cjs');

const sha1 = 'a'.repeat(40);
const sha2 = 'b'.repeat(40);
test('unknown revision, no git data, non-preview and production always build', () => {
  const env = { VERCEL_ENV: 'preview', VERCEL_GIT_PREVIOUS_SHA: sha1, VERCEL_GIT_COMMIT_SHA: sha2 };
  assert.equal(decision({ ...env, VERCEL_ENV: 'production' }).skip, false);
  assert.equal(decision({ ...env, VERCEL_ENV: 'development' }).skip, false);
  assert.equal(decision({ ...env, VERCEL_GIT_PREVIOUS_SHA: '' }).skip, false);
  assert.equal(decision({ ...env, VERCEL_GIT_COMMIT_SHA: 'invalid' }).skip, false);
  assert.equal(decision({ ...env, VERCEL_GIT_COMMIT_SHA: sha1 }).skip, false);
  assert.deepEqual(decision(env, () => ({ status: 128, stdout: '', error: null })).skip, false);
  assert.deepEqual(decision(env, () => ({ status: 0, stdout: '' })).skip, false);
});

test('Preview ignores only docs / CI / tests and always builds app, dependencies or mixed changes', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'avalon-build-ignore-'));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
  const write = (name, body) => { mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); writeFileSync(path.join(root, name), body); };
  const commit = (name, body) => { write(name, body); git('add', '--', name); git('commit', '-qm', 'synthetic'); return git('rev-parse', 'HEAD'); };
  try {
    git('init', '-q');
    git('config', 'user.name', 'Synthetic Test');
    git('config', 'user.email', 'test@example.invalid');
    let prev = commit('src/app/page.tsx', 'export default function Page() { return null }');
    const check = (next, expected, label) => {
      const env = { VERCEL_ENV: 'preview', VERCEL_GIT_PREVIOUS_SHA: prev, VERCEL_GIT_COMMIT_SHA: next };
      const r = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/ci/vercel-ignore-build.cjs')], { cwd: root, env, encoding: 'utf8' });
      assert.equal(r.status, expected ? 0 : 1, label + ': ' + r.stdout + ' ' + r.stderr);
      prev = next;
    };
    check(commit('docs/guide.md', 'v1'), true, 'docs-only');
    check(commit('tests/example.test.cjs', 'const test = 1;'), true, 'test-only');
    check(commit('.github/workflows/checks.yml', 'name: checks'), true, 'CI-only');
    check(commit('src/app/page.tsx', 'export default function Page() { return "x" }'), false, 'application code');
    check(commit('package.json', '{"name":"fixture"}'), false, 'dependencies');
    check(commit('vercel.json', '{"ignoreCommand":"other"}'), false, 'Vercel settings');
    const mixedPrev = prev;
    write('docs/guide.md', 'v2');
    write('src/app/page.tsx', 'export default function Page() { return "y" }');
    git('add', '--', 'docs/guide.md', 'src/app/page.tsx');
    git('commit', '-qm', 'mixed');
    const mixed = git('rev-parse', 'HEAD');
    assert.equal(decision({ VERCEL_ENV: 'preview', VERCEL_GIT_PREVIOUS_SHA: mixedPrev, VERCEL_GIT_COMMIT_SHA: mixed },
      (cmd, args, options) => spawnSync(cmd, args, { ...options, cwd: root })).skip, false, 'mixed change must build');
    const fakeMissing = decision({ VERCEL_ENV: 'preview', VERCEL_GIT_PREVIOUS_SHA: sha1, VERCEL_GIT_COMMIT_SHA: mixed },
      (cmd, args, options) => spawnSync(cmd, args, { ...options, cwd: root }));
    assert.equal(fakeMissing.skip, false, 'missing git history builds rather than skips');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('single NUL-delimited file paths never allow unknown paths to bypass builds', () => {
  const env = { VERCEL_ENV: 'preview', VERCEL_GIT_PREVIOUS_SHA: sha1, VERCEL_GIT_COMMIT_SHA: sha2 };
  const result = stdout => decision(env, () => ({ status: 0, stdout }));
  assert.equal(result('docs/a.md\0tests/b.cjs\0').skip, true);
  assert.equal(result('docs/a.md\0src/app/page.tsx\0').skip, false);
  assert.equal(result('.vercelignore\0').skip, false);
  assert.equal(result('scripts/build.js\0').skip, false);
  assert.equal(result('public/logo.png\0').skip, false);
});

test('public GitHub comparison securely skips docs-only Preview when Vercel excludes .git', async () => {
  const env = { VERCEL_ENV: 'preview', VERCEL_GIT_PREVIOUS_SHA: sha1, VERCEL_GIT_COMMIT_SHA: sha2 };
  const noGit = () => ({ status: 128, stdout: '', error: null });
  let calls = [];
  const fixture = (files, override = {}) => async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => ({
      status: 'ahead', ahead_by: 1, behind_by: 0, files, ...override,
    }) };
  };
  const docs = await decisionWithNetwork(env, noGit, fixture([
    { filename: 'docs/guide.md', status: 'modified' },
    { filename: 'tests/example.test.cjs', status: 'added' },
    { filename: '.github/workflows/checks.yml', status: 'modified' },
  ]));
  assert.equal(docs.skip, true);
  assert.equal(docs.reason, 'verified_non_runtime_diff');
  assert.equal(calls.length, 1, 'one public read, no extra provider calls');
  assert.match(calls[0].url, /^https:\/\/api\.github\.com\/repos\/avaloncoreagency\/Avalon-code\/compare\/a{40}\.\.\.b{40}$/);
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal((await decisionWithNetwork(env, noGit, fixture([
    { filename: 'docs/guide.md', status: 'modified' },
    { filename: 'src/app/page.tsx', status: 'modified' },
  ]))).skip, false);
  assert.equal((await decisionWithNetwork(env, noGit, fixture([
    { filename: 'docs/replaced.tsx', previous_filename: 'src/app/page.tsx', status: 'renamed' },
  ]))).skip, false, 'renamed application code must build');
  assert.equal((await decisionWithNetwork(env, noGit, fixture([
    { filename: 'docs/guide.md', status: 'modified' },
  ], { status: 'diverged', behind_by: 1 }))).skip, false);
  assert.equal((await decisionWithNetwork(env, noGit, fixture(
    Array.from({ length: 300 }, (_, i) => ({ filename: 'docs/guide' + i + '.md', status: 'added' }))
  ))).skip, false, 'truncated (300-file) comparisons cannot skip');
});

test('GitHub unavailable or malformed comparison always builds; production never calls network', async () => {
  const env = { VERCEL_ENV: 'preview', VERCEL_GIT_PREVIOUS_SHA: sha1, VERCEL_GIT_COMMIT_SHA: sha2 };
  const noGit = () => ({ status: 128, stdout: '', error: null });
  const denied = await decisionWithNetwork(env, noGit, async () => ({ ok: false, status: 403 }));
  assert.equal(denied.skip, false);
  const malformed = await decisionWithNetwork(env, noGit, async () => ({ ok: true, json: async () => ({ files: null }) }));
  assert.equal(malformed.skip, false);
  const failed = await decisionWithNetwork(env, noGit, async () => { throw Error('offline'); });
  assert.equal(failed.skip, false);
  let called = false;
  const production = await decisionWithNetwork({ ...env, VERCEL_ENV: 'production' }, noGit, async () => {
    called = true; throw Error('never called');
  });
  assert.equal(production.skip, false);
  assert.equal(called, false, 'never request an API comparison for production');
});
