// Staff work calendar privacy (mission C5) on real PostgreSQL (PGlite). Synthetic identities only.
// Miguel has 5 private events and Samuel 4 (crm_events = owner_private). Each assigns one activity to Ana; Ana creates
// two of her own. Ana must see exactly those 4 items and none of the 9 private events (by list, by id, by search);
// Pedro sees nothing of Ana's until an owner explicitly shares one item. Revocation and suspension are immediate.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const MIGUEL = '00000000-0000-4000-8000-0000000000a1', SAMUEL = '00000000-0000-4000-8000-0000000000b2';
const ANA = '00000000-0000-4000-8000-0000000000c3', PEDRO = '00000000-0000-4000-8000-0000000000d4', OUT = '00000000-0000-4000-8000-0000000000e5';

test('staff calendar: assigned + own items only; owners\' private events never readable; IDOR, sharing, revocation, suspension', { timeout: 180000 }, async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id,email) values ('${MIGUEL}','m@example.invalid'),('${SAMUEL}','s@example.invalid'),('${ANA}','ana@example.invalid'),('${PEDRO}','pedro@example.invalid'),('${OUT}','x@example.invalid')`);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.exec(`insert into agency_memberships(user_id,role) values ('${MIGUEL}','owner'),('${SAMUEL}','owner'),('${ANA}','operator'),('${PEDRO}','operator')`);
  }
  const as = u => db.exec(`reset role;set request.jwt.claim.sub='${u}';set role authenticated;`);
  const q = (sql, p) => db.query(sql, p).then(r => r.rows);
  const n = async (sql, p) => Number((await q(`select count(*) n from (${sql}) x`, p))[0].n);
  const key = () => crypto.randomUUID();
  const at = (d, h) => `2026-12-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00-05:00`;

  // Owners' private calendars (owner_private).
  const privateIds = [];
  for (const [owner, count, tag] of [[MIGUEL, 5, 'Miguel privado'], [SAMUEL, 4, 'Samuel privado']]) {
    await as(owner);
    for (let i = 0; i < count; i++) privateIds.push((await q("insert into crm_events(title,owner_id,starts_at,ends_at,timezone,kind) values($1,$2,$3,$4,'America/New_York','meeting') returning id",
      [`${tag} ${i + 1} — confidencial`, owner, at(i + 1, 9), at(i + 1, 10)]))[0].id);
  }
  await as(MIGUEL);
  const [lead] = await q("insert into crm_leads(company,contact,source,owner_id) values('Lead Ana QA','Cliente','QA',$1) returning id", [MIGUEL]);
  await q("insert into staff_portal_access(user_id,active,job_title,can_create_events) values($1,true,'seller',true),($2,true,'operator',false)", [ANA, PEDRO]);
  await q("insert into staff_lead_grants(user_id,lead_id,access_level) values($1,$2,'work')", [ANA, lead.id]);
  // An owner cannot link a lead the employee has not been granted.
  await assert.rejects(q("insert into staff_work_items(idempotency_key,kind,origin,assignee_id,title,starts_at,lead_id) values($1,'appointment','staff_assigned',$2,'X',$3,$4)",
    [key(), PEDRO, at(3, 11), lead.id]), /staff_item_lead_not_granted/);
  const [m1] = await q("insert into staff_work_items(idempotency_key,kind,origin,assignee_id,title,instructions,starts_at,ends_at,priority,lead_id) values($1,'appointment','staff_assigned',$2,'Visita a Lead Ana QA','Llevar propuesta',$3,$4,'high',$5) returning id",
    [key(), ANA, at(10, 11), at(10, 12), lead.id]);
  await as(SAMUEL);
  const [s1] = await q("insert into staff_work_items(idempotency_key,kind,origin,assignee_id,title,due_at) values($1,'task','staff_assigned',$2,'Preparar reporte semanal',$3) returning id", [key(), ANA, at(12, 17)]);
  // Owners cannot impersonate an employee-created origin.
  await assert.rejects(q("insert into staff_work_items(idempotency_key,kind,origin,assignee_id,title,due_at) values($1,'task','staff_created',$2,'X',$3)", [key(), ANA, at(12, 17)]), /row-level security|policy/i);

  // Ana: two own work events.
  await as(ANA);
  const [a1] = await q("insert into staff_work_items(idempotency_key,kind,origin,assignee_id,title,starts_at,ends_at,lead_id) values($1,'follow_up','staff_created',$2,'Seguimiento llamada',$3,$4,$5) returning id", [key(), ANA, at(11, 15), at(11, 16), lead.id]);
  await q("insert into staff_work_items(idempotency_key,kind,origin,assignee_id,title,due_at) values($1,'task','staff_created',$2,'Actualizar notas de visita',$3)", [key(), ANA, at(13, 12)]);
  // Cannot create on behalf of an owner or another employee; idempotency prevents duplicates.
  await assert.rejects(q("insert into staff_work_items(idempotency_key,kind,origin,assignee_id,title,due_at) values($1,'task','staff_created',$2,'X',$3)", [key(), MIGUEL, at(13, 12)]), /row-level security|policy/i);
  await assert.rejects(q("insert into staff_work_items(idempotency_key,kind,origin,assignee_id,title,due_at) values($1,'task','staff_assigned',$2,'X',$3)", [key(), ANA, at(13, 12)]), /row-level security|policy/i);
  const dup = key();
  await q("insert into staff_work_items(idempotency_key,kind,origin,assignee_id,title,due_at) values($1,'task','staff_created',$2,'Una vez',$3)", [dup, ANA, at(14, 9)]);
  await assert.rejects(q("insert into staff_work_items(idempotency_key,kind,origin,assignee_id,title,due_at) values($1,'task','staff_created',$2,'Una vez',$3)", [dup, ANA, at(14, 9)]), /duplicate key|unique/i);

  assert.equal(await n('select * from staff_work_items'), 5, 'Ana: 2 assigned + 3 own');
  assert.equal(await n("select * from staff_work_items where origin='staff_assigned'"), 2);
  assert.equal(await n('select * from crm_events'), 0, 'none of the 9 owners\' private events');
  assert.equal(await n('select * from crm_events where id = any($1::uuid[])', [privateIds]), 0, 'not even by id (IDOR)');
  assert.equal(await n("select * from crm_events where title ilike '%confidencial%'"), 0, 'not by search');
  assert.equal(await n('select * from crm_leads'), 0, 'the CRM stays closed');

  // Ana's limits on assigned work: progress yes; rewrite/reassign/reschedule/cancel no.
  await assert.rejects(q("update staff_work_items set title='cambiado' where id=$1", [m1.id]), /staff_item_forbidden_change/);
  await assert.rejects(q('update staff_work_items set assignee_id=$2 where id=$1', [m1.id, PEDRO]), /staff_item_forbidden_change|row-level/);
  await assert.rejects(q("update staff_work_items set starts_at=$2, ends_at=$3 where id=$1", [m1.id, at(20, 9), at(20, 10)]), /staff_item_reschedule_forbidden/);
  await assert.rejects(q("update staff_work_items set status='cancelled' where id=$1", [s1.id]), /staff_item_cancel_forbidden/);
  await assert.rejects(q("update staff_work_items set status='done' where id=$1", [s1.id]), /check/i, 'done requires completion evidence');
  await q("update staff_work_items set status='done', completion_note='Reporte enviado por email' where id=$1", [s1.id]);
  await q("update staff_work_items set starts_at=$2, ends_at=$3 where id=$1", [a1.id, at(11, 17), at(11, 18)]);
  // Notes: personal (author only) and work notes on her item.
  await q("insert into staff_notes(visibility,body) values('personal','Recordatorio personal de Ana')");
  await q("insert into staff_notes(visibility,item_id,lead_id,body) values('work',$1,$2,'Cliente interesado en el plan mensual')", [m1.id, lead.id]);

  // Pedro: nothing of Ana's — by list or by id — until an owner shares one item explicitly.
  await as(PEDRO);
  assert.equal(await n('select * from staff_work_items'), 0);
  assert.equal(await n('select * from staff_work_items where id=$1', [m1.id]), 0, 'IDOR on Ana\'s item');
  assert.equal(await n('select * from staff_notes'), 0);
  assert.equal(await n('select * from crm_events'), 0);
  assert.equal((await db.query("update staff_work_items set status='done', completion_note='x x x' where id=$1", [m1.id])).affectedRows, 0);
  await assert.rejects(q("insert into staff_work_items(idempotency_key,kind,origin,assignee_id,title,due_at) values($1,'task','staff_created',$2,'X',$3)", [key(), PEDRO, at(13, 12)]), /row-level security|policy/i, 'Pedro lacks can_create_events');
  await as(MIGUEL);
  await q('insert into staff_work_item_shares(item_id,user_id) values($1,$2)', [m1.id, PEDRO]);
  await as(PEDRO);
  assert.deepEqual((await q('select id from staff_work_items')).map(r => r.id), [m1.id], 'explicit_shared: exactly the shared item');
  assert.equal(await n('select * from staff_work_item_shares'), 1, 'active recipient can read its share');
  assert.equal(await n("select * from staff_notes where visibility='work'"), 1, 'work note of a shared item');
  assert.equal(await n("select * from staff_notes where visibility='personal'"), 0, 'never Ana\'s personal note');
  assert.equal((await db.query("update staff_work_items set status='done', completion_note='x x x' where id=$1", [m1.id])).affectedRows, 0, 'shared ≠ assigned: read only');

  // Owners: supervise assignments and work notes; Ana's personal note stays hers.
  await as(SAMUEL);
  assert.equal(await n('select * from staff_work_items where assignee_id=$1', [ANA]), 5);
  assert.equal(await n("select * from staff_notes where visibility='personal'"), 0, 'no automatic supervision of personal notes');
  assert.equal(await n("select * from staff_notes where visibility='work'"), 1);
  assert.equal(await n('select * from crm_events where owner_id=$1', [MIGUEL]), 5, 'owners keep the shared agency calendar as before');

  // Lead revoked: Ana keeps her history but cannot link that lead again.
  await as(MIGUEL);
  await q('update staff_lead_grants set active=false where user_id=$1 and lead_id=$2', [ANA, lead.id]);
  await as(ANA);
  await assert.rejects(q("insert into staff_work_items(idempotency_key,kind,origin,assignee_id,title,due_at,lead_id) values($1,'task','staff_created',$2,'X',$3,$4)", [key(), ANA, at(15, 9), lead.id]), /staff_item_lead_not_granted/);
  // Suspended: no operational access at all, through any path.
  await as(MIGUEL);
  await q('update staff_portal_access set active=false where user_id=$1', [ANA]);
  await as(ANA);
  assert.equal(await n('select * from staff_work_items'), 0);
  assert.equal(await n('select * from staff_notes'), 0);
  assert.equal((await db.query("update staff_work_items set status='in_progress' where id=$1", [a1.id])).affectedRows, 0);
  await assert.rejects(q("insert into staff_notes(visibility,body) values('personal','después de suspensión')"), /row-level security|policy/i);
  await as(SAMUEL);
  await q('update staff_portal_access set active=false where user_id=$1', [PEDRO]);
  await as(PEDRO);
  assert.equal(await n('select * from staff_work_item_shares'), 0, 'same identity loses share metadata on suspension');
  assert.equal(await n('select * from staff_work_items'), 0, 'shared item stays hidden after suspension');
  await as(SAMUEL);
  assert.equal(await n('select * from staff_work_item_shares'), 1, 'owner retains the share record');
  // Unknown user and anon.
  await as(OUT);
  assert.equal(await n('select * from staff_work_items'), 0);
  await db.exec('reset role');
  for (const tbl of ['staff_work_items', 'staff_work_item_shares', 'staff_notes'])
    assert.equal((await q("select has_table_privilege('anon', $1, 'select') x", ['public.' + tbl]))[0].x, false, `anon has no access to ${tbl}`);
  // Audit trail of owner assignments.
  const ev = (await q("select action from staff_permission_events where action like 'work_%' order by id")).map(r => r.action);
  assert.deepEqual(ev, ['work_assigned', 'work_assigned']);
});
