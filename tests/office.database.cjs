// Avalon Office data rules (synthetic data): self-only profiles, private messages, honest AI-manager inbox.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const MIGUEL = '00000000-0000-4000-8000-0000000000a1', SAMUEL = '00000000-0000-4000-8000-0000000000b2', OP = '00000000-0000-4000-8000-0000000000c3', OUT = '00000000-0000-4000-8000-0000000000d4';
test('office: profiles are self-written, messages private to the pair, agent requests never "executed"', { timeout: 120000 }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id, email) values('${MIGUEL}','miguel.preview@example.com'),('${SAMUEL}','samuel.preview@example.com'),('${OP}','op.preview@example.com'),('${OUT}','out@example.com');`);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.exec(`insert into agency_memberships values('${MIGUEL}','owner'),('${SAMUEL}','owner'),('${OP}','operator');`);
  }
  const as = u => db.exec(`reset role;set request.jwt.claim.sub='${u}';set role authenticated;`);
  const q = async (s, p) => (await db.query(s, p)).rows;

  // Directory lists every membership (all roles) — dynamic, no code change per member.
  await as(MIGUEL);
  const dir = await q('select user_id, role, email, has_photo from office_directory()');
  assert.deepEqual(dir.map(d => d.role), ['owner', 'owner', 'operator']);
  assert.equal(dir[0].has_photo, false);
  await as(OP);
  assert.equal((await q('select count(*)::int n from office_directory()'))[0].n, 0, 'non-owners see nothing');
  await as(OUT);
  assert.equal((await q('select count(*)::int n from office_directory()'))[0].n, 0, 'outsiders see nothing');

  // Profiles: only the person writes their own.
  await as(MIGUEL);
  await db.query("insert into office_profiles(user_id, display_name, title, specialties) values($1,'Miguel','Co-founder',array['Ventas'])", [MIGUEL]);
  await assert.rejects(db.query("insert into office_profiles(user_id, display_name) values($1,'Fake')", [SAMUEL]), /row-level security|self_only/);
  await as(SAMUEL);
  assert.equal((await q("update office_profiles set title='Hacked' where user_id=$1 returning 1", [MIGUEL])).length, 0, 'cannot edit another profile');
  await assert.rejects(db.query('delete from office_profiles'), /permission denied/);
  await as(MIGUEL);
  await db.query("update office_profiles set photo=$1, photo_mime='image/png', photo_sha256=$2 where user_id=$3", [Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'a'.repeat(64), MIGUEL]);
  assert.equal((await q('select has_photo from office_directory() where user_id=$1', [MIGUEL]))[0].has_photo, true);

  // Messages: private to sender/recipient, linked records must exist, read_at set once by recipient only.
  const [lead] = await q("insert into crm_leads(company,source,owner_id) values('Oficina Sintética','web',$1) returning id", [MIGUEL]);
  const [m] = await q("insert into office_messages(recipient_id, body, ref_type, ref_id) values($1,'Revisa este lead',$2,$3) returning id, sender_id", [SAMUEL, 'lead', lead.id]);
  assert.equal(m.sender_id, MIGUEL);
  await assert.rejects(db.query("insert into office_messages(recipient_id, body, ref_type, ref_id) values($1,'x','lead',gen_random_uuid())", [SAMUEL]), /office_ref_missing/);
  await assert.rejects(db.query("insert into office_messages(recipient_id, body) values($1,'a mí mismo')", [MIGUEL]), /check/);
  const [spoof] = await q("insert into office_messages(sender_id, recipient_id, body) values($1,$2,'suplantar') returning sender_id", [SAMUEL, OP]);
  assert.equal(spoof.sender_id, MIGUEL, 'sender is always the caller');
  assert.equal((await q("update office_messages set read_at=now() where id=$1 returning 1", [m.id])).length, 0, 'sender cannot mark as read');
  await assert.rejects(db.query("update office_messages set body='edit' where id=$1", [m.id]), /permission denied/, 'messages immutable');
  await as(SAMUEL);
  assert.equal((await q("update office_messages set read_at=now() where id=$1 returning read_at", [m.id])).length, 1);
  const first = (await q('select read_at from office_messages where id=$1', [m.id]))[0].read_at;
  await db.query('update office_messages set read_at=null where id=$1', [m.id]);
  assert.deepEqual((await q('select read_at from office_messages where id=$1', [m.id]))[0].read_at, first, 'read_at cannot be cleared');
  await as(OP);
  assert.equal((await q('select count(*)::int n from office_messages'))[0].n, 0, 'operator (non-owner) sees no messages');

  // AI-manager requests: registered or cancelled — there is no "done" state without an executor.
  await as(SAMUEL);
  const [r] = await q("insert into office_agent_requests(agent, body) values('ren','Muéstrame lo que falta') returning id, status, created_by");
  assert.equal(r.status, 'registered'); assert.equal(r.created_by, SAMUEL);
  await assert.rejects(db.query("insert into office_agent_requests(agent, body) values('jarvis','x')"), /check/);
  await assert.rejects(db.query("update office_agent_requests set status='done' where id=$1", [r.id]), /check|office_request_final/);
  await as(MIGUEL);
  assert.equal((await q("update office_agent_requests set status='cancelled' where id=$1 returning 1", [r.id])).length, 0, 'only the creator cancels');
  await as(SAMUEL);
  const [c] = await q("update office_agent_requests set status='cancelled' where id=$1 returning status, cancelled_at", [r.id]);
  assert.equal(c.status, 'cancelled'); assert.ok(c.cancelled_at);
  await assert.rejects(db.query("update office_agent_requests set status='registered' where id=$1", [r.id]), /office_request_final/);
  await as(OUT);
  for (const tbl of ['office_profiles', 'office_messages', 'office_agent_requests']) assert.equal((await q(`select count(*)::int n from ${tbl}`))[0].n, 0, tbl);
});
