// Static guarantees of .github/workflows/ai-engine.yml (scheduled autonomous operation). No network.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const wf = fs.readFileSync('.github/workflows/ai-engine.yml', 'utf8');
const jobsStart = wf.indexOf('\njobs:');
const header = wf.slice(0, jobsStart), jobsText = wf.slice(jobsStart);
const jobs = Object.fromEntries([...jobsText.matchAll(/\n  ([a-z-]+):\n([\s\S]*?)(?=\n  [a-z-]+:\n|$)/g)].map(m => [m[1], m[2]]));

test('schedule: exactly one cron (every 6 hours), manual dispatch, never pull_request_target', () => {
  assert.equal([...header.matchAll(/cron:\s*'([^']+)'/g)].length, 1);
  assert.match(header, /cron:\s*'17 \*\/6 \* \* \*'/);
  assert.match(header, /workflow_dispatch:/);
  assert.doesNotMatch(wf, /pull_request_target/);
});

test('no duplicate runs: one workflow-level concurrency group per ref, queued (never cancelling a running job)', () => {
  assert.match(header, /concurrency:\s*\n\s+group: avalon-ai-engine-\$\{\{ github\.ref \}\}\s*\n\s+cancel-in-progress: false/);
});

test('every job that can use secrets is behind the repository kill switch; PR-label triggers exclude forks', () => {
  for (const name of ['live-smoke', 'ren-dev-task', 'managers', 'intake']) {
    assert.match(jobs[name], /if: >-\s*\n\s+vars\.AVALON_AI_ENGINE_DISABLED != 'true'/, name + ' has the kill switch');
    if (/github\.event_name == 'pull_request'/.test(jobs[name])) assert.match(jobs[name], /head\.repo\.full_name == github\.repository/, name + ' excludes forks');
  }
  assert.match(jobs.offline, /runs-on: ubuntu-latest/);
  assert.doesNotMatch(jobs.offline, /secrets\./, 'the offline job never receives secrets');
});

test('least privilege: read by default; only REN may write contents/PRs; managers and intake write issues only', () => {
  assert.match(header, /permissions:\s*\n\s+contents: read\s*\n/);
  assert.match(jobs['ren-dev-task'], /permissions:\s*\n\s+contents: write[^\n]*\n\s+pull-requests: write/);
  for (const name of ['managers', 'intake']) {
    assert.match(jobs[name], /permissions:\s*\n\s+contents: read\s*\n\s+issues: write[^\n]*\n\s+pull-requests: read/);
    assert.doesNotMatch(jobs[name], /contents: write|pull-requests: write/);
  }
  assert.doesNotMatch(wf, /auto-merge|enable_pull_request_automerge|gh pr merge|--auto/, 'nothing in the engine can merge');
});

test('secrets only appear as env mappings (never echoed or interpolated into commands)', () => {
  for (const m of wf.matchAll(/^(.*\$\{\{ secrets\.[A-Z_]+ \}\}.*)$/gm)) assert.match(m[1], /^\s+[A-Z_]+: \$\{\{ secrets\.[A-Z_]+ \}\}\s*$/, 'secret used outside env: ' + m[1]);
  assert.doesNotMatch(wf, /echo[^\n]*\$\{?(GROQ|CLOUDFLARE|OPENROUTER)/, 'no secret is echoed (only names are reported)');
});

test('every job reads the SAME central control and restores/saves a resumable state', () => {
  for (const name of ['managers', 'intake', 'ren-dev-task']) {
    assert.match(jobs[name], /AVALON_SUPABASE_URL: \$\{\{ vars\.AVALON_SUPABASE_URL \}\}/, name);
    assert.match(jobs[name], /AVALON_SUPABASE_PUBLISHABLE_KEY: \$\{\{ vars\.AVALON_SUPABASE_PUBLISHABLE_KEY \}\}/, name);
    assert.match(jobs[name], /actions\/cache\/restore@v4/);
    assert.match(jobs[name], /actions\/cache\/save@v4/);
  }
  assert.match(jobs.managers, /--post "\$\{\{ vars\.AVALON_LEDGER_ISSUE \|\| '134' \}\}"/);
});

test('bounded work: job timeouts exist and the worker caps orders per round, retries and per-check time', () => {
  for (const name of ['offline', 'live-smoke', 'ren-dev-task', 'managers', 'intake']) assert.match(jobs[name], /timeout-minutes: \d+/, name);
  const ops = fs.readFileSync('scripts/ai-engine/operate.cjs', 'utf8');
  assert.match(ops, /(candidates|queue)\.slice\(0, 3\)/, 'at most 3 orders per round');
  assert.match(fs.readFileSync('scripts/ai-engine/managers.cjs', 'utf8'), /timeout: 15 \* 60e3/, 'a check cannot run forever');
  assert.match(fs.readFileSync('src/lib/ai-engine/policy.ts', 'utf8'), /export const LIMITS = \{ perHour: 6, perDay: 30, retries: 2 \}/);
});
