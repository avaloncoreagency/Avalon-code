'use strict';
// Staff portal end to end (mission "caso Ana") on SYNTHETIC data: PGlite + REST bridge + production build (`npm run build`).
// Runs with STAFF_BROWSER=1. Chromium emulation, NOT physical Safari. Real email/MFA delivery is out of scope here
// (that needs the isolated Supabase project and a test mailbox).
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), crypto = require('node:crypto');
const { spawn } = require('node:child_process'), { createServer } = require('node:http');

const MIGUEL = '00000000-0000-4000-8000-0000000000a1', SAMUEL = '00000000-0000-4000-8000-0000000000b2';
const ANA = '00000000-0000-4000-8000-0000000000c3', PEDRO = '00000000-0000-4000-8000-0000000000d4';
const DIR = process.env.EVIDENCE_DIR || 'evidence/staff-portal';

test('Staff portal: owners assign, Ana sees only her work, never owners\' private events; revoke and suspend', { timeout: 420000 }, async t => {
  if (process.env.STAFF_BROWSER !== '1') return t.skip('STAFF_BROWSER=1 required');
  const { PGlite } = require('@electric-sql/pglite'), { chromium } = require('playwright');
  const { startBridge } = require('./support/rest-bridge.cjs');
  fs.mkdirSync(DIR, { recursive: true });
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  const people = [[MIGUEL, 'miguel-qa@example.invalid'], [SAMUEL, 'samuel-qa@example.invalid'], [ANA, 'ana-qa@example.invalid'], [PEDRO, 'pedro-qa@example.invalid']];
  for (const [id, email] of people) await db.query('insert into auth.users(id,email) values($1,$2)', [id, email]);
  for (const f of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync('supabase/migrations/' + f, 'utf8'));
    if (f.startsWith('20261102053022')) await db.query("insert into agency_memberships(user_id,role) values($1,'owner'),($2,'owner'),($3,'operator'),($4,'operator')", [MIGUEL, SAMUEL, ANA, PEDRO]);
  }
  const as = u => db.exec(`reset role; set request.jwt.claim.sub='${u}'; set role authenticated;`);
  const one = async (q, p) => (await db.query(q, p)).rows[0];
  const at = (days, h) => { const d = new Date(Date.now() + days * 86400000); d.setUTCHours(h, 0, 0, 0); return d.toISOString(); };
  // Owners' private calendars: 5 for Miguel, 4 for Samuel.
  for (const [owner, n, who] of [[MIGUEL, 5, 'Miguel'], [SAMUEL, 4, 'Samuel']]) {
    await as(owner);
    for (let i = 0; i < n; i++) await db.query("insert into crm_events(title,owner_id,starts_at,ends_at,timezone,kind) values($1,$2,$3,$4,'America/New_York','meeting')",
      [`PRIVADO-${who}-${i + 1} reunión confidencial`, owner, at(i % 3, 15 + i), at(i % 3, 16 + i)]);
  }
  await as(MIGUEL);
  const leadA = (await one("insert into crm_leads(company,contact,source,owner_id,value) values('Lead Uno QA','Uno','QA',$1,8000) returning id", [MIGUEL])).id;
  const leadB = (await one("insert into crm_leads(company,contact,source,owner_id) values('Lead Dos QA','Dos','QA',$1) returning id", [MIGUEL])).id;
  await one("insert into crm_leads(company,contact,source,owner_id) values('Lead Secreto QA','Nadie','QA',$1) returning id", [MIGUEL]);
  await db.query("insert into staff_portal_access(user_id,active,job_title,can_create_events,can_create_casefiles,can_message) values($1,true,'seller',true,true,true),($2,true,'operator',false,false,false)", [ANA, PEDRO]);
  await db.query("insert into staff_contacts(user_id,display_name,is_listed) values($1,'Ana QA',true),($2,'Pedro QA',true) on conflict (user_id) do update set display_name=excluded.display_name, is_listed=true", [ANA, PEDRO]);
  // Ana is a seller: her leads come only from the exclusive assignment (the database mirrors it as a 'work' grant).
  await db.query('update crm_leads set owner_id=$1 where id in ($2,$3)', [ANA, leadA, leadB]);
  // Samuel's assignment (Miguel's is created through the UI below).
  await as(SAMUEL);
  await db.query("insert into staff_work_items(idempotency_key,kind,origin,assignee_id,title,instructions,due_at) values($1,'task','staff_assigned',$2,'Tarea de Samuel QA','Enviar resumen',$3)", [crypto.randomUUID(), ANA, at(1, 21)]);
  await db.exec('reset role');
  const client = (await one("insert into crm_clients(legal_name,source,owner_id,created_by) values('Cliente reservado QA','QA',$1,$1) returning id", [MIGUEL])).id;
  await db.query("update staff_portal_access set commercial_permissions=array['sales_history','commission_history'] where user_id=$1", [ANA]);
  const sale = (await one(`insert into crm_sales(sale_number,idempotency_key,correlation_id,client_id,sold_on,currency,subtotal,total,billing_mode,seller_id,created_by)
    values('VENTA-QA-ANA',gen_random_uuid(),gen_random_uuid(),$1,current_date,'USD',9876,9876,'one_time',$2,$3) returning id`, [client, ANA, MIGUEL])).id;
  await db.query(`insert into crm_commissions(sale_id,client_id,kind,beneficiary_id,basis,fixed_amount,currency,amount,agreed_by)
    values($1,$2,'sale',$3,'Synthetic written agreement',12.34,'USD',12.34,$4)`, [sale, client, ANA, MIGUEL]);

  const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url'), exp = Math.floor(Date.now() / 1000) + 3600;
  const users = new Map(), cookies = {};
  // Two-step verification is mandatory for employees: Ana and Pedro have a verified authenticator and an AAL2 session.
  const employees = new Set([ANA, PEDRO]);
  for (const id of employees) await db.query("insert into auth.mfa_factors(user_id,status) values($1,'verified')", [id]);
  for (const [id, email] of people) {
    const enrolled = employees.has(id);
    const factors = enrolled ? [{ id: crypto.randomUUID(), factor_type: 'totp', status: 'verified', friendly_name: 'QA', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }] : [];
    const user = { id, email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, identities: [], factors, created_at: '2026-01-01T00:00:00Z' };
    const token = enc({ alg: 'HS256', typ: 'JWT' }) + '.' + enc({ sub: id, exp, role: 'authenticated', aal: enrolled ? 'aal2' : 'aal1', amr: [{ method: enrolled ? 'totp' : 'password', timestamp: exp - 3600 }] }) + '.' + enc('synthetic-' + id);
    users.set(token, user);
    cookies[id] = 'base64-' + Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'synthetic', token_type: 'bearer', expires_in: 3600, expires_at: exp, user })).toString('base64url');
  }
  const bridge = await startBridge(db, { users }); t.after(() => bridge.close());
  const reservation = createServer(); await new Promise(r => reservation.listen(0, '127.0.0.1', r));
  const port = reservation.address().port; await new Promise(r => reservation.close(r));
  const origin = 'http://localhost:' + port;
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '-p', String(port)], {
    env: { ...process.env, APP_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: bridge.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-key', AVALON_RADAR_EXTERNAL_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; child.stdout.on('data', b => log += b); child.stderr.on('data', b => log += b);
  t.after(() => require('./support/stop-child.cjs')(child));
  for (let i = 0; i < 150; i++) { try { if ((await fetch(origin + '/login')).status < 500) break; } catch {} if (i === 149) assert.fail(log); await new Promise(r => setTimeout(r, 100)); }
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  t.after(() => browser.close());
  const open = async (id, width = 1440) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 768 });
    await ctx.addCookies([{ name: 'sb-127-auth-token', value: cookies[id], url: origin }, { name: 'avalon-lang', value: 'es', url: origin }]);
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(20000);
    return { ctx, page, errors };
  };

  // 1. Miguel assigns an appointment linked to an authorised lead, from /admin/staff.
  const m = await open(MIGUEL);
  await m.page.goto(origin + '/admin/staff');
  const assign = m.page.getByRole('form', { name: 'Asignar actividad' });
  await assign.waitFor();
  const assignmentSections = ['staff-clients', 'staff-work'];
  for (const sectionId of assignmentSections) {
    const select = m.page.locator(`section[aria-labelledby="${sectionId}"] select[name="employee_id"]`);
    assert.deepEqual(await select.selectOption({ label: 'Ana QA' }), [ANA]);
  }
  // Lead sharing is for non-seller staff; sellers receive leads only through the exclusive assignment.
  assert.equal(await m.page.locator(`section[aria-labelledby="staff-leads"] select[name="employee_id"] option[value="${ANA}"]`).count(), 0);
  assert.deepEqual(await m.page.locator('section[aria-labelledby="staff-leads"] select[name="employee_id"]').selectOption({ label: 'Pedro QA' }), [PEDRO]);
  assert.deepEqual(await m.page.locator('section[aria-labelledby="seller-assign"] select[name="seller_id"]').selectOption({ label: 'Ana QA' }), [ANA]);
  const anaLeadRows = m.page.locator('section[aria-labelledby="staff-leads"] li').filter({ hasText: 'vendedor asignado' });
  assert.equal(await anaLeadRows.count(), 2);
  assert.equal(await anaLeadRows.getByRole('button', { name: 'Revocar lead' }).count(), 0, 'a seller\'s lead is returned, not revoked');
  const roster = m.page.getByRole('region', { name: 'Control de empleados' });
  const anaCard = roster.locator('article').filter({ hasText: 'ana-qa@example.invalid' });
  assert.equal(await anaCard.getByLabel('Nombre visible a compañeros').inputValue(), 'Ana QA');
  await assign.locator('select[name="kind"]').selectOption('appointment');
  await assign.locator('select[name="priority"]').selectOption('high');
  await assign.getByLabel('Título').fill('Cita de Miguel QA con Lead Uno');
  await assign.locator('select[name="lead_id"]').selectOption(leadA);
  await assign.getByLabel('Instrucciones').fill('Presentar propuesta mensual');
  await assign.getByRole('button', { name: 'Asignar' }).click();
  await m.page.getByText('Actividad asignada. Solo esa persona la ve.').waitFor();
  await m.page.locator('[data-assignment]').filter({ hasText: 'Cita de Miguel QA con Lead Uno' }).waitFor();
  await m.page.screenshot({ path: `${DIR}/owner-staff-1440.png`, fullPage: true });
  assert.deepEqual(m.errors, []);

  // The CRM inbox uses the same Staff message store and participant permissions.
  const messagesPath = '/admin/workspace/crm/messages';
  const messageBody = 'Confirmar seguimiento asignado QA';
  await m.page.goto(origin + messagesPath);
  await m.page.locator('select[name="recipient_id"]').selectOption(ANA);
  await m.page.getByLabel('Mensaje privado').fill(messageBody);
  await m.page.getByRole('button', { name: 'Enviar mensaje privado' }).click();
  await m.page.getByText('Mensaje enviado.', { exact: true }).waitFor();
  await m.page.getByText(messageBody, { exact: true }).waitFor();
  const s = await open(SAMUEL);
  await s.page.goto(origin + messagesPath);
  await s.page.getByRole('heading', { name: 'Mis conversaciones' }).waitFor();
  assert.equal(await s.page.getByText(messageBody, { exact: true }).count(), 0);
  await s.ctx.close();

  // 2. Ana: sees her two assignments, never the 9 private events or the unassigned lead.
  const a = await open(ANA);
  await a.page.goto(origin + '/staff?view=month');
  await a.page.getByRole('heading', { name: 'Mi calendario' }).waitFor();
  await a.page.getByText(messageBody, { exact: true }).waitFor();
  const commercial = a.page.getByRole('region', { name: 'Mis ventas y comisiones' });
  await commercial.getByText('VENTA-QA-ANA', { exact: true }).first().waitFor();
  await commercial.getByText(/Comisión acordada.*12\.34/).waitFor();
  assert.doesNotMatch(await commercial.innerText(), /Cliente reservado QA|9,?876|Synthetic written agreement/);
  const html = await a.page.content();
  assert.ok(!/PRIVADO-|confidencial/.test(html), 'no owner private event leaks into the page');
  assert.ok(!html.includes('Lead Secreto QA'), 'no unassigned lead');
  assert.ok(!/8,?000/.test(await a.page.locator('section[aria-labelledby="staff-leads"]').textContent()), 'no lead value in the seller view');
  for (const title of ['Cita de Miguel QA con Lead Uno', 'Tarea de Samuel QA']) await a.page.locator('[data-task]').filter({ hasText: title }).waitFor();
  const kpi = async label => Number(await a.page.locator(`[data-kpi="${label}"] strong`).textContent());
  assert.equal(await kpi('Leads asignados'), 2);
  assert.equal(await kpi('Actividades abiertas'), 2);
  // 3. Ana creates her own follow-up, saves a note and completes Samuel's task with evidence.
  await a.page.getByText('Nueva actividad propia').click();
  const own = a.page.getByRole('form', { name: 'Nueva actividad propia' });
  await own.getByLabel('Título').fill('Seguimiento propio QA');
  await own.locator('select[name="lead_id"]').selectOption(leadA);
  await own.getByRole('button', { name: 'Guardar actividad' }).click();
  await a.page.getByText('Actividad guardada.').waitFor();
  await a.page.locator('[data-task]').filter({ hasText: 'Seguimiento propio QA' }).waitFor();
  const note = a.page.getByRole('form', { name: 'Nueva nota' });
  await note.getByLabel('Nota', { exact: true }).fill('Nota personal de Ana QA');
  await note.getByRole('button', { name: 'Guardar nota' }).click();
  await a.page.getByText('Nota guardada.').waitFor();
  const samTask = a.page.getByRole('form', { name: 'Actualizar Tarea de Samuel QA' });
  await samTask.locator('select[name="status"]').selectOption('done');
  await samTask.locator('input[name="completion_note"]').fill('Resumen enviado por email');
  await samTask.getByRole('button', { name: 'Guardar' }).click();
  await a.page.getByText('Actividad guardada.').waitFor();
  assert.equal(await kpi('Completadas (30 días)'), 1, 'KPI follows the real record');
  assert.equal((await one("select status from staff_work_items where title='Tarea de Samuel QA'")).status, 'done');
  await a.page.screenshot({ path: `${DIR}/ana-portal-1440.png`, fullPage: true });
  await a.page.goto(origin + '/staff/mfa');
  await a.page.getByText('Ya tienes un autenticador verificado.').waitFor();
  // Ana cannot open the owners' area.
  await a.page.goto(origin + '/admin/staff');
  assert.ok(!/\/admin\/staff$/.test(new URL(a.page.url()).pathname) || !(await a.page.content()).includes('Asignar tarea o cita'), 'no owner area for an employee');
  assert.deepEqual(a.errors, []);

  // 4. Pedro sees nothing of Ana's work or notes.
  const p = await open(PEDRO);
  await p.page.goto(origin + '/staff');
  await p.page.getByRole('heading', { name: 'Mi calendario' }).waitFor();
  const ph = await p.page.content();
  for (const leak of ['Cita de Miguel QA', 'Tarea de Samuel QA', 'Seguimiento propio QA', 'Nota personal de Ana', 'PRIVADO-', messageBody, 'VENTA-QA-ANA']) assert.ok(!ph.includes(leak), `Pedro must not see "${leak}"`);
  await p.ctx.close();

  // 5. Owner revokes one lead → gone from Ana's list; owner suspends Ana → no operational access.
  await m.page.goto(origin + '/admin/staff');
  await m.page.locator('section[aria-labelledby="staff-leads"] li').filter({ hasText: 'Lead Dos QA' }).getByRole('button', { name: 'Devolver a la dirección' }).click();
  await m.page.getByText('Lead devuelto a la dirección.').waitFor();
  assert.equal((await one('select owner_id from crm_leads where id=$1', [leadB])).owner_id, MIGUEL);
  await a.page.goto(origin + '/staff');
  await a.page.getByRole('heading', { name: 'Mis leads' }).waitFor();
  assert.ok(!(await a.page.locator('section[aria-labelledby="staff-leads"]').textContent()).includes('Lead Dos QA'));
  // Responsive: no horizontal page scroll on the staff portal and owner page.
  for (const width of [320, 375, 390, 430, 768]) {
    for (const [who, route] of [[ANA, '/staff?view=month'], [MIGUEL, '/admin/staff']]) {
      const v = await open(who, width); await v.page.goto(origin + route); await v.page.locator('main, [class*="hud"]').first().waitFor();
      const overflow = await v.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `${route} at ${width}px: overflow ${overflow}px`);
      if (width === 390) await v.page.screenshot({ path: `${DIR}/${who === ANA ? 'ana' : 'owner'}-390.png`, fullPage: true });
      assert.deepEqual(v.errors, [], `${route} at ${width}px`); await v.ctx.close();
    }
  }
  await as(MIGUEL); await db.query('update staff_portal_access set active=false where user_id=$1', [ANA]); await db.exec('reset role');
  await a.page.goto(origin + '/staff');
  await a.page.waitForURL(/\/admin\/login|\/login/);
  await a.page.goto(origin + '/staff/mfa');
  await a.page.waitForURL(/\/admin\/login|\/login/);
  await m.page.goto(origin + '/admin/staff');
  await anaCard.getByRole('heading', { name: 'Ana QA' }).waitFor();
  assert.equal(await anaCard.getByLabel('Nombre visible a compañeros').inputValue(), 'Ana QA');
  assert.equal(await m.page.locator(`select[name="employee_id"] option[value="${ANA}"]`).count(), 0);
  await a.ctx.close(); await m.ctx.close();
});
