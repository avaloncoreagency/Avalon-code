// UI-only contract checks for Dev Bridge 0352-B. These do not replace a Next.js build or authenticated browser QA.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const page = fs.readFileSync('src/app/admin/dev-bridge/page.tsx', 'utf8');
const visuals = fs.readFileSync('src/app/admin/dev-bridge/bridge-visuals.tsx', 'utf8');
const css = fs.readFileSync('src/app/admin/dev-bridge/bridge.module.css', 'utf8');

test('Dev Bridge requires owner before reading external metadata', () => {
  assert.match(page, /await requireOwner\(\)/);
  assert.ok(page.indexOf('await requireOwner()') < page.indexOf('await snapshot()'));
  assert.match(page, /const completeGithub = freshness\(state\.github\)\.status === 'VERIFIED' && !publicOnly/);
  assert.match(page, /const team = collaboration\(githubFresh \? github \?\? null : null\)/);
  assert.doesNotMatch(page, /NEXT_PUBLIC_.*(?:TOKEN|SECRET|API_KEY)|service_role/);
});

test('provider facts and CI stay visibly separate from build status', () => {
  assert.match(visuals, /export function SourceCard/);
  assert.match(visuals, /export function CiStatus/);
  assert.match(visuals, /export function BuildStatus/);
  for (const label of ['Verificado', 'Pendiente', 'Bloqueado', 'Desconocido', 'CI desconocido', 'Build listo']) {
    assert.ok(visuals.includes(label), 'missing state label: ' + label);
  }
  assert.match(page, /Un build listo no confirma salud funcional/);
  assert.match(page, /CI corresponde a checks de GitHub, no al build de Vercel/);
  assert.match(page, /Los PR mostrados proceden de una lectura antigua o desconocida/);
});

test('handoff is gated by current full GitHub coverage and a documented next action', () => {
  assert.match(page, /completeGithub && next_action/);
  assert.match(page, /Los paquetes de handoff están bloqueados/);
  assert.match(page, /No significa que esté inactivo/);
  assert.match(page, /Archivos tocados por varias ramas/);
  assert.match(page, /no es un conflicto de merge confirmado/);
  assert.doesNotMatch(page, /<button[^>]*>(?:Merge|Deploy|Delete|Grant)/i);
});

