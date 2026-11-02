// Sales core on real PostgreSQL (PGlite WASM). Synthetic users and data only;
// no remote connections. Run: NODE_PATH=tests/qa/node_modules node --test tests/sales.database.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

const MIGUEL = '00000000-0000-4000-8000-0000000000a1';
const SAMUEL = '00000000-0000-4000-8000-0000000000b2';
const STRANGER = '00000000-0000-4000-8000-0000000000c3';
const NOVA_KEY = '11111111-1111-4111-8111-111111111111';

async function setup() {
  const db = new PGlite();
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id,email) values('${MIGUEL}','miguel@example.invalid'),('${SAMUEL}','samuel@example.invalid'),('${STRANGER}','stranger@example.invalid');`);
  const files = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    if (file.startsWith('20261102053022')) {
      await db.exec(`insert into agency_memberships(user_id,role) values('${MIGUEL}','owner'),('${SAMUEL}','owner'),('${STRANGER}','operator');`);
    }
  }
  const as = user => db.exec(`reset role;set request.jwt.claim.sub='${user}';set role authenticated;`);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const n = async (sql, params) => Number((await one(sql, params)).n);
  return { db, as, one, n };
}

const novaRequest = (overrides = {}) => ({
  idempotency_key: NOVA_KEY,
  new_client: { legal_name: 'Nova Restaurant', trade_name: 'Nova', website: 'https://nova.example.invalid', industry: 'Restaurantes', country: 'US', location: 'Miami, FL', source: 'Referido sintético' },
  contacts: [
    { full_name: 'Ana Prueba', email: 'ana@nova.example.invalid', phone: '+1 555 0100', role: 'Propietaria' },
    { full_name: 'Luis Prueba', email: 'luis@nova.example.invalid', role: 'Gerente' },
  ],
  sold_on: '2026-11-02', currency: 'USD', billing_mode: 'mixed', upfront_amount: '1750.00', seller_id: MIGUEL,
  lines: [
    { service_code: 'desarrollo-web', unit_price: '2000', description: 'Sitio de 5 páginas con reservas', assignee_id: SAMUEL },
    { service_code: 'recepcionista-ia', unit_price: '1500', description: 'Recepcionista para reservas telefónicas' },
    { service_code: 'marketing-mensual', unit_price: '700', description: 'Gestión de redes y campañas' },
  ],
  ...overrides,
});

test('Nova Restaurant end-to-end: one client, one sale, three departments, idempotent replay', { timeout: 120000 }, async t => {
  const { db, as, one, n } = await setup();
  t.after(() => db.close());

  await as(MIGUEL);
  const first = (await one('select crm_confirm_sale($1::jsonb) r', [JSON.stringify(novaRequest())])).r;
  assert.equal(first.replayed, false);
  assert.equal(first.client_created, true);
  assert.equal(first.contacts, 2);
  assert.equal(first.work_orders, 3);
  assert.equal(first.projects, 3);
  assert.match(first.sale_number, /^AV-2026-\d{5}$/);
  assert.ok(first.tasks >= 12, 'template tasks generated');

  // Double click / retry with the same key → same sale, nothing duplicated.
  const replay = (await one('select crm_confirm_sale($1::jsonb) r', [JSON.stringify(novaRequest())])).r;
  assert.equal(replay.replayed, true);
  assert.equal(replay.sale_id, first.sale_id);
  assert.equal(replay.tasks, first.tasks);

  // Re-submission with a NEW key (e.g. reloaded form) must not create a second Nova.
  await assert.rejects(
    db.query('select crm_confirm_sale($1::jsonb)', [JSON.stringify(novaRequest({ idempotency_key: '22222222-2222-4222-8222-222222222222', new_client: { legal_name: '  nova   RESTAURANT ' } }))]),
    /sale_client_exists/);
  await assert.rejects(
    db.query('select crm_confirm_sale($1::jsonb)', [JSON.stringify(novaRequest({ idempotency_key: '33333333-3333-4333-8333-333333333333', new_client: { legal_name: 'Nova Bistro' }, contacts: [{ full_name: 'Ana', email: 'ANA@nova.example.invalid' }] }))]),
    /sale_client_exists/, 'contact e-mail also identifies an existing client');

  assert.equal(await n('select count(*) n from crm_clients'), 1);
  assert.equal(await n('select count(*) n from crm_contacts'), 2);
  assert.equal(await n('select count(*) n from crm_contacts where is_primary'), 1);
  assert.equal(await n('select count(*) n from crm_sales'), 1);
  assert.equal(await n('select count(*) n from crm_sale_lines'), 3);
  assert.equal(await n('select count(*) n from crm_work_orders'), 3);
  assert.equal(await n('select count(*) n from os_projects'), 3);
  assert.equal(await n('select count(*) n from crm_tasks'), first.tasks);

  const sale = await one('select * from crm_sales where id=$1', [first.sale_id]);
  assert.equal(sale.client_id, first.client_id);
  assert.equal(Number(sale.subtotal), 4200);
  assert.equal(Number(sale.total), 4200);
  assert.equal(Number(sale.recurring_monthly), 700);
  assert.equal(sale.seller_id, MIGUEL);
  assert.equal(sale.delivery_status, 'not_started');

  // Each department received its own project, linked by FK to the client (no name matching).
  const projects = (await db.query('select p.module, p.client_id, w.department_id, w.recurrence, w.assignee_id from crm_work_orders w join os_projects p on p.id=w.project_id order by p.module')).rows;
  assert.deepEqual(projects.map(p => p.module), ['marketing', 'receptionist', 'website']);
  assert.ok(projects.every(p => p.client_id === first.client_id));
  assert.equal(projects.find(p => p.module === 'marketing').recurrence, 'monthly', 'marketing is a recurring service');
  assert.equal(projects.find(p => p.module === 'website').assignee_id, SAMUEL, 'explicit assignee respected');
  assert.equal(projects.find(p => p.module === 'receptionist').assignee_id, MIGUEL, 'defaults to seller');
  const perDept = (await db.query('select department_id, count(*)::int n from crm_tasks group by 1 order by 1')).rows;
  assert.deepEqual(perDept.map(r => r.department_id), ['marketing', 'receptionist', 'website']);
  assert.ok(perDept.every(r => r.n >= 4));
  assert.equal(await n("select count(*) n from crm_tasks where client_id<>$1 or project_id is null or sale_id<>$2", [first.client_id, first.sale_id]), 0);

  // Contracted ≠ collected.
  let metrics = await one('select * from crm_sales_metrics()');
  assert.equal(Number(metrics.contracted), 4200);
  assert.equal(Number(metrics.collected), 0, 'agreed upfront payment is not money received');
  assert.equal(Number(metrics.upfront_agreed), 1750);
  await db.query(`insert into crm_payments(sale_id,amount,currency,received_on,method,reference) values($1,1750,'USD','2026-11-03','transfer','SYN-001')`, [first.sale_id]);
  metrics = await one('select * from crm_sales_metrics()');
  assert.equal(Number(metrics.collected), 1750);
  await assert.rejects(db.query(`insert into crm_payments(sale_id,amount,currency,received_on,method) values($1,3000,'USD','2026-11-04','cash')`, [first.sale_id]), /payment_exceeds_total/);
  await assert.rejects(db.query(`insert into crm_payments(sale_id,amount,currency,received_on,method) values($1,10,'EUR','2026-11-04','cash')`, [first.sale_id]), /payment_currency_mismatch/);

  // Timeline: one correlated story for the operation.
  const events = (await db.query('select event_type from crm_timeline where correlation_id=$1 order by id', [sale.correlation_id])).rows.map(r => r.event_type);
  for (const e of ['client.created', 'contact.added', 'sale.confirmed', 'service.assigned', 'project.created', 'tasks.generated', 'notification.sent']) assert.ok(events.includes(e), `timeline has ${e}`);
  assert.equal(events.filter(e => e === 'project.created').length, 3);
  assert.equal(await n("select count(*) n from crm_timeline where client_id=$1 and event_type='payment.recorded'", [first.client_id]), 1);

  // Both owners can consult progress; notifications are per recipient.
  await as(SAMUEL);
  assert.equal(await n('select count(*) n from crm_work_orders where client_id=$1', [first.client_id]), 3);
  assert.equal(await n("select count(*) n from crm_notifications where category='sales'"), 1);
  assert.equal(await n("select count(*) n from crm_notifications where category='delivery'"), 1, 'Samuel got the website work order');
  await as(MIGUEL);
  assert.equal(await n("select count(*) n from crm_notifications where category='delivery'"), 2);

  // Work progress rolls up to the sale.
  const orders = (await db.query('select id from crm_work_orders where sale_id=$1 order by created_at, id', [first.sale_id])).rows;
  await db.query("update crm_work_orders set status='in_progress' where id=$1", [orders[0].id]);
  assert.equal((await one('select delivery_status from crm_sales where id=$1', [first.sale_id])).delivery_status, 'in_progress');
  for (const o of orders) await db.query("update crm_work_orders set status='delivered' where id=$1", [o.id]);
  assert.equal((await one('select delivery_status from crm_sales where id=$1', [first.sale_id])).delivery_status, 'delivered');

  // Structural/immutability protections.
  await assert.rejects(db.query("update crm_sales set total=1 where id=$1", [first.sale_id]), /permission denied/);
  await assert.rejects(db.query("insert into crm_sales(sale_number,idempotency_key,correlation_id,client_id,sold_on,currency,subtotal,total,billing_mode,seller_id) values('X',gen_random_uuid(),gen_random_uuid(),$1,current_date,'USD',0,0,'one_time',$2)", [first.client_id, MIGUEL]), /permission denied/);
  await assert.rejects(db.query("update crm_clients set client_code='CLI-999999'"), /permission denied/);
  await assert.rejects(db.query("insert into crm_timeline(event_type,module,entity) values('fake.event','crm','x')"), /permission denied/);
  await assert.rejects(db.query('update crm_timeline set detail=$1', ['tampered']), /permission denied/);
  await assert.rejects(db.query('delete from crm_timeline'), /permission denied/);
  await assert.rejects(db.query("insert into crm_notifications(recipient_id,severity,category,title,dedupe_key) values($1,'urgent','sales','x','x')", [SAMUEL]), /permission denied/);

  // Outsiders (non-owner member) see nothing and cannot call the RPC.
  await as(STRANGER);
  for (const table of ['crm_clients', 'crm_contacts', 'crm_sales', 'crm_sale_lines', 'crm_work_orders', 'crm_tasks', 'crm_payments', 'crm_timeline', 'crm_notifications', 'crm_service_catalog']) {
    assert.equal(await n(`select count(*) n from ${table}`), 0, `${table} hidden from non-owner`);
  }
  await assert.rejects(db.query('select crm_confirm_sale($1::jsonb)', [JSON.stringify(novaRequest({ idempotency_key: '44444444-4444-4444-8444-444444444444' }))]), /crm_forbidden/);
  await db.exec('reset role;');
  await db.exec("set role anon;");
  await assert.rejects(db.query('select crm_confirm_sale($1::jsonb)', [JSON.stringify(novaRequest())]), /permission denied/);
});

test('validation failures roll back atomically and are recorded for diagnosis', { timeout: 120000 }, async t => {
  const { db, as, n } = await setup();
  t.after(() => db.close());
  await as(MIGUEL);
  const bad = [
    [{ lines: [] }, /sale_invalid_lines/],
    [{ lines: [{ service_code: 'no-existe', unit_price: '1' }] }, /sale_invalid_service/],
    [{ lines: [{ service_code: 'desarrollo-web' }] }, /sale_missing_price/],
    [{ lines: [{ service_code: 'desarrollo-web', unit_price: '1e9' }] }, /sale_invalid_amount/],
    [{ lines: [{ service_code: 'desarrollo-web', unit_price: '100', discount: '200' }] }, /sale_invalid_discount/],
    [{ upfront_amount: '999999' }, /sale_invalid_upfront/],
    [{ seller_id: STRANGER }, /sale_invalid_member/],
    [{ sold_on: '2026-02-30' }, /sale_invalid_date/],
    [{ new_client: { legal_name: ' ' } }, /sale_client_required/],
    [{ idempotency_key: 'not-a-uuid' }, /sale_invalid_key/],
    // Last line fails after earlier lines were valid: nothing from the first lines survives.
    [{ lines: [{ service_code: 'desarrollo-web', unit_price: '2000' }, { service_code: 'tienda-online', unit_price: '10', start_on: 'mañana' }] }, /sale_invalid_date/],
  ];
  for (const [patch, error] of bad) await assert.rejects(db.query('select crm_confirm_sale($1::jsonb)', [JSON.stringify(novaRequest(patch))]), error);
  for (const table of ['crm_clients', 'crm_contacts', 'crm_sales', 'crm_sale_lines', 'crm_work_orders', 'crm_tasks', 'os_projects', 'crm_notifications']) {
    assert.equal(await n(`select count(*) n from ${table}`), 0, `${table} untouched after failures`);
  }
  await db.query("select crm_record_sale_failure($1, 'sale_invalid_date')", [NOVA_KEY]);
  assert.equal(await n("select count(*) n from crm_timeline where event_type='sale.failed' and result='error' and correlation_id=$1", [NOVA_KEY]), 1);
  await assert.rejects(db.query("select crm_record_sale_failure($1, 'DROP TABLE')", [NOVA_KEY]), /sale_invalid/);
});

test('existing client and lead: sale links instead of duplicating, lead moves to won', { timeout: 120000 }, async t => {
  const { db, as, one, n } = await setup();
  t.after(() => db.close());
  await as(MIGUEL);
  const lead = await one(`insert into crm_leads(company,contact,email,phone,source,owner_id,stage_id) values('Orbit Dental','Clara Prueba','clara@orbit.example.invalid','+1 555 0199','Web sintética',$1,'proposal') returning id`, [MIGUEL]);
  const r1 = (await one('select crm_confirm_sale($1::jsonb) r', [JSON.stringify({ idempotency_key: '55555555-5555-4555-8555-555555555555', lead_id: lead.id, new_client: { legal_name: 'Orbit Dental' }, lines: [{ service_code: 'crm-personalizado', unit_price: '3000' }] })])).r;
  assert.equal(r1.client_created, true);
  assert.equal(r1.contacts, 1, 'lead contact carried over');
  assert.equal((await one('select stage_id from crm_leads where id=$1', [lead.id])).stage_id, 'won');
  assert.equal((await one('select origin_lead_id from crm_clients where id=$1', [r1.client_id])).origin_lead_id, lead.id);
  // Second sale from the same lead without client_id resolves to the same client.
  const r2 = (await one('select crm_confirm_sale($1::jsonb) r', [JSON.stringify({ idempotency_key: '66666666-6666-4666-8666-666666666666', lead_id: lead.id, lines: [{ service_code: 'marketing-mensual', unit_price: '500' }], contacts: [{ full_name: 'Clara Prueba', email: 'CLARA@orbit.example.invalid' }, { full_name: 'Pablo Prueba', email: 'pablo@orbit.example.invalid' }] })])).r;
  assert.equal(r2.client_id, r1.client_id);
  assert.equal(r2.client_created, false);
  assert.equal(r2.contacts, 1, 'existing contact e-mail not duplicated');
  // Explicit existing client id.
  const r3 = (await one('select crm_confirm_sale($1::jsonb) r', [JSON.stringify({ idempotency_key: '77777777-7777-4777-8777-777777777777', client_id: r1.client_id, lines: [{ service_code: 'generacion-leads', unit_price: '400' }] })])).r;
  assert.equal(r3.client_id, r1.client_id);
  assert.equal(r3.projects, 0, 'sales department has no module project');
  assert.ok(r3.tasks >= 1, 'sales department still gets tasks');
  assert.equal(await n('select count(*) n from crm_clients'), 1);
  assert.equal(await n('select count(*) n from crm_sales where client_id=$1', [r1.client_id]), 3);
  assert.equal(await n('select count(*) n from crm_timeline where client_id=$1 and event_type=$2', [r1.client_id, 'client.linked']), 2);
});

test('tasks, alerts and automation switches', { timeout: 120000 }, async t => {
  const { db, as, one, n } = await setup();
  t.after(() => db.close());
  await as(MIGUEL);
  const task = await one(`insert into crm_tasks(title,assignee_id,priority,due_at) values('Preparar propuesta sintética',$1,'high',now() - interval '1 day') returning *`, [SAMUEL]);
  assert.equal(task.created_by, MIGUEL);
  await as(SAMUEL);
  assert.equal(await n("select count(*) n from crm_notifications where category='task'"), 1, 'assignment notified to Samuel');
  await db.query("insert into crm_task_comments(task_id,body) values($1,'Comentario sintético')", [task.id]);
  await db.query("update crm_tasks set status='blocked' where id=$1", [task.id]);
  await as(MIGUEL);
  assert.equal(await n("select count(*) n from crm_notifications where severity='urgent' and title like 'Tarea bloqueada%'"), 1, 'creator warned on block');
  // Overdue sweep is idempotent.
  await as(SAMUEL);
  assert.equal((await one('select crm_refresh_alerts() c')).c, 1);
  assert.equal((await one('select crm_refresh_alerts() c')).c, 0);
  assert.equal(await n("select count(*) n from crm_notifications where severity='urgent' and title like 'Tarea vencida%'"), 1);
  // Marking read: own notifications only.
  await db.query('update crm_notifications set read_at=now()');
  assert.equal(await n('select count(*) n from crm_notifications where read_at is null'), 0);
  await as(MIGUEL);
  assert.ok(await n('select count(*) n from crm_notifications where read_at is null') >= 1, 'Samuel cannot mark Miguel\'s inbox');
  await db.query("update crm_tasks set status='done' where id=$1", [task.id]);
  assert.ok((await one('select completed_at from crm_tasks where id=$1', [task.id])).completed_at);
  const changes = (await db.query("select from_state,to_state from crm_timeline where task_id=$1 and event_type='task.status_changed' order by id", [task.id])).rows;
  assert.deepEqual(changes, [{ from_state: 'todo', to_state: 'blocked' }, { from_state: 'blocked', to_state: 'done' }]);
  // Disable project automation: sale still routes work orders, but creates no projects/tasks.
  await db.query("update crm_automation_rules set enabled=false where key='sale_projects'");
  assert.equal(await n("select count(*) n from crm_audit where entity='crm_automation_rules'"), 1, 'rule change audited');
  const r = (await one('select crm_confirm_sale($1::jsonb) r', [JSON.stringify({ idempotency_key: '88888888-8888-4888-8888-888888888888', new_client: { legal_name: 'Synthetic Gym' }, lines: [{ service_code: 'desarrollo-web', unit_price: '900' }] })])).r;
  assert.equal(r.work_orders, 1);
  assert.equal(r.projects, 0);
  assert.equal(r.tasks, 0);
  await assert.rejects(db.query("update crm_automation_rules set key='x'"), /permission denied/);
  await assert.rejects(db.query(`update crm_service_catalog set task_template='[{"title":""}]'::jsonb where code='desarrollo-web'`), /check/);
});
