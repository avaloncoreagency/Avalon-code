'use strict';
// Reviewed pinned sources only; no remote writes or application execution here.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const root = process.cwd();
const pins = JSON.parse(fs.readFileSync('docs/final-validation/source-pins.json', 'utf8'));
const dest = path.resolve(process.argv[2] || '');
if (!process.argv[2] || fs.existsSync(dest)) throw Error('Provide a fresh disposable directory');
const git = (args, cwd = root, allowFailure = false) => {
  const r = cp.spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status && !allowFailure) throw Error(r.stderr || r.stdout);
  return r;
};
for (const sha of [pins.main, ...pins.sources.map(x => x.sha)]) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('Unpinned source');
  if (git(['cat-file', '-e', sha + '^{commit}'], root, true).status) git(['fetch', '--no-tags', 'origin', sha]);
}
git(['worktree', 'add', '--detach', dest, pins.main]);
for (const { sha } of pins.sources) {
  const r = git(['-c', 'user.name=Avalon QA', '-c', 'user.email=qa@example.invalid', 'merge', '--no-edit', sha], dest, true);
  if (!r.status) continue;
  const conflicts = git(['diff', '--name-only', '--diff-filter=U'], dest).stdout.trim().split('\n');
  const file = '.github/workflows/public-inquiry-review.yml';
  if (conflicts.length !== 1 || conflicts[0] !== file) throw Error('Unexpected conflict; stop and review: ' + conflicts);
  const a = git(['show', ':2:' + file], dest).stdout, b = git(['show', ':3:' + file], dest).stdout;
  const strip = s => s.split('\n').filter(x => !/^      - '/.test(x) && !/^      - run: NODE_PATH=/.test(x)).join('\n');
  if (strip(a) !== strip(b)) throw Error('Workflow conflict changed beyond reviewed paths/test command');
  const paths = [...new Set([...a.matchAll(/^      - '([^']+)'/gm), ...b.matchAll(/^      - '([^']+)'/gm)].map(x => x[1]))];
  const commands = [...a.matchAll(/^      - run: NODE_PATH=([^\n]+)/gm), ...b.matchAll(/^      - run: NODE_PATH=([^\n]+)/gm)].map(x => x[1]);
  const tests = [...new Set(commands.flatMap(s => s.match(/tests\/[\w./-]+\.cjs/g) || []))];
  if (tests.length !== 4) throw Error('Expected all four SQL/definer suites');
  let merged = a.replace(/(?:^      - '[^']+'\n)+/m, paths.map(p => `      - '${p}'\n`).join(''));
  merged = merged.replace(/^      - run: NODE_PATH=[^\n]+/m, '      - run: NODE_PATH=tests/qa/node_modules node --test ' + tests.join(' '));
  fs.writeFileSync(path.join(dest, file), merged);
  git(['add', file], dest);
  git(['-c', 'user.name=Avalon QA', '-c', 'user.email=qa@example.invalid', 'commit', '--no-edit'], dest);
}
for (const dir of ['tests/final-validation', 'scripts/final-validation', 'docs/final-validation']) {
  fs.cpSync(path.join(root, dir), path.join(dest, dir), { recursive: true });
}
console.log(JSON.stringify({ harness: git(['rev-parse', 'HEAD']).stdout.trim(), sources: pins, candidate: git(['rev-parse', 'HEAD'], dest).stdout.trim(), tree: git(['rev-parse', 'HEAD^{tree}'], dest).stdout.trim(), note: 'plus additive harness files; candidate is synthetic, never a deployment' }, null, 2));
