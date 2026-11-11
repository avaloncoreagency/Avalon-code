// Nova studios (Codex UI + Avalon persistence): server-side validation and settings merge. No network, no database.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const load = require('../scripts/creative-bridge/continuity-loader.cjs');

const n = load('src/lib/os/nova-settings.ts');
const { emptyBlueprint } = load('src/lib/os/domain.ts');
const chat = { description: 'Bot', instructions: 'Responde con cortesía', personality: 'amable', greeting: 'Hola', color: '#8edbff', knowledge: [{ id: 'k1', title: 'Horario', body: 'L-V 9-18' }] };

test('chatbot config: valid input is accepted and normalized', () => {
  const r = n.validateChatbot(chat);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.knowledge, chat.knowledge);
});

test('chatbot config: invalid color, duplicate/unsafe ids, empty knowledge and oversize text are rejected', () => {
  assert.equal(n.validateChatbot({ ...chat, color: 'red' }).ok, false);
  assert.equal(n.validateChatbot({ ...chat, knowledge: [chat.knowledge[0], chat.knowledge[0]] }).ok, false);
  assert.equal(n.validateChatbot({ ...chat, knowledge: [{ id: '../x', title: 't', body: 'b' }] }).ok, false);
  assert.equal(n.validateChatbot({ ...chat, knowledge: [{ id: 'a', title: '', body: 'b' }] }).ok, false);
  assert.equal(n.validateChatbot({ ...chat, greeting: 'x'.repeat(1001) }).ok, false);
  assert.equal(n.validateChatbot(null).ok, false);
  assert.equal(n.validateChatbot({ ...chat, knowledge: 'x' }).ok, false);
});

test('CRM content: blueprint validated with the existing domain rules; modules and color checked', () => {
  const ok = n.validateCrm({ blueprint: emptyBlueprint(), color: '#112233', modules: ['contacts', 'tasks', 'tasks'] });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value.modules, ['contacts', 'tasks']);
  assert.equal(n.validateCrm({ blueprint: { entities: 'x' }, color: '#112233', modules: [] }).ok, false);
  assert.equal(n.validateCrm({ blueprint: { schemaVersion: 1, entities: [{ key: 'Bad Key', label: 'x', fields: [] }], pipelines: [], roles: [] }, color: '#112233', modules: [] }).ok, false);
  assert.equal(n.validateCrm({ blueprint: emptyBlueprint(), color: '#112233', modules: ['DROP TABLE'] }).ok, false);
  assert.equal(n.validateCrm({ blueprint: emptyBlueprint(), color: 'javascript:', modules: [] }).ok, false);
});

test('merge keeps unrelated settings (classic receptionist config, creative metadata)', () => {
  const current = { receptionist: { assistantName: 'Ana' }, creative: { external_ref: 'x' } };
  const merged = n.mergeSettings('chatbot', current, n.validateChatbot(chat).value);
  assert.deepEqual(merged.receptionist, current.receptionist);
  assert.deepEqual(merged.creative, current.creative);
  assert.equal(merged.chatbot.greeting, 'Hola');
  const crm = n.mergeSettings('crm', { other: 1 }, n.validateCrm({ blueprint: emptyBlueprint(), color: '#112233', modules: ['contacts'] }).value);
  assert.equal(crm.other, 1);
  assert.deepEqual(crm.nova, { color: '#112233', modules: ['contacts'] });
  assert.equal(crm.blueprint.schemaVersion, 1);
});

test('rehydration falls back to safe defaults for missing or tampered settings', () => {
  assert.equal(n.readChatbot({}).color, '#8edbff');
  assert.equal(n.readChatbot({ chatbot: { ...chat, color: 'bad' } }).greeting, '');
  assert.equal(n.readChatbot({ chatbot: chat }).greeting, 'Hola');
  const crm = n.readCrm({ nova: { color: 'bad', modules: 'x' } });
  assert.equal(crm.color, '#8edbff');
  assert.deepEqual(crm.modules, ['contacts']);
});

test('server actions use the owner session, version checks and never an admin key', () => {
  for (const f of ['src/app/admin/workspace/nova-studio-actions.ts', 'src/app/admin/workspace/website-designer/studio-actions.ts']) {
    const src = fs.readFileSync(f, 'utf8');
    assert.match(src, /^"use server";/);
    assert.match(src, /ownerForAction\(\)/);
    assert.match(src, /\.eq\("version", /);
    assert.doesNotMatch(src, /service_role|SERVICE_ROLE|createAdmin/i);
  }
  const web = fs.readFileSync('src/app/admin/workspace/website-designer/studio-actions.ts', 'utf8');
  assert.doesNotMatch(web, /\.delete\(/, 'the studio never deletes pages');
});
