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
  if (paths.every(path => SAFE_ONLY.some(pattern => pattern.test(path))))
    return { skip: true, reason: 'non_runtime_files_only', files: paths.length };
  return { skip: false, reason: 'runtime_or_unknown_files_changed' };
}

if (require.main === module) {
  const d = decision();
  process.stdout.write(`Avalon Preview: ${d.skip ? 'skip build' : 'build'} (${d.reason})\n`);
  process.exitCode = d.skip ? 0 : 1;
}
module.exports = { decision };
