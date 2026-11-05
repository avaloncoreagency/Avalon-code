// Avalon managers — deterministic, verifiable executors. Every result lists the exact commands/queries that produced it
// and their exit status; KENJI rejects any result without that evidence. Nothing here touches production, spends money
// or contacts anyone: the database work happens on a throwaway PostgreSQL (PGlite) built from the repository migrations.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const run = (cmd, args, opt = {}) => {
  const t0 = Date.now();
  const r = cp.spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, NODE_TEST_CONTEXT: undefined }, ...opt });
  const out = (r.stdout || '') + (r.stderr || '');
  const tap = Object.fromEntries([...out.matchAll(/^# (tests|pass|fail) (\d+)/gm)].map(m => [m[1], Number(m[2])]));
  return { cmd: [cmd, ...args].join(' '), exit: r.status, ok: r.status === 0, ms: Date.now() - t0, tap, tail: out.trim().split('\n').slice(-3).join(' | ').slice(0, 300) };
};
const finding = (severity, text) => ({ severity, text: String(text).slice(0, 300) });

/** Names of manager results that do not cite executed checks with an exit status (they "look" done but prove nothing). */
function verifyEvidence(others) {
  return Object.entries(others || {}).filter(([, r]) => !(r && Array.isArray(r.checks) && r.checks.length > 0 &&
    r.checks.every(c => typeof c.exit === 'number' && typeof c.cmd === 'string' && c.cmd.length > 0))).map(([k]) => k);
}

let pgPromise = null;
/** One throwaway PostgreSQL with every migration applied (synthetic; shared by SHIN and HARU). */
function migratedDb(root) {
  if (!pgPromise) pgPromise = (async () => {
    const { PGlite } = require('@electric-sql/pglite');
    const db = new PGlite();
    await db.exec(fs.readFileSync(path.join(root, 'tests/sql/00_supabase_stub.sql'), 'utf8'));
    const files = fs.readdirSync(path.join(root, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort();
    for (const f of files) await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations', f), 'utf8'));
    return { db, migrations: files.length };
  })();
  return pgPromise;
}

// SHIN — security: RLS on every public table, anon privileges, SECURITY DEFINER search_path, secrets in client code,
// workflow permissions, security regression tests and the policy kill switch.
async function shin({ root, policy }) {
  const checks = [], findings = [];
  const { db, migrations } = await migratedDb(root);
  const q = async s => (await db.query(s)).rows;
  const noRls = await q(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity order by 1`);
  const anonWrite = await q(`select table_name, string_agg(privilege_type, ',') p from information_schema.role_table_grants where grantee='anon' and table_schema='public' and privilege_type in ('INSERT','UPDATE','DELETE') group by 1 order by 1`);
  const definerNoPath = await q(`select n.nspname||'.'||p.proname f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prosecdef and n.nspname in ('public','crm_private') and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%') order by 1`);
  const tables = (await q(`select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`))[0].n;
  checks.push({ cmd: `PGlite: ${migrations} migraciones aplicadas; auditoría de catálogo (pg_class, role_table_grants, pg_proc)`, exit: 0, ok: true, tap: {} });
  for (const r of noRls) findings.push(finding('high', `Tabla public.${r.relname} sin RLS`));
  for (const r of anonWrite) findings.push(finding('high', `anon puede ${r.p} en public.${r.table_name}`));
  for (const r of definerNoPath) findings.push(finding('high', `SECURITY DEFINER sin search_path fijo: ${r.f}`));
  // Client bundles: no privileged key names in src/ or NEXT_PUBLIC secrets.
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const leaks = walk(path.join(root, 'src')).filter(f => /NEXT_PUBLIC_\w*(SECRET|SERVICE|PRIVATE|TOKEN|PASSWORD|API_KEY)/.test(fs.readFileSync(f, 'utf8')));
  for (const f of leaks) findings.push(finding('high', `Posible secreto público en ${path.relative(root, f)}`));
  checks.push({ cmd: 'scan src/ NEXT_PUBLIC_*(SECRET|TOKEN|API_KEY…)', exit: leaks.length ? 1 : 0, ok: !leaks.length, tap: {} });
  // Workflows must declare permissions (least privilege for GITHUB_TOKEN).
  const wfDir = path.join(root, '.github/workflows');
  const noPerm = fs.readdirSync(wfDir).filter(f => /\.ya?ml$/.test(f) && !/^\s*permissions:/m.test(fs.readFileSync(path.join(wfDir, f), 'utf8')));
  for (const f of noPerm) findings.push(finding('medium', `Workflow sin bloque permissions: ${f}`));
  checks.push({ cmd: 'scan .github/workflows permissions:', exit: 0, ok: true, tap: {} });
  // Kill switch and owner-only actions of the autonomy policy actually block.
  const ks = policy.decide('ren', 'read', { killSwitch: true, suspended: [], counts: { hour: 0, day: 0 } });
  const own = policy.decide('ren', 'production_change', { killSwitch: false, suspended: [], counts: { hour: 0, day: 0 } });
  const susp = policy.decide('haru', 'read', { killSwitch: false, suspended: ['haru'], counts: { hour: 0, day: 0 } });
  const policyOk = !ks.allowed && !own.allowed && own.reason === 'requires_owner_approval' && !susp.allowed;
  checks.push({ cmd: 'policy self-test: kill switch / owner-only / suspensión', exit: policyOk ? 0 : 1, ok: policyOk, tap: {} });
  if (!policyOk) findings.push(finding('critical', 'El interruptor de emergencia o la política de autonomía no bloquean'));
  checks.push(run('node', ['--test', 'tests/security.test.cjs', 'tests/security-baseline.test.cjs'], { cwd: root }));
  if (!checks.at(-1).ok) findings.push(finding('high', 'Fallan pruebas de regresión de seguridad'));
  return { capability: 'security_audit', actions: ['read', 'diagnose', 'test_isolated'], checks, findings,
    metrics: { tables, tablesWithoutRls: noRls.length, anonWriteGrants: anonWrite.length, definerWithoutSearchPath: definerNoPath.length, workflowsWithoutPermissions: noPerm.length },
    summary: `${tables} tablas auditadas en PostgreSQL aislado: ${noRls.length} sin RLS, ${anonWrite.length} con escritura anon, ${definerNoPath.length} DEFINER sin search_path; ${noPerm.length} workflows sin permissions; kill switch ${policyOk ? 'bloquea' : 'NO bloquea'}.` };
}

// HARU — CRM: the 13 commercial stages, terminal kinds, Radar→lead→sale objects and CRM tests.
async function haru({ root }) {
  const checks = [], findings = [];
  const { db } = await migratedDb(root);
  const stages = (await db.query(`select id, label, kind, position from public.crm_stages order by position`)).rows;
  const open = stages.filter(s => s.kind === 'open'), terminal = stages.filter(s => s.kind !== 'open');
  checks.push({ cmd: 'PGlite: select id,label,kind,position from crm_stages order by position', exit: 0, ok: true, tap: {} });
  if (stages.length !== 13) findings.push(finding('high', `Se esperaban 13 etapas y hay ${stages.length}`));
  const positions = stages.map(s => s.position);
  if (new Set(positions).size !== positions.length) findings.push(finding('high', 'Posiciones de etapa duplicadas'));
  if (!terminal.length) findings.push(finding('medium', 'No hay etapas terminales (ganado/perdido)'));
  const objects = (await db.query(`select table_name from information_schema.tables where table_schema='public' and table_name in ('crm_prospects','crm_leads','crm_sales','crm_clients','crm_projects','crm_tasks','crm_events') order by 1`)).rows.map(r => r.table_name);
  for (const t of ['crm_prospects', 'crm_leads', 'crm_tasks']) if (!objects.includes(t)) findings.push(finding('high', `Falta la tabla ${t} del flujo comercial`));
  const fk = (await db.query(`select count(*)::int n from information_schema.columns where table_schema='public' and table_name='crm_leads' and column_name='prospect_id'`)).rows[0].n;
  if (!fk) findings.push(finding('high', 'crm_leads no conserva prospect_id (Radar → Lead)'));
  checks.push(run('node', ['--test', 'tests/crm.test.cjs', 'tests/crm-kanban.test.cjs', 'tests/shared-calendar.test.cjs', 'tests/task-links.test.cjs'], { cwd: root }));
  if (!checks.at(-1).ok) findings.push(finding('high', 'Fallan pruebas del CRM, calendario o tareas'));
  return { capability: 'crm_contract_check', actions: ['read', 'diagnose', 'test_isolated'], checks, findings,
    metrics: { stages: stages.length, open: open.length, terminal: terminal.length, flowTables: objects.length, radarLink: !!fk },
    stages: stages.map(s => `${s.position}:${s.id}(${s.kind})`),
    summary: `${stages.length} etapas (${open.length} abiertas, ${terminal.length} terminales); tablas del flujo: ${objects.join(', ')}; Radar→Lead ${fk ? 'enlazado' : 'SIN enlace'}; pruebas CRM + calendario + tareas ${checks.at(-1).ok ? 'verdes' : 'en rojo'} (${checks.at(-1).tap.pass ?? '?'}/${checks.at(-1).tap.tests ?? '?'}).` };
}

// SORA — integrations: Titan Radar + Geoapify (tests, key isolation), Higgsfield Creative Bridge (tests, SHA-256 of every
// published asset, size cap), 3D HQ assets actually imported. No credits are spent and nothing is published.
async function sora({ root }) {
  const checks = [], findings = [];
  checks.push(run('node', ['--test', 'tests/radar-geoapify.test.cjs', 'tests/radar-qualification.test.cjs', 'tests/radar-server-scheduler.test.cjs'], { cwd: root }));
  if (!checks[0].ok) findings.push(finding('high', 'Fallan pruebas de Radar / Geoapify'));
  checks.push(run('node', ['--test', 'tests/creative-bridge.test.cjs', 'tests/creative-hq-bridge.test.cjs', 'tests/creative-media-import.test.cjs', 'tests/office-hq-layout.test.cjs'], { cwd: root }));
  if (!checks[1].ok) findings.push(finding('high', 'Fallan pruebas del Creative Bridge / HQ'));
  // Geoapify: the Places (server) key must never be public. The ONLY allowed public name is the documented, referrer-
  // restricted map-tile key (docs/RADAR_GEOAPIFY_FREE.md).
  const PUBLIC_TILE_KEY = 'NEXT_PUBLIC_AVALON_GEOAPIFY_MAP_KEY';
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const leaks = [];
  let tileKeyUsed = false;
  for (const f of walk(path.join(root, 'src'))) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/NEXT_PUBLIC_\w*GEOAPIFY\w*/gi)) {
      if (m[0] === PUBLIC_TILE_KEY) tileKeyUsed = true; else leaks.push(`${path.relative(root, f)} (${m[0]})`);
    }
  }
  for (const l of leaks) findings.push(finding('high', `Clave de Geoapify no autorizada expuesta al cliente: ${l}`));
  if (tileKeyUsed) findings.push(finding('info', `${PUBLIC_TILE_KEY} es pública por diseño (solo teselas): debe estar restringida por dominio en Geoapify`));
  checks.push({ cmd: 'scan src/ NEXT_PUBLIC_*GEOAPIFY* (solo clave de teselas permitida)', exit: leaks.length ? 1 : 0, ok: !leaks.length, tap: {} });
  // Every published Creative Bridge file must match the SHA-256 in its name and respect the 12 MiB cap.
  const dir = path.join(root, 'public/creative-bridge');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  let bad = 0, big = 0;
  for (const f of files) {
    const bytes = fs.readFileSync(path.join(dir, f));
    if (require('node:crypto').createHash('sha256').update(bytes).digest('hex') !== f.split('.')[0]) { bad++; findings.push(finding('critical', `Integridad rota: ${f} no coincide con su SHA-256`)); }
    if (bytes.length > 12 * 1024 * 1024) { big++; findings.push(finding('high', `Recurso publicado supera 12 MiB: ${f}`)); }
  }
  checks.push({ cmd: `sha256 + tamaño de ${files.length} archivos en public/creative-bridge`, exit: bad || big ? 1 : 0, ok: !bad && !big, tap: {} });
  const assets = fs.readFileSync(path.join(root, 'src/lib/office/hq-assets.ts'), 'utf8');
  const imported = (assets.match(/path: "\/creative-bridge\//g) || []).length;
  if (imported === 0) findings.push(finding('info', 'HQ 3D sin modelos de Higgsfield importados: geometría procedural'));
  return { capability: 'integrations_check', actions: ['read', 'diagnose', 'test_isolated'], checks, findings,
    metrics: { radarTests: checks[0].tap.pass ?? null, bridgeTests: checks[1].tap.pass ?? null, publishedAssets: files.length, integrityFailures: bad, oversized: big, hqGlbImported: imported, higgsfieldCreditsSpent: 0 },
    summary: `Radar/Geoapify ${checks[0].ok ? 'verde' : 'EN ROJO'} (${checks[0].tap.pass ?? '?'}/${checks[0].tap.tests ?? '?'}); Creative Bridge/HQ ${checks[1].ok ? 'verde' : 'EN ROJO'} (${checks[1].tap.pass ?? '?'}/${checks[1].tap.tests ?? '?'}); ${files.length} recursos publicados con SHA-256 ${bad ? 'ROTO' : 'íntegro'}; GLB en HQ: ${imported}; créditos Higgsfield gastados: 0.` };
}

// KENJI — quality gate: lint, TypeScript, unit tests; regressions vs. the previous run; rejects results without evidence.
async function kenji({ root, previous, others }) {
  const checks = [], findings = [];
  const l = cp.spawnSync('npx', ['eslint', '.', '-f', 'json'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
  let lintErrors = null, lintWarnings = null;
  try { const rep = JSON.parse(l.stdout); lintErrors = rep.reduce((n, f) => n + f.errorCount, 0); lintWarnings = rep.reduce((n, f) => n + f.warningCount, 0); } catch { /* reported below */ }
  checks.push({ cmd: 'npx eslint . -f json', exit: l.status, ok: l.status === 0, tap: {}, tail: `errors=${lintErrors} warnings=${lintWarnings}` });
  checks.push(run('npx', ['tsc', '--noEmit'], { cwd: root }));
  checks.push(run('npm', ['test', '--silent'], { cwd: root }));
  const t = checks.at(-1).tap;
  if (lintErrors) findings.push(finding('high', `${lintErrors} errores de lint`));
  if (!checks[1].ok) findings.push(finding('high', 'TypeScript no compila'));
  if (!checks[2].ok) findings.push(finding('high', `Pruebas unitarias en rojo (${t.fail ?? '?'} fallos)`));
  if (previous) {
    if ((t.pass ?? 0) < (previous.pass ?? 0)) findings.push(finding('high', `Regresión: pruebas aprobadas ${previous.pass} → ${t.pass}`));
    if ((lintWarnings ?? 0) > (previous.lintWarnings ?? Infinity)) findings.push(finding('low', `Más avisos de lint: ${previous.lintWarnings} → ${lintWarnings}`));
  }
  // Reject "work" that cannot be verified: every manager result must cite at least one executed check with an exit status.
  const rejected = verifyEvidence(others);
  for (const k of rejected) findings.push(finding('high', `${k.toUpperCase()}: resultado rechazado, sin evidencia verificable`));
  return { capability: 'quality_gate', actions: ['read', 'test_isolated', 'diagnose'], checks, findings, rejected,
    metrics: { pass: t.pass ?? null, fail: t.fail ?? null, tests: t.tests ?? null, lintErrors, lintWarnings, typecheck: checks[1].ok, verifiedManagers: Object.keys(others || {}).length - rejected.length },
    summary: `Lint ${lintErrors ?? '?'} errores/${lintWarnings ?? '?'} avisos; TypeScript ${checks[1].ok ? 'ok' : 'FALLA'}; pruebas ${t.pass ?? '?'}/${t.tests ?? '?'}; resultados de managers verificados: ${Object.keys(others || {}).length - rejected.length}/${Object.keys(others || {}).length}${rejected.length ? ' (rechazados: ' + rejected.join(', ') + ')' : ''}.` };
}

// REN — coordination: open PRs, overlapping files (conflict risk), PRs without an owner label, and a prioritized plan
// built from the other managers' findings. Reads GitHub through the gh CLI (GH_TOKEN) when available.
async function ren({ others }) {
  const checks = [], findings = [];
  const repo = process.env.GITHUB_REPOSITORY || 'avaloncoreagency/Avalon-code';
  const g = cp.spawnSync('gh', ['api', `repos/${repo}/pulls?state=open&per_page=50`, '--jq', '[.[] | {n:.number, ref:.head.ref, draft:.draft, labels:[.labels[].name]}]'], { encoding: 'utf8' });
  checks.push({ cmd: `gh api repos/${repo}/pulls?state=open`, exit: g.status ?? 1, ok: g.status === 0, tap: {} });
  let prs = [];
  const overlaps = {};
  if (g.status === 0) {
    prs = JSON.parse(g.stdout || '[]');
    for (const p of prs.slice(0, 40)) {
      const r = cp.spawnSync('gh', ['api', `repos/${repo}/pulls/${p.n}/files?per_page=100`, '--jq', '.[].filename'], { encoding: 'utf8' });
      for (const f of (r.stdout || '').split('\n').filter(Boolean)) (overlaps[f] = overlaps[f] || []).push(p.n);
    }
    checks.push({ cmd: `gh api pulls/<n>/files × ${Math.min(prs.length, 40)}`, exit: 0, ok: true, tap: {} });
  } else findings.push(finding('medium', 'Sin acceso a GitHub desde este entorno: coordinación de PRs no evaluada'));
  const hot = Object.entries(overlaps).filter(([, v]) => v.length > 1).sort((a, b) => b[1].length - a[1].length);
  for (const [f, v] of hot.slice(0, 8)) findings.push(finding('medium', `${f} lo modifican ${v.length} PRs abiertos: #${v.join(', #')}`));
  const unowned = prs.filter(p => !p.labels.some(l => /^owner:/.test(l)) && !/^dependabot\//.test(p.ref));
  if (unowned.length) findings.push(finding('low', `${unowned.length} PRs sin etiqueta owner:* (visibles pero sin responsable): #${unowned.slice(0, 12).map(p => p.n).join(', #')}`));
  const plan = Object.entries(others || {}).flatMap(([k, r]) => (r.findings || []).filter(f => ['critical', 'high'].includes(f.severity)).map(f => `${k.toUpperCase()}: ${f.text}`)).slice(0, 10);
  return { capability: 'operations_coordination', actions: ['read', 'diagnose', 'analyze', 'draft'], checks, findings, plan,
    metrics: { openPrs: prs.length, overlappingFiles: hot.length, unownedPrs: unowned.length, priorities: plan.length },
    summary: `${prs.length} PRs abiertos; ${hot.length} archivos tocados por varios PRs (riesgo de conflicto); ${unowned.length} sin owner:*; ${plan.length} prioridades altas de los demás managers en el plan.` };
}

module.exports = { shin, haru, sora, kenji, ren, run, migratedDb, verifyEvidence };
