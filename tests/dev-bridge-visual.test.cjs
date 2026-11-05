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
