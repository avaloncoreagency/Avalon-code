// Reuse #87's signed transport. Never borrow an owner's session or print its output.
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {atomic} = require('./private-files.cjs');
const core = require('./continuity-loader.cjs')('src/lib/creative-bridge/continuity.ts');

async function registerPrivate(input, document, run = execFileSync) {
  return core.register(document, async delivery => {
    const directory = fs.mkdtempSync(path.join(path.dirname(input), '.avalon-delivery-'));
    try {
      const file = path.join(directory, 'delivery.json');
      atomic(file, delivery);
      const output = run(process.execPath, [path.join(__dirname, 'submit.mjs'), file], {
        encoding: 'utf8', timeout: 20000, maxBuffer: 16384, stdio: ['ignore', 'pipe', 'pipe'],
      });
      const receipt = JSON.parse(output);
      const uuid = '([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})';
      const project = new RegExp('^/admin/workspace/products/' + uuid + '$').exec(receipt.project_path);
      const lead = new RegExp('^/admin/workspace/clients/' + uuid + '$').exec(receipt.company_path);
      if (!project || !lead) throw Error('Invalid receipt');
      return {project_id: project[1], lead_id: lead[1]};
    } finally {
      fs.rmSync(directory, {recursive: true, force: true});
    }
  });
}
module.exports = {registerPrivate};
