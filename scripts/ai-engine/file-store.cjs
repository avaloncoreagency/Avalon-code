// Atomic JSON file store for the AI Engine worker (same contract as src/lib/ai-engine/store.ts).
const fs = require('node:fs');
const path = require('node:path');

class FileStore {
  constructor(file) { this.file = path.resolve(file); }
  load() {
    try {
      const s = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (s && s.version === 1) return s;
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
    return { version: 1, tasks: {}, usage: {}, cooldownUntil: {}, blocked: {}, memory: [] };
  }
  save(s) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(s, null, 1), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
}
module.exports = { FileStore };
