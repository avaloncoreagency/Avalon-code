const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file, mocks = {}) {
  const filename = path.resolve(file);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const loaded = { exports: {} };
  const localRequire = id => (id in mocks ? mocks[id] : id === 'server-only' ? {} : require(id));
  new Function('require', 'module', 'exports', source)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const d = load('src/lib/os/domain.ts');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const sources = walk('src').filter(f => /\.(ts|tsx)$/.test(f));

test('text validation trims, bounds and rejects control characters', () => {
  assert.deepEqual(d.cleanText('  hola  ', { min: 1, max: 10 }), { ok: true, value: 'hola' });
  assert.equal(d.cleanText('', { min: 1, max: 10 }).error, 'required');
  assert.equal(d.cleanText('x'.repeat(11), { max: 10 }).error, 'too_long');
  assert.equal(d.cleanText('a\u0000b', { max: 10 }).error, 'invalid');
  assert.equal(d.cleanText(42, { max: 10 }).error, 'invalid');
});

test('URLs: only https; links allow safe relative, anchors, mailto and tel', () => {
  assert.equal(d.httpsUrl('https://avaloncoreagency.com/a.png').ok, true);
  for (const bad of ['http://x.com', 'javascript:alert(1)', 'data:text/html,<script>', 'https://u:p@x.com', '//evil.com']) assert.equal(d.httpsUrl(bad).ok, false, bad);
  for (const good of ['/contacto', '#precios', 'mailto:hola@avalon.test', 'tel:+1 555 0100', 'https://avalon.test']) assert.equal(d.safeHref(good).ok, true, good);
  for (const bad of ['javascript:alert(1)', '//evil.com', 'JaVaScRiPt:alert(1)', '/a b', 'vbscript:x']) assert.equal(d.safeHref(bad).ok, false, bad);
});

test('slugs and dates', () => {
  assert.equal(d.slugify('Página de Inicio ¡Nueva!'), 'pagina-de-inicio-nueva');
  assert.equal(d.isSlug('inicio'), true);
  assert.equal(d.isSlug('Bad Slug'), false);
  assert.deepEqual(d.isoDate('2026-02-28'), { ok: true, value: '2026-02-28' });
  assert.equal(d.isoDate('2026-02-30').ok, false);
  assert.deepEqual(d.isoDate(''), { ok: true, value: null });
});

test('money is parsed to integer minor units without floating point drift', () => {
  assert.deepEqual(d.parsePrice('19.99'), { ok: true, value: 1999 });
  assert.deepEqual(d.parsePrice('19,9'), { ok: true, value: 1990 });
  assert.deepEqual(d.parsePrice('0.1'), { ok: true, value: 10 });
  assert.deepEqual(d.parsePrice('1500', 'CLP'), { ok: true, value: 1500 });
  for (const bad of ['-1', '1.999', 'abc', '1e5', '', '12.5.1']) assert.equal(d.parsePrice(bad).ok, false, bad);
  assert.equal(d.centsToInput(1999, 'USD'), '19.99');
});

test('website blocks validate types, links and button pairs; stored junk is dropped', () => {
  assert.equal(d.validateBlock({ type: 'hero', heading: 'Hola', subheading: '', buttonLabel: 'Contacto', buttonHref: '/contacto' }).ok, true);
  assert.equal(d.validateBlock({ type: 'hero', heading: 'x', buttonLabel: 'Go', buttonHref: 'javascript:alert(1)' }).error, 'block_url');
  assert.equal(d.validateBlock({ type: 'cta', heading: 'x', buttonLabel: 'Go', buttonHref: '' }).error, 'block_button');
  assert.equal(d.validateBlock({ type: 'script', heading: 'x' }).ok, false);
  assert.deepEqual(d.validateBlock({ type: 'features', heading: 'H', items: 'a\n\nb\n' }).value.items, ['a', 'b']);
  assert.equal(d.readBlocks([{ type: 'text', heading: 'ok', body: '' }, { type: 'evil' }, null]).length, 1);
  assert.equal(d.validateBlocks(Array(61).fill({ type: 'text', heading: '', body: '' })).ok, false);
  assert.deepEqual(d.moveItem([1, 2, 3], 0, 1), [2, 1, 3]);
  assert.deepEqual(d.moveItem([1, 2, 3], 0, -1), [1, 2, 3]);
});

test('CRM blueprints: templates are valid, keys safe, references enforced', () => {
  for (const [name, t] of Object.entries(d.BLUEPRINT_TEMPLATES)) assert.equal(d.validateBlueprint(t.blueprint).ok, true, name);
  const base = { entities: [{ key: 'deals', label: 'Deals', fields: [] }] };
  assert.equal(d.validateBlueprint({ ...base, entities: [{ key: 'Drop Table', label: 'x', fields: [] }] }).error, 'bp_key');
  assert.equal(d.validateBlueprint({ ...base, entities: [{ key: 'id', label: 'x', fields: [] }] }).error, 'bp_key');
  assert.equal(d.validateBlueprint({ entities: [base.entities[0], base.entities[0]] }).error, 'bp_duplicate');
  assert.equal(d.validateBlueprint({ ...base, pipelines: [{ key: 'p', label: 'P', entity: 'missing', stages: [] }] }).error, 'bp_reference');
  assert.equal(d.validateBlueprint({ entities: [{ key: 'a', label: 'A', fields: [{ key: 'kind', label: 'K', type: 'select', options: [] }] }] }).error, 'bp_options');
  const roles = d.validateBlueprint({ ...base, roles: [{ key: 'rep', label: 'Rep', permissions: { deals: 'edit', ghost: 'manage' } }] });
  assert.deepEqual(roles.value.roles[0].permissions, { deals: 'edit' });
  assert.equal(d.readBlueprint({ blueprint: { entities: 'nope' } }).entities.length, 0);
});

test('blueprint SQL preview quotes literals and never emits unvalidated identifiers', () => {
  const bp = d.validateBlueprint({ entities: [{ key: 'clients', label: 'C', fields: [{ key: 'tier', label: 'Tier', type: 'select', required: true, options: ["Gold's", 'Silver'] }] }],
    pipelines: [{ key: 'flow', label: 'Flow', entity: 'clients', stages: [{ key: 'new', label: 'New', kind: 'open' }] }] }).value;
  const sql = d.blueprintToSql(bp, 'acme');
  assert.match(sql, /create table public\.acme_clients/);
  assert.match(sql, /'Gold''s'/);
  assert.match(sql, /enable row level security/);
  assert.match(d.blueprintToSql(bp, 'x; drop table users'), /public\.client_clients/);
});

test('receptionist config validation and deterministic prompt', () => {
  const input = { assistantName: 'Ava', persona: 'professional', languages: ['es', 'en', 'xx'], greeting: 'Hola', instructions: '', timezone: 'America/New_York',
    hours: { mon: { open: '09:00', close: '18:00' }, sun: { closed: true } }, handoffEmail: 'equipo@avalon.test', handoffPhone: '', handoffRule: '' };
  const ok = d.validateReceptionist(input);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value.languages, ['es', 'en']);
  assert.equal(d.validateReceptionist({ ...input, hours: { mon: { open: '18:00', close: '09:00' } } }).error, 'rc_hours');
  assert.equal(d.validateReceptionist({ ...input, timezone: '../etc' }).error, 'rc_timezone');
  assert.equal(d.validateReceptionist({ ...input, handoffEmail: 'nope' }).error, 'rc_email');
  const prompt = d.buildReceptionistPrompt(ok.value, [{ kind: 'faq', question: '¿Precio?', answer: 'Según proyecto' }]);
  assert.match(prompt, /You are Ava/);
  assert.match(prompt, /Never invent prices/);
  assert.match(prompt, /Sunday: closed/);
  assert.equal(d.estimateTokens('abcd'.repeat(10)), 10);
});

