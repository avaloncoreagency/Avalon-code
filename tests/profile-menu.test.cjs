const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const suite = fs.readFileSync('src/components/suite/suite.tsx', 'utf8');
const css = fs.readFileSync('src/components/suite/suite.module.css', 'utf8');

test('profile menu is in the top header, not in the sidebar', () => {
  const header = suite.indexOf('<header className={s.top}>');
  const menu = suite.indexOf('<details className={s.profileMenu}>');
  const footer = suite.indexOf('</header>');
  assert.ok(header >= 0 && header < menu && menu < footer);
  const sidebar = suite.slice(suite.indexOf('<aside'), suite.indexOf('</aside>'));
  assert.doesNotMatch(sidebar, /profileMenu|signOut|Invitar empleados/);
});

test('profile shows authenticated email and existing logout action', () => {
  assert.match(suite, /getAuthorizedMember\(\)/);
  assert.match(suite, /client\.auth\.getUser\(\)/);
  assert.match(suite, /user\.id !== member\.userId/);
  assert.match(suite, /className=\{s\.profileEmail\}>\{user\.email\}/);
  assert.match(suite, /<form action=\{signOut\}>/);
  assert.match(suite, /<button type="submit">Cerrar sesión/);
});

test('invitation and employee management are informational, not active links', () => {
  assert.match(suite, /Invitar empleados · Próximamente/);
  assert.match(suite, /Administrar accesos · Próximamente/);
  assert.doesNotMatch(suite, /href=["']\/admin\/(invite|employees|users)/);
});

test('profile dropdown supports keyboard focus and narrow viewports', () => {
  assert.match(suite, /<summary aria-label="Abrir mi perfil">/);
  assert.match(css, /\.profileMenu summary:focus-visible/);
  assert.match(css, /\.profilePanel/);
  assert.match(css, /calc\(100vw - 48px\)/);
});
