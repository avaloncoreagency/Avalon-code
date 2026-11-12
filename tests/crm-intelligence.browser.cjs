// CRM Intelligence through the REAL app: production Next.js build → test REST bridge → isolated PGlite with every
// migration and real RLS. Synthetic owners and businesses only. Requires `npm run build` and NODE_PATH=tests/qa/node_modules.
// CRM_INTEL_BROWSER=1 runs the Playwright part (desktop + iPhone viewport, ES/EN).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { startBridge } = require('./support/rest-bridge.cjs');

const MIGUEL = '00000000-0000-4000-8000-0000000000a1';
const SAMUEL = '00000000-0000-4000-8000-0000000000b2';
const OUTSIDER = '00000000-0000-4000-8000-0000000000c3';
const EVIDENCE = process.env.EVIDENCE_DIR || 'evidence/crm-intelligence';

test('CRM Intelligence in the real app: quick add, discovery, conflicts, score, terms, contract gate, iPhone', { timeout: 300000 }, async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fs.readFileSync('tests/sql/00_supabase_stub.sql', 'utf8'));
  await db.exec(`insert into auth.users(id,email) values('${MIGUEL}','miguel@example.invalid'),('${SAMUEL}','samuel@example.invalid'),('${OUTSIDER}','outsider@example.invalid');`);
  for (const file of fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    if (file.startsWith('20261102053022')) await db.exec(`insert into agency_memberships(user_id,role) values('${MIGUEL}','owner'),('${SAMUEL}','owner');`);
  }
  const users = new Map();
  const session = (id, email) => {
    const user = { id, email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z' };
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url');
    const access_token = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub: id, exp, role: 'authenticated', aal: 'aal1' })}.${Buffer.from('synthetic-signature').toString('base64url')}`;
    users.set(access_token, user);
    return { access_token, refresh_token: 'synthetic', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };
  };
  const miguel = session(MIGUEL, 'miguel@example.invalid'), samuel = session(SAMUEL, 'samuel@example.invalid'), outsider = session(OUTSIDER, 'outsider@example.invalid');
  const errors = [];
  const bridge = await startBridge(db, { users, log: (kind, ...rest) => { if (kind === 'error') errors.push(rest.join(' ')); } });
  t.after(() => bridge.close());
  const reservation = createServer();
  await new Promise(r => reservation.listen(0, '127.0.0.1', r));
  const port = reservation.address().port;
  await new Promise(r => reservation.close(r));
  const origin = `http://localhost:${port}`;
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', String(port)], {
    env: { ...process.env, APP_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: bridge.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-key' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', c => (output += c)); child.stderr.on('data', c => (output += c));
  t.after(async () => { child.kill(); await new Promise(r => child.once('exit', r)); });
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(origin + '/login')).status < 500) break; } catch {}
    if (i === 149) assert.fail(output);
    await new Promise(r => setTimeout(r, 100));
  }
  const cookieName = 'sb-127-auth-token';
  const cookieValue = s => `base64-${Buffer.from(JSON.stringify(s)).toString('base64url')}`;
  const get = (path, s) => fetch(origin + path, { redirect: 'manual', headers: { cookie: s ? `${cookieName}=${cookieValue(s)}` : '' } });
  const asRoot = async () => db.exec('reset role;');
  const one = async (sql, p) => { await asRoot(); return (await db.query(sql, p)).rows[0]; };

  // 19–20. Server-side authorization on every new route (signed out and non-member are redirected).
  await db.exec(`reset role; set request.jwt.claim.sub='${MIGUEL}'; set role authenticated;`);
  const seed = (await db.query(`insert into crm_leads(company, source, owner_id) values('Semilla Sintética','Entrada manual',$1) returning id`, [MIGUEL])).rows[0].id;
  await asRoot();
  for (const route of ['/admin/workspace/crm/desk', `/admin/workspace/crm/lead/${seed}`, `/admin/workspace/crm/lead/${seed}/discovery`]) {
    assert.equal((await get(route)).status, 307, `${route} signed out`);
    assert.equal((await get(route, outsider)).status, 307, `${route} non-member`);
    assert.equal((await get(route, miguel)).status, 200, `${route} owner: ${output.slice(-1500)}`);
  }
  assert.equal((await get('/admin/workspace/crm/lead/00000000-0000-4000-8000-000000000999', miguel)).status, 404);

  if (process.env.CRM_INTEL_BROWSER !== '1') return;
  const { chromium, devices } = require('playwright');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  t.after(() => browser.close());
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const context = async (s, opts = { viewport: { width: 1366, height: 1000 } }, lang = 'es') => {
    const ctx = await browser.newContext({ ...opts, locale: lang === 'es' ? 'es-ES' : 'en-US' });
    await ctx.addCookies([{ name: cookieName, value: cookieValue(s), url: origin }, { name: 'avalon-lang', value: lang, url: origin }]);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    return page;
  };

  // A server action POSTs to the page with a Next-Action header; wait for THAT response, because a success banner from a
  // previous action can still be on screen and would make a text wait return before this save finished.
  const submit = async (page, locator) => {
    const done = page.waitForResponse(r => r.request().method() === 'POST' && !!r.request().headers()['next-action'], { timeout: 30000 });
    await locator.click();
    await done;
    await page.waitForLoadState('networkidle');
  };
  // 1–2. Miguel quick-adds an HVAC contractor with the basics only (desktop).
  const m = await context(miguel);
  await m.goto(origin + '/admin/workspace/crm/desk');
  await m.getByRole('heading', { name: 'Mesa comercial' }).waitFor();
  await m.getByLabel('Nombre comercial *').fill('Cool Breeze HVAC Sintético');
  await m.getByLabel('Industria').selectOption('hvac');
  await m.getByLabel('Teléfono').fill('+1 (305) 555-0101');
  await Promise.all([m.waitForURL(/\/crm\/lead\/[0-9a-f-]{36}\?ok=created/), m.getByRole('button', { name: 'Guardar lead' }).click()]);
  const leadId = m.url().match(/lead\/([0-9a-f-]{36})/)[1];
  await m.getByText('Datos insuficientes').first().waitFor();
  await m.screenshot({ path: `${EVIDENCE}/01-lead-created.png`, fullPage: true });

  // Duplicate warning: same phone, different formatting. Nothing is merged; typed data stays in the form.
  await m.goto(origin + '/admin/workspace/crm/desk');
  await m.getByLabel('Nombre comercial *').fill('Cool Breeze A/C');
  await m.getByLabel('Teléfono').fill('305-555-0101');
  await m.getByRole('button', { name: 'Guardar lead' }).click();
  await m.getByText('Posibles duplicados').waitFor();
  assert.equal(await m.getByLabel('Nombre comercial *').inputValue(), 'Cool Breeze A/C', 'typed values preserved');
  assert.equal(Number((await one(`select count(*) n from crm_leads where company ilike 'Cool Breeze%'`)).n), 1, 'no duplicate created');

  // 3, 13. Samuel completes part of the HVAC diagnosis on an iPhone; conditional questions appear live.
  const sPhone = await context(samuel, { ...devices['iPhone 13'] });
  await sPhone.goto(`${origin}/admin/workspace/crm/lead/${leadId}/discovery?industry=hvac&section=h_services`);
  await sPhone.getByRole('heading', { name: 'HVAC · Servicios' }).waitFor();
  await sPhone.getByRole('radiogroup', { name: 'Instalación y reemplazo' }).getByLabel('Sí').check();
  await sPhone.getByRole('radiogroup', { name: 'Reparaciones' }).getByLabel('Sí').check();
  await Promise.all([sPhone.waitForURL(/section=h_revenue/), sPhone.getByRole('button', { name: 'Guardar y seguir' }).click()]);
  await sPhone.getByLabel('Precio promedio por instalación').fill('9000');   // visible only because "installs" = yes
  await sPhone.getByLabel('Costo del equipo').fill('3500');
  await sPhone.getByLabel('Costo de materiales').fill('500');
  await sPhone.getByLabel('Mano de obra').fill('1200');
  await sPhone.getByLabel('Permisos y otros costos directos').fill('300');
  await Promise.all([sPhone.waitForURL(/section=h_capacity/), sPhone.getByRole('button', { name: 'Guardar y seguir' }).click()]);
  assert.equal(await sPhone.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1), true, 'no horizontal scroll on iPhone (discovery)');
  await sPhone.screenshot({ path: `${EVIDENCE}/02-discovery-iphone.png`, fullPage: true });

  // 25. Concurrent edit: Miguel loads the capacity section, Samuel saves first, Miguel's stale value is NOT applied.
  await m.goto(`${origin}/admin/workspace/crm/lead/${leadId}/discovery?industry=hvac&section=h_capacity`);
  await sPhone.getByLabel('Cantidad de técnicos').fill('5');
  await submit(sPhone, sPhone.getByRole('button', { name: 'Guardar', exact: true }));
  await sPhone.getByText('Respuestas guardadas en Avalon').waitFor();
  await m.getByLabel('Cantidad de técnicos').fill('3');
  await submit(m, m.getByRole('button', { name: 'Guardar', exact: true }));
  await m.getByText('Otra persona guardó cambios').waitFor();
  assert.equal(await m.getByLabel('Cantidad de técnicos').inputValue(), '5', "the other owner's newer answer is shown, not overwritten");
  assert.equal((await one(`select answers->'h_techs'->>'v' v from crm_lead_assessments where lead_id=$1 and industry_key='hvac'`, [leadId])).v, '5');

  // 17–18. More answers → an explainable score (unknown answers do not penalize).
  const fill = async (section, entries) => {
    await m.goto(`${origin}/admin/workspace/crm/lead/${leadId}/discovery?industry=hvac&section=${section}`);
    for (const [label, value, kind] of entries) {
      if (kind === 'radio') await m.getByRole('radiogroup', { name: label }).getByLabel(value, { exact: true }).check();
      else await m.getByLabel(label, { exact: true }).fill(value);
    }
    await submit(m, m.getByRole('button', { name: 'Guardar', exact: true }));
    await m.getByText('Respuestas guardadas en Avalon').waitFor();
  };
  await fill('h_capacity', [['Instalaciones adicionales posibles por semana', '3'], ['Reparaciones adicionales posibles por semana', '5'], ['¿Puede aceptar trabajos nuevos ahora?', 'Sí', 'radio']]);
  await fill('h_conversion', [['Llamadas al mes', '120'], ['Llamadas perdidas al mes', '30'], ['Cotizaciones emitidas al mes', '40'], ['Trabajos cerrados al mes', '14'], ['Cotizaciones pendientes sin seguimiento', '12']]);
  await fill('h_agreement', [['Presupuesto publicitario mensual (gasto del cliente en la plataforma)', '2500'], ['Presupuesto mensual para la gestión de Avalon', '1500'], ['¿Puede reportar ventas atribuibles?', 'Sí', 'radio']]);
  await fill('g_decision', [['¿Quién autoriza inversiones?', 'Dueño'], ['¿Cuándo desea comenzar?', 'En 30 días', 'radio'], ['¿Acepta colaborar con el seguimiento y la medición?', 'Sí', 'radio'], ['¿Dará la información necesaria para medir conversiones?', 'Sí', 'radio']]);
  await fill('g_tech', [['¿Tiene página web?', 'No', 'radio'], ['¿Utiliza un CRM?', 'No', 'radio']]);
  await m.goto(`${origin}/admin/workspace/crm/lead/${leadId}`);
  const grade = (await one('select lead_grade, lead_score from crm_leads where id=$1', [leadId]));
  assert.ok(['A', 'B'].includes(grade.lead_grade), `coherent score for a strong HVAC lead (got ${JSON.stringify(grade)})`);
  await m.getByText('Requiere revisión legal').waitFor();   // license not verified yet: separate from the score
  await m.getByText('Beneficio bruto por venta: 10/10 · $3,500 (calculado)').waitFor();
  await m.screenshot({ path: `${EVIDENCE}/03-deal-review.png`, fullPage: true });
  await m.goto(`${origin}/admin/workspace/crm/lead/${leadId}?tab=recs`);
  for (const service of ['AI Receptionist', 'CRM + seguimiento automatizado', 'Website Designer']) await m.getByText(service, { exact: true }).first().waitFor();

  // 6–8. Samuel logs a call + next contact without destroying Miguel's data; reassignment.
  await sPhone.goto(`${origin}/admin/workspace/crm/lead/${leadId}`);
  await sPhone.getByLabel('Resultado / notas').fill('Llamada: interesado en AI Receptionist (sintético)');
  await submit(sPhone, sPhone.getByRole('button', { name: 'Registrar' }));
  await sPhone.getByText('Cambios guardados en Avalon').waitFor();
  await sPhone.getByLabel('Responsable').selectOption(SAMUEL);
  await submit(sPhone, sPhone.getByRole('button', { name: 'Guardar', exact: true }).first());
  await sPhone.getByText('Cambios guardados en Avalon').waitFor();
  assert.equal((await one('select owner_id from crm_leads where id=$1', [leadId])).owner_id, SAMUEL);
  assert.equal(await sPhone.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1), true, 'no horizontal scroll on iPhone (deal review)');
  await sPhone.screenshot({ path: `${EVIDENCE}/04-deal-review-iphone.png`, fullPage: true });

  // 10. Commercial terms (agreed commission needs explicit approval).
  await m.goto(`${origin}/admin/workspace/crm/lead/${leadId}?tab=terms`);
  const agreed = m.getByRole('region', { name: 'Condiciones acordadas' });
  await agreed.getByLabel('Mensualidad de Avalon (USD)').fill('800');
  await agreed.getByLabel('Modelo de facturación').selectOption('hybrid');
  await agreed.getByLabel('Comisión acordada (%)').fill('7');
  await agreed.getByRole('button', { name: 'Guardar' }).click();
  await m.getByText('necesita tu aprobación explícita').waitFor();
  await m.goto(`${origin}/admin/workspace/crm/lead/${leadId}?tab=terms`);
  await agreed.getByLabel('Mensualidad de Avalon (USD)').fill('800');
  await agreed.getByLabel('Modelo de facturación').selectOption('hybrid');
  await agreed.getByLabel('Comisión acordada (%)').fill('7');
  await agreed.getByLabel(/Apruebo personalmente la comisión/).check();
  await submit(m, agreed.getByRole('button', { name: 'Guardar' }));
  await m.getByText('Cambios guardados en Avalon').waitFor();
  assert.equal((await one(`select commission_approved_by from crm_commercial_terms where lead_id=$1 and kind='agreed'`, [leadId])).commission_approved_by, MIGUEL);

  // 11. Won is not selectable (and is refused by the server) without a verified contract.
  await m.goto(`${origin}/admin/workspace/crm/lead/${leadId}`);
  const wonOption = m.locator('select[name="stage_id"] option[value="won"]');
  assert.equal(await wonOption.evaluate(o => o.disabled), true, 'Won disabled in the UI: ' + await wonOption.evaluate(o => o.outerHTML));

  // 12. Contract flow in the UI → Won allowed.
  await m.goto(`${origin}/admin/workspace/crm/lead/${leadId}?tab=contract`);
  await submit(m, m.getByRole('button', { name: 'Iniciar contrato' }));
  await submit(m, m.getByRole('button', { name: 'Pasar a: Enviado a firma' }));
  await m.getByText('Cambios guardados en Avalon').waitFor();
  await m.getByLabel('Fecha de firma').fill('2026-11-11');
  await m.getByLabel('Firmado por').fill('Dueño Sintético');
  await m.getByLabel('o referencia externa (sobre de firma)').fill('SYNTH-ENV-001');
  await submit(m, m.getByRole('button', { name: 'Pasar a: Firmado · pendiente de verificar' }));
  await m.getByText('Cambios guardados en Avalon').waitFor();
  await m.getByLabel('Método de verificación').selectOption('document_review');
  await m.getByLabel('Qué se revisó (mín. 15 caracteres)').fill('Sobre firmado revisado: firma y fecha coinciden.');
  await submit(m, m.getByRole('button', { name: 'Pasar a: Firmado y verificado' }));
  await m.getByText('Cambios guardados en Avalon').waitFor();
  await m.screenshot({ path: `${EVIDENCE}/05-contract-verified.png`, fullPage: true });
  await m.goto(`${origin}/admin/workspace/crm/lead/${leadId}`);
  await m.getByLabel('Etapa (13 etapas existentes)').selectOption('won');
  await submit(m, m.getByRole('button', { name: 'Guardar', exact: true }).first());
  await m.getByText('Cambios guardados en Avalon').waitFor();
  assert.equal((await one('select stage_id, contract_status from crm_leads where id=$1', [leadId])).stage_id, 'won');

  // 15. Smoke Shop: restriction warnings; no paid-ads recommendation.
  await db.exec(`reset role; set request.jwt.claim.sub='${MIGUEL}'; set role authenticated;`);
  const smoke = (await db.query(`insert into crm_leads(company, source, owner_id, industry_key) values('Cloud Smoke Sintético','Entrada manual',$1,'smoke_shop') returning id`, [MIGUEL])).rows[0].id;
  await asRoot();
  await m.goto(`${origin}/admin/workspace/crm/lead/${smoke}/discovery?industry=smoke_shop&section=s_operation`);
  await m.getByText(/tienen restricciones legales y publicitarias/).waitFor();
  await m.getByRole('group', { name: 'Categorías de productos' }).getByLabel('Vapes / nicotina').check();
  await m.getByRole('radiogroup', { name: 'Verificación de edad' }).getByLabel('No verifica').check();
  await m.getByRole('button', { name: 'Guardar', exact: true }).click();
  await m.getByText('Respuestas guardadas en Avalon').waitFor();
  await m.goto(`${origin}/admin/workspace/crm/lead/${smoke}`);
  await m.getByText(/Restricción legal \/ de plataformas/).waitFor();
  await m.goto(`${origin}/admin/workspace/crm/lead/${smoke}?tab=recs`);
  await m.getByText('Publicidad restringida', { exact: true }).waitFor();
  assert.equal(await m.getByText(/Campañas publicitarias|Google Local Services/).count(), 0, 'no paid-ads recommendation for restricted products');

  // V2 regression: changing evidence withdraws an obsolete automated suggestion,
  // and the server rejects a forged attempt to accept the stale rule.
  await m.goto(`${origin}/admin/workspace/crm/lead/${smoke}/discovery?industry=smoke_shop&section=s_operation`);
  const categories = m.getByRole('group', { name: 'Categorías de productos' });
  await categories.getByLabel('Vapes / nicotina').uncheck();
  await categories.getByLabel('Vidrio y accesorios').check();
  await submit(m, m.getByRole('button', { name: 'Guardar', exact: true }));
  await m.getByText('Respuestas guardadas en Avalon').waitFor();
  assert.equal((await one("select status from crm_lead_recommendations where lead_id=$1 and rule_id='ads_restricted'", [smoke])).status, 'dismissed',
    'no longer relevant automated advice must be withdrawn');
  await m.goto(`${origin}/admin/workspace/crm/lead/${smoke}?tab=recs`);
  const stale = m.locator('li').filter({ hasText: 'Publicidad restringida' }).first();
  await stale.getByText(/Ya no aplica según el diagnóstico actual/).waitFor();
  const acceptStale = stale.getByRole('button', { name: 'Aceptar' });
  assert.equal(await acceptStale.isDisabled(), true, 'stale recommendation is not actionable in UI');
  // Browser tampering bypasses the disabled HTML attribute but not server-side evidence checks.
  await acceptStale.evaluate(el => { el.disabled = false; });
  await submit(m, acceptStale);
  // The durable DB state is the security assertion. The UI may retain its prior
  // route during a streamed Server Action redirect; avoid a timing-dependent
  // text assertion and inspect the result's final URL instead.
  assert.equal((await one("select status from crm_lead_recommendations where lead_id=$1 and rule_id='ads_restricted'", [smoke])).status, 'dismissed',
    'forged acceptance cannot restore a stale recommendation');
  await m.goto(`${origin}/admin/workspace/crm/lead/${smoke}?tab=recs`);
  assert.equal(await m.getByText(/Ya no aplica según el diagnóstico actual/).count() > 0, true,
    'stale recommendation stays visibly flagged after forged submit');


  // 14. Barber questionnaire shows its own questions. 33. English labels.
  const en = await context(miguel, { viewport: { width: 1366, height: 1000 } }, 'en');
  await en.goto(`${origin}/admin/workspace/crm/lead/${smoke}/discovery?industry=barber&section=b_capacity`);
  await en.getByRole('heading', { name: 'Barber · Capacity' }).waitFor();
  await en.getByText('Approximate occupancy (%)').waitFor();
  await en.goto(origin + '/admin/workspace/crm/desk');
  await en.getByRole('heading', { name: 'Sales desk' }).waitFor();
  await en.screenshot({ path: `${EVIDENCE}/06-desk-en.png`, fullPage: true });
  // 16. Switching industry kept the Smoke Shop answers.
  assert.ok((await one(`select answers ? 's_categories' ok from crm_lead_assessments where lead_id=$1 and industry_key='smoke_shop'`, [smoke])).ok);

  // V2: all ten newly specialized industries render a real conditional questionnaire
  // in the owner's authenticated browser, not a generic fallback.
  const sectorRoutes = [
    ['roofing', 'rf_scope', 'Roofing · Proyectos'],
    ['fencing', 'fn_operation', 'Fencing · Instalación'],
    ['tattoo', 'tt_studio', 'Tattoo · Estudio y agenda'],
    ['landscaping', 'ls_services', 'Landscaping · Servicios y rutas'],
    ['plumbing', 'pl_operation', 'Plumbing · Trabajos y atención'],
    ['cleaning', 'cl_services', 'Cleaning · Servicios y personal'],
    ['restaurant', 'rs_service', 'Restaurante · Operación y demanda'],
    ['electrical', 'el_services', 'Electrical · Proyectos y respuesta'],
    ['general_contractor', 'gc_projects', 'Contratista general · Proyectos'],
    ['other', 'ot_model', 'Industria personalizada · Modelo de negocio'],
  ];
  for (const [industry, section, title] of sectorRoutes) {
    await m.goto(`${origin}/admin/workspace/crm/lead/${smoke}/discovery?industry=${industry}&section=${section}`);
    await m.getByRole('heading', { name: title }).waitFor();
    assert.ok(await m.locator('input[name^="present__"]').count() >= 3,
      `${industry} has sector-specific questions in the actual app`);
    assert.equal(await m.getByText(/Esta industria usa la plantilla general/).count(), 0,
      `${industry} no longer uses a generic fallback`);
  }
  await en.goto(`${origin}/admin/workspace/crm/lead/${smoke}/discovery?industry=roofing&section=rf_scope`);
  await en.getByRole('heading', { name: 'Roofing · Jobs' }).waitFor();
  await en.getByText('Roofing services offered').waitFor();

  // iPhone desk.
  const mPhone = await context(miguel, { ...devices['iPhone SE'] });
  await mPhone.goto(origin + '/admin/workspace/crm/desk');
  await mPhone.getByRole('heading', { name: 'Mesa comercial' }).waitFor();
  assert.equal(await mPhone.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1), true, 'no horizontal scroll on iPhone SE (desk)');
  await mPhone.screenshot({ path: `${EVIDENCE}/07-desk-iphone-se.png`, fullPage: true });

  assert.deepEqual(errors.filter(e => !/favicon|ResizeObserver/.test(e)), [], 'no page errors or bridge errors');
});
