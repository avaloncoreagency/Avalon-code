const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const cp=require('node:child_process');
const {createHash}=require('node:crypto');

function sandbox(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'higgsfield-import-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const repo=path.join(root,'repo');
  fs.mkdirSync(repo);fs.mkdirSync(path.join(repo,'public'));
  cp.execFileSync('git',['init'],{cwd:repo,stdio:'ignore'});
  for(const folder of ['src','schemas']) fs.symlinkSync(path.join(process.cwd(),folder),path.join(repo,folder),'dir');
  const file=path.join(root,'manifest.json');
  const source=path.join(root,'hero.png');
  // Valid small PNG; NO Higgsfield generation, network or credits needed.
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=','base64');
  fs.writeFileSync(source,bytes);
  const value=JSON.parse(fs.readFileSync('tests/fixtures/creative-manifest.synthetic.json','utf8'));
  value.assets=[{id:'hero',kind:'image',alt:'Synthetic image',state:'pending',job_ref:null,storage_ref:null,sha256:null,reduced_motion_ref:null}];
  fs.writeFileSync(file,JSON.stringify(value),{mode:0o600});
  const script=path.resolve('scripts/creative-bridge/import-asset.cjs');
  const run=(args=[],location=source)=>cp.spawnSync(process.execPath,[script,file,'hero',location,...args],{cwd:repo,encoding:'utf8'});
  const read=()=>JSON.parse(fs.readFileSync(file));
  return {root,repo,file,source,bytes,run,read};
}

test('Higgsfield media handoff requires approval and verified bytes; replay is idempotent',t=>{
  const {repo,source,bytes,run,read}=sandbox(t);
  assert.equal(run().status,2);
  assert.equal(fs.existsSync(path.join(repo,'public/creative-bridge')),false);
  const flags=['--approve-public-use','--higgsfield-job=hfJob20261104_verified_by_operator'];
  const first=run(flags);
  assert.equal(first.status,0,first.stderr);
  const saved=read(),hash=createHash('sha256').update(bytes).digest('hex');
  assert.equal(saved.assets[0].sha256,hash);
  assert.equal(saved.assets[0].job_ref,'higgsfield:hfJob20261104_verified_by_operator');
  assert.equal(saved.assets[0].state,'ready');
  const out=path.join(repo,'public',saved.assets[0].public_path);
  assert.ok(fs.readFileSync(out).equals(bytes));
  assert.equal(run(flags).status,0);
  assert.equal(fs.readdirSync(path.dirname(out)).length,1);
  // A different claimed job cannot take ownership of the same ready asset.
  assert.equal(run(['--approve-public-use','--higgsfield-job=anotherHiggsfieldJob123']).status,2);
  assert.equal(read().assets[0].job_ref,saved.assets[0].job_ref);
  // An asset marked "ready" is NOT real proof if the published binary vanished.
  fs.unlinkSync(out);
  assert.equal(run(flags).status,2);
  assert.throws(()=>fs.readFileSync(out),{code:'ENOENT'});
  fs.writeFileSync(out,bytes);
  assert.equal(run(flags).status,0);
  // Tampering in public storage is detected, never silently accepted.
  fs.writeFileSync(out,Buffer.alloc(bytes.length,1));
  assert.equal(run(flags).status,2);
  assert.equal(read().assets[0].sha256,hash);
  // Changing the source does not rewrite an existing ready record.
  fs.writeFileSync(source,'<svg onload="alert(1)"></svg>');
  assert.equal(run(flags).status,2);
  assert.equal(read().assets[0].sha256,hash);
});

test('rejects symlink sources and forged/truncated PNG headers before publishing',t=>{
  const {root,repo,source,run,read}=sandbox(t);
  const link=path.join(root,'shortcut.png');
  fs.symlinkSync(source,link);
  assert.equal(run(['--approve-public-use'],link).status,2);
  const fake=path.join(root,'fake.png');
  fs.writeFileSync(fake,Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    Buffer.alloc(40,0),
  ]));
  assert.equal(run(['--approve-public-use'],fake).status,2);
  assert.equal(read().assets[0].state,'pending');
  assert.equal(fs.existsSync(path.join(repo,'public/creative-bridge')),false);
});

test('rejects forged GIF/HTML and malformed provenance, even with approval flag',t=>{
  const {root,run,read}=sandbox(t);
  const html=path.join(root,'hero.html');
  fs.writeFileSync(html,Buffer.from('<html>bad content</html>-------------'));
  assert.equal(run(['--approve-public-use'],html).status,2);
  assert.equal(run(['--approve-public-use','--higgsfield-job=bad job id']).status,2);
  assert.equal(run(['--approve-public-use','--higgsfield-job=x']).status,2);
  assert.equal(run(['--approve-public-use','--higgsfield-job=okay12345','--unexpected']).status,2);
  assert.equal(read().assets[0].state,'pending');
});
