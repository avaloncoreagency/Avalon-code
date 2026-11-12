// Loads the TypeScript AI Engine (src/lib/ai-engine) for Node workers, with the repo's existing TS loader.
const path = require('node:path');
const load = require('../creative-bridge/continuity-loader.cjs');
const root = path.resolve(__dirname, '../..');
const lib = f => load(path.join(root, 'src/lib/ai-engine', f));
module.exports = {
  ...lib('catalog.ts'), ...lib('guard.ts'), ...lib('adapters.ts'), ...lib('store.ts'), ...lib('router.ts'), ...lib('workforce.ts'),
  ...require('./file-store.cjs'),
};
