const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const filename = path.resolve(__dirname, '../../src/lib/dev-bridge/core.ts');
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = { exports: {} };
new Function('require','module','exports',code)(require,loaded,loaded.exports);
module.exports = loaded.exports;
