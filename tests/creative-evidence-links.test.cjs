const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const file = 'src/app/admin/creative-bridge/evidence-links.ts';
const code = fs.readFileSync(file, 'utf8');
const js = ts.transpileModule(code, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod = {exports:{}};
new Function('module','exports',js)(mod,mod.exports);
const safe = mod.exports.safeCreativeExternalEvidenceLink;

test('a public reported preview link stays clickable but remains a claim', () => {
  for (const url of [
    'https://avaloncoreagency.com/demo',
    'https://preview-project.vercel.app/',
    'https://client-site.example.org/portfolio',
  ]) assert.equal(safe(url),url);
});

test('unsafe, internal, credentialed and signed evidence URLs are not linked', () => {
  for (const url of [
    'http://client-site.example.org', 'javascript:alert(1)', '//evil.example.org/file',
    'https://localhost/page', 'https://admin.internal/page', 'https://service.local/',
    'https://foo.test/page', 'https://example.invalid/page', 'https://example.onion/',
    'https://127.0.0.1/', 'https://169.254.169.254/', 'https://[::1]/',
    'https://user:pass@client-site.example.org/',
    'https://client-site.example.org/path?token=secret',
    'https://client-site.example.org/path#secret', 'https://-bad.example.org/',
    'https://client-site.example.org:8080/', 'https://client-site.example.org/\nstealth',
    '', null, {}, 'x'.repeat(513),
  ]) assert.equal(safe(url),null,String(url));
});

test('Creative Bridge page applies the guard to all three external reported links', () => {
  const page = fs.readFileSync('src/app/admin/creative-bridge/page.tsx','utf8');
  for (const kind of ['preview_url','demo_url','production_url']) {
    assert.ok(page.includes('safeCreativeExternalEvidenceLink(checkpoint?.evidence?.' + kind + ')'),kind);
    assert.equal(page.includes('href={checkpoint.evidence.' + kind + '}'),false,kind);
  }
  assert.ok(page.includes("from './evidence-links'"));
});
