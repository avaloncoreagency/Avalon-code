// REN pipeline, end to end, in an ISOLATED git worktree with a SYNTHETIC provider (a scripted fake, not intelligence):
// discover real ESLint warnings → AI step with failover (Groq forced 429) → validated line edits → lint + tests → result.
// Then a crash-resume check: re-running with the same state file resumes completed steps without new provider calls.
// This proves the pipeline mechanics only; the real autonomous run uses live free providers in .github/workflows/ai-engine.yml.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const repo = path.resolve(__dirname, '..');
const FAKE = `
const real = globalThis.fetch; const fs = require('node:fs'); const log = process.env.FAKE_LOG;
const j = (s, b, h = {}) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json', ...h } });
globalThis.fetch = async (url, init) => {
  const u = String(url), host = new URL(u).hostname; fs.appendFileSync(log, u + '\\n');
  if (host === 'api.groq.com' && u.endsWith('/models')) return j(200, { data: [{ id: 'openai/gpt-oss-120b' }] });
  if (host === 'api.groq.com') return j(429, {}, { 'retry-after': '60' });
  if (u.includes('/ai/models/search')) return j(200, { result: [{ name: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' }] });
  if (host === 'openrouter.ai') return j(503, {});
  if (host === 'api.cloudflare.com' && u.endsWith('/chat/completions')) {
    const user = JSON.parse(init.body).messages[1].content;
    const lines = Object.fromEntries([...user.matchAll(/^\\s*(\\d+)\\| (.*)$/gm)].map(m => [Number(m[1]), m[2]]));
    const warn = [...user.matchAll(/línea (\\d+) \\[[^\\]]+\\] '([^']+)'/g)].map(m => [Number(m[1]), m[2]]);
    const edits = warn.map(([line, name]) => {
      const cur = lines[line];
      let next = cur.replace(new RegExp(',\\\\s*' + name + '\\\\s*=\\\\s*[^,;]+(?=;)'), '').replace(new RegExp('\\\\(([^)]*?),\\\\s*' + name + '\\\\)'), '($1)').replace(new RegExp('\\\\b' + name + ',\\\\s*'), '');
      return { line, expect: cur.trim(), replace_with: next.trim() }; // like real models: indentation dropped
    });
    return j(200, { choices: [{ message: { content: JSON.stringify({ edits, explanation: 'Elimina variables y parámetros sin usar.' }) } }], usage: { prompt_tokens: 900, completion_tokens: 120 } });
  }
  return real(url, init);
};`;

test('REN pipeline: discover → AI fix with failover → verify → resumable (synthetic provider, isolated worktree)', { timeout: 900000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ren-pipeline-'));
  const wt = path.join(dir, 'wt');
  cp.execFileSync('git', ['worktree', 'add', '--detach', wt, 'HEAD'], { cwd: repo, stdio: 'ignore' });
  t.after(() => { cp.execFileSync('git', ['worktree', 'remove', '--force', wt], { cwd: repo, stdio: 'ignore' }); fs.rmSync(dir, { recursive: true, force: true }); });
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  if (fs.existsSync(path.join(repo, 'tests/qa/node_modules'))) fs.symlinkSync(path.join(repo, 'tests/qa/node_modules'), path.join(wt, 'tests/qa/node_modules'));
  fs.writeFileSync(path.join(dir, 'fake.cjs'), FAKE);
  const log = path.join(dir, 'calls.log');
  const state = path.join(dir, 'state.json'), evidence = path.join(dir, 'ev.json');
  const env = { ...process.env, GROQ_API_KEY: 'fake', CLOUDFLARE_ACCOUNT_ID: 'fake', CLOUDFLARE_API_TOKEN: 'fake', OPENROUTER_API_KEY: 'fake',
    FAKE_LOG: log, NODE_PATH: path.join(repo, 'tests/qa/node_modules'), NODE_OPTIONS: `--require ${path.join(dir, 'fake.cjs')}`, GITHUB_STEP_SUMMARY: '' };
  delete env.NODE_TEST_CONTEXT;
  const run = () => cp.execFileSync('node', ['scripts/ai-engine/ren-dev-task.cjs', '--state', state, '--evidence', evidence, '--no-push'], { cwd: wt, env, encoding: 'utf8' });

  run();
  const ev = JSON.parse(fs.readFileSync(evidence, 'utf8'));
  assert.equal(ev.status, 'succeeded', ev.note);
  assert.equal(ev.steps.discover.output.file, 'tests/agents-managers.database.cjs');
  assert.deepEqual(ev.steps.fix.output.attempts.map(a => `${a.provider}:${a.outcome}`), ['groq:rate_limited', 'cloudflare:ok']);
  assert.equal(ev.steps.verify.output.warningsAfter, 0);
  assert.ok(ev.steps.verify.output.checks.every(c => c.ok), JSON.stringify(ev.steps.verify.output.checks));
  assert.equal(ev.costUsd, 0);
  const diff = cp.execFileSync('git', ['diff', '--stat'], { cwd: wt, encoding: 'utf8' });
  assert.match(diff, /tests\/agents-managers\.database\.cjs \| +4 \+\+--/);
  console.log(JSON.stringify({ fix: ev.steps.fix.output.edits, verify: ev.steps.verify.output }, null, 1));

  // Resume: same state file → every step is reused, no provider is called again.
  fs.writeFileSync(log, '');
  run();
  const ev2 = JSON.parse(fs.readFileSync(evidence, 'utf8'));
  assert.ok(['discover', 'fix', 'verify'].every(s => ev2.steps[s].resumed), JSON.stringify(ev2.steps));
  assert.equal(fs.readFileSync(log, 'utf8'), '');
});
