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
