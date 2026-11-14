#!/usr/bin/env node
'use strict';
// Ignored Build Step for Vercel PREVIEW only.
// Exit 0: ignore this Preview build; exit 1: run the build (fail open).
// Never skip production, app code, config, dependencies or an uncertain diff.
const { spawnSync } = require('node:child_process');

const SAFE_ONLY = [
  /^docs\//,
  /^tests\//,
  /^\.github\//,
  /^\.codex\//,
  /^\.claude\//,
  /^README(?:\.[^/]*)?$/i,
  /^AGENTS\.md$/,
  /^CHANGELOG(?:\.[^/]*)?$/i,
  /^\.gitignore$/,
  /^\.editorconfig$/,
];
const sha = v => typeof v === 'string' && /^[a-f0-9]{40}$/i.test(v);
const safePath = path => typeof path === 'string' && SAFE_ONLY.some(pattern => pattern.test(path));
function decision(env = process.env, git = spawnSync) {
  if (env.VERCEL_ENV !== 'preview') return { skip: false, reason: 'not_preview' };
  const previous = env.VERCEL_GIT_PREVIOUS_SHA;
  const current = env.VERCEL_GIT_COMMIT_SHA;
  if (!sha(previous) || !sha(current) || previous.toLowerCase() === current.toLowerCase())
    return { skip: false, reason: 'missing_or_invalid_revision' };

  const result = git('git', ['diff', '--name-only', '-z', '--no-renames', '--no-ext-diff', previous, current, '--'], {
    encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024, windowsHide: true,
  });
  if (result.error || result.status !== 0 || typeof result.stdout !== 'string')
    return { skip: false, reason: 'diff_unavailable' };
  const paths = result.stdout.split('\0').filter(Boolean);
  if (!paths.length) return { skip: false, reason: 'empty_diff' };
  if (paths.every(safePath))
    return { skip: true, reason: 'non_runtime_files_only', files: paths.length };
  return { skip: false, reason: 'runtime_or_unknown_files_changed' };
}

/**
 * Vercel's .vercelignore excludes .git (source/security hygiene). When the
 * local diff cannot run, ask the repository's public GitHub compare API once.
 * Every ambiguity, rate limit or network problem FAILS OPEN (build, not skip).
 * No credentials, user-controlled URL, checkout or production mutation.
 */
async function decisionWithNetwork(env = process.env, git = spawnSync, http = globalThis.fetch) {
  const local = decision(env, git);
  if (local.reason !== 'diff_unavailable') return local;
  const previous = env.VERCEL_GIT_PREVIOUS_SHA?.toLowerCase();
  const current = env.VERCEL_GIT_COMMIT_SHA?.toLowerCase();
  if (!sha(previous) || !sha(current)) return { skip: false, reason: 'invalid_revision' };
  try {
    const response = await http(`https://api.github.com/repos/avaloncoreagency/Avalon-code/compare/${previous}...${current}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Avalon-Preview-Build-Guard' },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { skip: false, reason: 'github_compare_unavailable' };
    const data = await response.json();
    const files = data?.files;
    // Do not trust paginated/truncated diffs or diverged/unrelated histories.
    if (data?.status !== 'ahead' || data.behind_by !== 0 ||
        !Number.isSafeInteger(data.ahead_by) || data.ahead_by < 1 ||
        !Array.isArray(files) || files.length === 0 || files.length >= 300)
      return { skip: false, reason: 'unverifiable_compare' };
    // A rename from application code into docs is still a runtime change.
    const docsOnly = files.every(f => f && safePath(f.filename) &&
      (f.status !== 'renamed' || safePath(f.previous_filename)));
    return docsOnly
      ? { skip: true, reason: 'verified_non_runtime_diff', files: files.length }
      : { skip: false, reason: 'runtime_or_unknown_files_changed' };
  } catch {
    return { skip: false, reason: 'github_compare_failed' };
  }
}

if (require.main === module) {
  decisionWithNetwork().then(d => {
    process.stdout.write(`Avalon Preview: ${d.skip ? 'skip build' : 'build'} (${d.reason})\n`);
    process.exitCode = d.skip ? 0 : 1;
  }).catch(() => { process.stdout.write('Avalon Preview: build (unexpected_guard_error)\n'); process.exitCode = 1; });
}
module.exports = { decision, decisionWithNetwork };