test('marketing calendar grid starts on Monday and covers the month', () => {
  const grid = d.monthGrid(2026, 11);
  assert.equal(grid[0].length, 7);
  assert.equal(grid.flat().filter(Boolean).length, 30);
  assert.equal(grid[0].indexOf('2026-11-01'), 6); // 1 Nov 2026 is a Sunday
  assert.deepEqual(d.parseMonth('2026-13'), d.parseMonth(undefined));
  assert.equal(d.shiftMonth({ year: 2026, month: 12 }, 1), '2027-01');
  assert.equal(d.shiftMonth({ year: 2026, month: 1 }, -1), '2025-12');
});

test('no service-role or secret keys are referenced by application code', () => {
  for (const file of sources) {
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /service_role|SERVICE_ROLE|SUPABASE_SECRET|sb_secret_/, file);
    assert.doesNotMatch(text, /NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE)/, file);
  }
});

test('every module server action re-verifies the owner before touching data', () => {
  const actions = sources.filter(f => f.includes(path.join('admin', 'workspace')) && f.endsWith('actions.ts'));
  assert.ok(actions.length >= 6, 'expected module action files');
  for (const file of actions) {
    const text = fs.readFileSync(file, 'utf8');
    assert.match(text, /^"use server";/, file);
    const exported = [...text.matchAll(/export async function (\w+)/g)].map(m => m[1]);
    assert.ok(exported.length > 0, file);
    assert.ok(/ownerForAction\(\)/.test(text), `${file} must call ownerForAction`);
    assert.doesNotMatch(text, /\.rpc\(|createClient\(|getSession\(/, file);
  }
});

test('every private page renders inside the authenticated Suite or verifies the owner', () => {
  const pages = sources.filter(f => f.startsWith(path.join('src', 'app', 'admin')) && /page\.tsx$/.test(f) &&
    !/(login|signup|forgot-password|reset-password)/.test(f));
  assert.ok(pages.length >= 15);
  for (const file of pages) {
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(/<Suite[\s>]/.test(text) && /requireOwner\(|getLang\(/.test(text), file);
  }
  const routes = sources.filter(f => f.startsWith(path.join('src', 'app', 'admin', 'workspace')) && f.endsWith('route.ts'));
  for (const file of routes) assert.match(fs.readFileSync(file, 'utf8'), /getOwnerSession\(\)/, file);
});

test('CRM module files owned by Samuel are not created or modified on this branch', () => {
  for (const p of ['src/app/admin/workspace/crm', 'src/components/crm', 'src/lib/crm']) assert.equal(fs.existsSync(p), false, p);
});