test('mobile layout uses cards, accessible focus, min 44px actions and reduced motion', () => {
  assert.match(page, /className=\{s\.mobilePRs\}/);
  assert.match(page, /className=\{s\.desktopTable\}/);
  assert.match(css, /@media \(max-width: 800px\)/);
  assert.match(css, /\.mobilePRs \{ display: grid/);
  assert.match(css, /\.desktopTable \{ display: none/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});


test('source cards distinguish verified, stale, unknown and failed reads without leaking provider errors', () => {
  const ts = require('typescript');
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const compiled = ts.transpileModule(visuals, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = { exports: {} };
  const styles = new Proxy({}, { get: (_target, name) => String(name) });
  const mockRequire = name => {
    if (name === '@/lib/dev-bridge/core') return { freshness: fact => fact };
    if (name === './bridge.module.css') return styles;
    return require(name);
  };
  new Function('require', 'module', 'exports', compiled)(mockRequire, loaded, loaded.exports);
  const render = (status, error, limited = false) => renderToStaticMarkup(React.createElement(
    loaded.exports.SourceCard,
    { name: 'github', limited, fact: {
      status,
      data: status === 'UNKNOWN' ? null : { coverage: 'summary' },
      checked_at: '2026-11-05T15:00:00.000Z',
      verified_at: status === 'UNKNOWN' ? null : '2026-11-05T14:00:00.000Z',
      ...(error ? { error } : {}),
    } },
  ));

  const fresh = render('VERIFIED');
  assert.match(fresh, /Lectura verificada/);
  assert.doesNotMatch(fresh, /Desactualizado|Error de conexión/);

  const limited = render('VERIFIED', undefined, true);
  assert.match(limited, /Parcial/);
  assert.match(limited, /no verifica CI/);

  const stale = render('STALE', 'Bearer do-not-display-this-token');
  assert.match(stale, /Desactualizado/);
  assert.match(stale, /Solo hay datos anteriores/);
  assert.doesNotMatch(stale, /do-not-display-this-token|Bearer/);

  const unknown = render('UNKNOWN');
  assert.match(unknown, /Desconocido/);
  assert.match(unknown, /Sin lectura actual confirmada/);

  const failed = render('UNKNOWN', 'internal error with private-secret-and-key');
  assert.match(failed, /Error de conexión/);
  assert.match(failed, /No se pudo consultar al proveedor/);
  assert.doesNotMatch(failed, /private-secret-and-key|internal error/);

  // A partially failed refresh may leave a VERIFIED timestamp in its cache.
  // The source card must not claim success when error evidence is present.
  const inconsistent = render('VERIFIED', 'Bearer synthetic-provider-secret');
  assert.match(inconsistent, /Error de conexión/);
  assert.match(inconsistent, /No se pudo consultar al proveedor/);
  assert.doesNotMatch(inconsistent, /Lectura verificada|synthetic-provider-secret|Bearer/);

  // A stale RLS flag might remain in the snapshot object. It is not safe to
  // present that old flag as a current/verified Supabase result.
  const renderEvidence = (status, error) => renderToStaticMarkup(React.createElement(
    loaded.exports.VerifiedSourceOnly,
    { fact: { status, error } },
    React.createElement('strong', null, 'synthetic RLS enabled'),
  ));
  assert.match(renderEvidence('VERIFIED'), /synthetic RLS enabled/);
  for (const [status, error] of [
    ['STALE', null],
    ['UNKNOWN', null],
    ['VERIFIED', 'synthetic internal provider secret'],
  ]) {
    const html = renderEvidence(status, error);
    assert.match(html, /Metadatos no verificados actualmente/);
    assert.doesNotMatch(html, /synthetic RLS enabled|synthetic internal provider secret/);
  }
});

test('Supabase migrations and RLS are displayed only through the verified-source gate', () => {
  assert.match(page, /<VerifiedSourceOnly fact=\{state\.supabase\}>/);
  assert.match(page, /<\/VerifiedSourceOnly>/);
  const supabaseStart = page.indexOf('<VerifiedSourceOnly fact={state.supabase}>');
  const supabaseEnd = page.indexOf('</VerifiedSourceOnly>', supabaseStart);
  assert.ok(supabaseStart >= 0 && supabaseEnd > supabaseStart);
  const section = page.slice(supabaseStart, supabaseEnd);
  assert.match(section, /Ver migraciones reportadas/);
  assert.match(section, /Ver RLS reportado/);
  assert.match(section, /Ver funciones reportadas/);
});


test('cached Vercel deployment details are not rendered as current after a failed refresh', () => {
  const sectionStart = page.indexOf('aria-label="Despliegues de Vercel"');
  const sectionEnd = page.indexOf('aria-label="Metadatos de Supabase"', sectionStart);
  assert.ok(sectionStart > 0 && sectionEnd > sectionStart);
  const section = page.slice(sectionStart, sectionEnd);
  const start = section.indexOf('<VerifiedSourceOnly fact={state.vercel}>');
  const end = section.indexOf('</VerifiedSourceOnly>', start);
  assert.ok(start >= 0 && end > start, 'Vercel list must be guarded by provider freshness');
  const guarded = section.slice(start, end);
  assert.match(guarded, /className=\{s\.deployments\}/);
  assert.match(guarded, /<BuildStatus code=\{d\.state\}/);
  assert.match(guarded, /Abrir despliegue/);

  const ts = require('typescript');
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const compiled = ts.transpileModule(visuals, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(
    name => name === '@/lib/dev-bridge/core' ? { freshness: fact => fact }
      : name === './bridge.module.css' ? new Proxy({}, { get: (_target, key) => String(key) }) : require(name),
    loaded, loaded.exports,
  );
  const render = (status, error) => renderToStaticMarkup(React.createElement(
    loaded.exports.VerifiedSourceOnly,
    { fact: { status, checked_at: '2026-11-05T12:00:00.000Z', verified_at: '2026-11-04T12:00:00.000Z',
      data: [{ id: 'old-preview', state: 'READY' }], error } },
    React.createElement('a', { href: 'https://synthetic-preview.invalid' }, 'Build listo: cached Vercel deployment'),
  ));
  assert.match(render('VERIFIED'), /Build listo: cached Vercel deployment/);
  for (const [status, error] of [['STALE', 'synthetic provider secret'], ['UNKNOWN', null], ['VERIFIED', 'synthetic failed refresh']]) {
    const html = render(status, error);
    assert.match(html, /Metadatos no verificados actualmente/);
    assert.doesNotMatch(html, /Build listo: cached Vercel deployment|synthetic-preview\.invalid|synthetic provider secret|synthetic failed refresh/);
  }
});


test('Dev Bridge does not present cached Issue ownership or integration claims as current', async () => {
  const ts = require('typescript');
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const compiled = ts.transpileModule(page, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const issue = {
    id: 'synthetic-issue',
    number: 987654,
    title: 'SYNTHETIC_STALE_ISSUE_DO_NOT_SHOW',
    owner: 'miguel',
    open: true,
    state: 'open',
    labels: ['type:integration'],
    url: 'https://example.invalid/synthetic-issue',
    body: 'Next action: synthetic',
  };
  const oldPull = {
    number: 876543, title: 'SYNTHETIC_CACHED_PR_DO_NOT_SHOW',
    url: 'https://example.invalid/cached-pr', branch: 'synthetic/stale',
    head_sha: '0000000000000000000000000000000000000001', ci: 'PASSED',
    behind: 0, conflict: false, files: ['stale/private.ts'], issues: [],
  };
  const oldCommit = {
    sha: '0000000000000000000000000000000000000002',
    url: 'https://example.invalid/cached-commit',
    date: '2026-11-01', author: 'SYNTHETIC_CACHED_AUTHOR_DO_NOT_SHOW',
  };
  const run = async (status, error, coverage = 'full', findings = [], sourceOverrides = {}) => {
    const synthetic = {
      at: '2026-11-05T16:00:00.000Z',
      github: {
        status,
        error,
        checked_at: '2026-11-05T16:00:00.000Z',
        verified_at: '2026-11-05T15:59:00.000Z',
        data: { coverage, issues: [issue], pulls: [oldPull], commits: [oldCommit] },
      },
      vercel: sourceOverrides.vercel ?? { status: 'UNKNOWN', data: null, verified_at: null },
      supabase: sourceOverrides.supabase ?? { status: 'UNKNOWN', data: null, verified_at: null },
      findings,
    };
    const loaded = { exports: {} };
    const styles = new Proxy({}, { get: (_target, key) => String(key) });
    const mocks = {
      'next/link': { __esModule: true, default: ({ children, href }) => React.createElement('a', { href }, children) },
      '@/components/suite/suite': { Suite: ({ children }) => children },
      '@/lib/auth/session': { requireOwner: async () => {} },
      '@/lib/dev-bridge/runtime': { snapshot: async () => synthetic },
      '@/lib/dev-bridge/core': {
        freshness: fact => fact,
        collaboration: () => ({
          assigned: { miguel: [], samuel: [] }, unassigned: [], overlaps: [],
          overlap_total: 0, creative: [], total: 0,
        }),
      },
      './bridge-auto-refresh': { BridgeAutoRefresh: () => null },
      './bridge.module.css': styles,
      './bridge-visuals': {
        BridgeStatus: ({ label }) => React.createElement('span', null, label),
        BuildStatus: () => null,
        CiStatus: ({ code }) => React.createElement('span', null, code ?? 'CI desconocido'),
        Sha: () => null,
        SourceCard: () => null,
        VerifiedSourceOnly: ({ children }) => children,
      },
    };
    new Function('require', 'module', 'exports', compiled)(
      id => Object.hasOwn(mocks, id) ? mocks[id] : require(id), loaded, loaded.exports,
    );
    return renderToStaticMarkup(await loaded.exports.default());
  };

  for (const [status, error, coverage] of [
    ['STALE', undefined, 'full'],
    ['UNKNOWN', undefined, 'full'],
    ['VERIFIED', 'synthetic private provider error', 'full'],
  ]) {
    const html = await run(status, error, coverage);
    assert.match(html, /No se pueden comprobar tareas sin PR/);
    assert.match(html, /Issues de integración: estado desconocido/);
    assert.doesNotMatch(html, /SYNTHETIC_STALE_ISSUE_DO_NOT_SHOW|SYNTHETIC_CACHED_PR_DO_NOT_SHOW|SYNTHETIC_CACHED_AUTHOR_DO_NOT_SHOW|synthetic private provider error/);
    assert.match(html, /PRs sin lectura actual/, 'a stale or failed read must not claim a current PR count');
    assert.doesNotMatch(html, /Sin conflicto detectado|stale\/private\.ts/, 'cached CI or merge claims must not appear as current');
    assert.doesNotMatch(html, /0 tareas sin PR/, 'unknown data must not be represented as a verified zero');
  }
  // A verified public summary may include PR titles but cannot certify CI,
  // merge state, touched files or a full commit feed.
  const summary = await run('VERIFIED', undefined, 'summary');
  assert.match(summary, /SYNTHETIC_CACHED_PR_DO_NOT_SHOW/, 'fresh public PR titles are allowed');
  assert.match(summary, /CI desconocido/);
  assert.doesNotMatch(summary, /SYNTHETIC_STALE_ISSUE_DO_NOT_SHOW|SYNTHETIC_CACHED_AUTHOR_DO_NOT_SHOW|PASSED|Sin conflicto detectado|stale\/private\.ts/);
  const fresh = await run('VERIFIED', undefined, 'full');
  assert.match(fresh, /SYNTHETIC_STALE_ISSUE_DO_NOT_SHOW/, 'full fresh data may display the linked Issue');
  assert.match(fresh, /SYNTHETIC_CACHED_PR_DO_NOT_SHOW/, 'verified PRs remain visible');
  assert.match(fresh, /SYNTHETIC_CACHED_AUTHOR_DO_NOT_SHOW/, 'verified commit metadata remains visible');
  assert.match(fresh, /PASSED/, 'full verified read may show checked CI');
  assert.match(fresh, /1 tareas sin PR/);
  assert.doesNotMatch(fresh, /Issues de integración: estado desconocido/);

  // The backend describes a missing/stale provider as a finding with a
  // VERIFIED claim. This is a verified detection of *missing telemetry*,
  // not a current positive provider report.
  const unavailable = await run('UNKNOWN', undefined, 'full', [
    { id: 'source:github', severity: 'warning', claim: 'VERIFIED', message: 'github: UNKNOWN or stale telemetry' },
  ]);
  assert.match(unavailable, /Lectura no verificada/);
  assert.doesNotMatch(unavailable, /Reportado por proveedor/);

  // Inconsistent provider responses can keep a VERIFIED timestamp and an
  // error simultaneously. Section headings must agree with the safe source
  // cards and not advertise verified Vercel/Supabase metadata.
  const inconsistentProviders = await run('UNKNOWN', undefined, 'full', [], {
    vercel: { status: 'VERIFIED', error: 'Bearer synthetic-vercel-private', data: [],
      checked_at: '2026-11-05T16:00:00.000Z', verified_at: '2026-11-05T15:59:00.000Z' },
    supabase: { status: 'VERIFIED', error: 'Bearer synthetic-supabase-private', data: null,
      checked_at: '2026-11-05T16:00:00.000Z', verified_at: '2026-11-05T15:59:00.000Z' },
  });
  assert.match(inconsistentProviders, /Sin verificación actual/);
  assert.match(inconsistentProviders, /Desconocido/);
  assert.doesNotMatch(inconsistentProviders, /Metadatos disponibles|Lectura verificada|synthetic-vercel-private|synthetic-supabase-private/);

  // Genuine current provider evidence must keep its original provenance.
  const failedCI = await run('VERIFIED', undefined, 'full', [
    { id: 'ci:876543', severity: 'warning', claim: 'VERIFIED', message: 'PR #876543: failed CI' },
  ]);
  assert.match(failedCI, /Reportado por proveedor/);
});
