// Static fail-closed integration tripwire for OMEGA #260; no agent execution.
// This does NOT prove Auth/RLS, receipt authenticity or safe production behavior.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_ROOTS = ['src/app', 'src/lib'];
const EXCLUDED_FILES = new Set([
  'src/lib/operations/mission-plan.ts',
  'src/lib/operations/department-templates.ts',
]);
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const DRAFT_DIRECTORY = 'src/lib/operations';

function normalize(file) {
  return file.replace(/\\/g, '/');
}

function walk(relative) {
  const absolute = path.join(ROOT, relative);
  if (!fs.existsSync(absolute)) return [];
  if (EXCLUDED_FILES.has(normalize(relative))) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) return walk(child);
    return entry.isFile() && EXTENSIONS.has(path.extname(entry.name)) ? [child] : [];
  });
}

// Parse actual import/export/require expressions, avoiding comment and string matches.
// Only static string specifiers can be inspected; this is a tripwire, not a scanner.
function moduleSpecifiers(source, fileName) {
  const kind = /\.tsx$/.test(fileName) ? ts.ScriptKind.TSX
    : /\.jsx$/.test(fileName) ? ts.ScriptKind.JSX
      : /\.[cm]?js$/.test(fileName) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const specifiers = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression)) {
      specifiers.push(node.moduleReference.expression.text);
    }
    if (ts.isCallExpression(node) && node.arguments.length > 0
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
      && ts.isStringLiteralLike(node.arguments[0])) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return specifiers;
}

function resolvesToDraft(fileName, specifier) {
  let target;
  if (specifier.startsWith('@/')) target = 'src/' + specifier.slice(2);
  else if (specifier.startsWith('.')) {
    target = path.posix.join(path.posix.dirname(normalize(fileName)), specifier);
  } else if (specifier.startsWith('src/')) target = specifier;
  else return false;
  const modulePath = path.posix.normalize(target)
    .replace(/\.[cm]?[jt]sx?$/i, '')
    .replace(/\/index$/, '');
  return modulePath === DRAFT_DIRECTORY || modulePath.startsWith(DRAFT_DIRECTORY + '/');
}

function forbiddenImports(fileName, source) {
  return moduleSpecifiers(source, fileName)
    .filter(specifier => resolvesToDraft(fileName, specifier));
}

test('OMEGA draft planner has no runtime consumers before trusted owner/receipt gates', () => {
  const offenders = [];
  for (const fileName of SOURCE_ROOTS.flatMap(walk)) {
    const source = fs.readFileSync(path.join(ROOT, fileName), 'utf8');
    for (const specifier of forbiddenImports(fileName, source)) {
      offenders.push(normalize(fileName) + ' imports ' + specifier);
    }
  }
  assert.deepEqual(offenders, [], [
    'Runtime imports the unreviewed OMEGA operations directory.',
    'Do not route around this check. First prove the owner-scoped server adapter,',
    'trusted durable receipts, independent approval, kill switch and negative E2E;',
    'then update the gate in an explicitly reviewed integration PR.',
  ].join(' '));
});

test('tripwire catches import, export, require, dynamic and relative paths', () => {
  const cases = [
    ['src/app/demo/page.tsx', "import { compileMission } from '@/lib/operations/mission-plan';"],
    ['src/app/demo/page.tsx', "import '@/lib/operations/mission-plan';"],
    ['src/lib/example.ts', "export * from '@/lib/operations/department-templates';"],
    ['src/app/demo/page.js', "const x = require('@/lib/operations/mission-plan');"],
    ['src/app/demo/page.tsx', "const x = import('@/lib/operations/mission-plan');"],
    ['src/lib/operations/adapter.ts', "import { compileMission } from './mission-plan';"],
    ['src/app/demo/page.tsx', "import * as operations from '@/lib/operations';"],
    ['src/app/demo/page.tsx', "import type { MissionPlan } from '@/lib/operations/mission-plan';"],
  ];
  for (const [fileName, source] of cases) {
    assert.equal(forbiddenImports(fileName, source).length, 1, source);
  }
});

test('tripwire ignores unrelated modules, comments and quoted sample code', () => {
  const cases = [
    "// import '@/lib/operations/mission-plan';",
    "const snippet = \"from '@/lib/operations/mission-plan'\";",
    "import { CAPABILITY } from '@/lib/agents/policy';",
    "const x = require('@/lib/unrelated/mission-plan');",
  ];
  for (const source of cases) {
    assert.deepEqual(forbiddenImports('src/app/demo/page.tsx', source), [], source);
  }
});

test('tripwire inspects application and library roots, excluding only draft source files', () => {
  for (const relative of SOURCE_ROOTS) assert.ok(fs.existsSync(path.join(ROOT, relative)));
  assert.deepEqual([...EXCLUDED_FILES].sort(), [
    'src/lib/operations/department-templates.ts',
    'src/lib/operations/mission-plan.ts',
  ]);
});
