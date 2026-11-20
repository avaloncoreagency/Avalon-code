// Safety tripwire for OMEGA #260 while trusted runtime integration remains unapproved.
// Static inspection only: does not establish Auth/RLS, prove live behavior, or run an agent.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SEARCH_ROOTS = ['src/app', 'src/lib'];
const EXCLUDE = new Set(['src/lib/operations']);
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function walk(relative) {
  const absolute = path.join(ROOT, relative);
  if (!fs.existsSync(absolute)) return [];
  if (EXCLUDE.has(relative.replaceAll('\\', '/'))) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) return walk(child);
    return entry.isFile() && EXTENSIONS.has(path.extname(entry.name)) ? [child] : [];
  });
}

// Runtime consumers of an untrusted receipt/IndependentReview contract are prohibited.
// These helper names and module paths are intentionally exact; this is an integration
// review reminder, NOT a general-purpose security scanner or substitute for dynamic tests.
test('OMEGA planner is not wired into live runtime before trusted receipt and owner gates', () => {
  const offenders = [];
  for (const relative of SEARCH_ROOTS.flatMap(walk)) {
    const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    const isOmegaImport = /(?:from\s*|import\s*\(|require\s*\()\s*['"`][^'"`]*\/operations\/(?:mission-plan|department-templates)(?:\.[cm]?[jt]s)?['"`]/m.test(source);
    if (isOmegaImport) offenders.push(relative);
  }
  assert.deepEqual(offenders, [], [
    'A runtime import of the draft OMEGA planner/templates was found.',
    'Do not bypass this test by renaming an import or loosening the pattern.',
    'Review an owner-scoped adapter, durable receipt provenance, independent approval,',
    'authorization, kill switch and recovery tests first; then intentionally update the gate.',
  ].join(' '));
});

test('the activation tripwire excludes no ordinary application source roots', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'src/app')));
  assert.ok(fs.existsSync(path.join(ROOT, 'src/lib')));
  assert.deepEqual([...EXCLUDE], ['src/lib/operations']);
});
