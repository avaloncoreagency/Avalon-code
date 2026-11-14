'use strict';
const fs = require('node:fs');

// This CI classification is intentionally STRICTER than Vercel's build-only
// filter: test changes and workflow changes always run the complete test suite.
const DOCS_ONLY = [
  /^docs\/.+/,
  /^README(?:\.[^/]*)?$/i,
  /^CHANGELOG(?:\.[^/]*)?$/i,
  /^AGENTS\.md$/,
  /^\.codex\/.+/,
  /^\.claude\/.+/,
];
function isDocsOnly(paths) {
  return Array.isArray(paths) && paths.length > 0 &&
    paths.every(p => typeof p === 'string' && p && !p.startsWith('/') &&
      !p.includes('\\') && !p.split('/').includes('..') &&
      DOCS_ONLY.some(allowed => allowed.test(p)));
}
if (require.main === module) {
  // A failed diff, an empty change set or malformed output must run all tests.
  try {
    const raw = fs.readFileSync(process.argv[2], 'utf8');
    if (!raw.endsWith('\0')) throw Error('Not a complete Git -z diff');
    const paths = raw.slice(0, -1).split('\0');
    process.stdout.write(isDocsOnly(paths) ? 'true' : 'false');
  } catch { process.stdout.write('false'); }
}
module.exports = { isDocsOnly };
