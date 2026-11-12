// Avalon HQ 0350, Phase 2.2: zero-credit pre-flight of the Higgsfield bridge with SYNTHETIC data.
// request → budget reserve → synthetic 3D result → integrity → durable storage → project link → duplicate refused.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const cp=require('node:child_process');
const {createHash}=require('node:crypto');

function glb(json={asset:{version:'2.0'},scenes:[{nodes:[]}]}) {
  let j=Buffer.from(JSON.stringify(json)); while(j.length%4)j=Buffer.concat([j,Buffer.from(' ')]);
  const total=12+8+j.length, b=Buffer.alloc(total);
  b.write('glTF',0,'ascii'); b.writeUInt32LE(2,4); b.writeUInt32LE(total,8);
  b.writeUInt32LE(j.length,12); b.write('JSON',16,'ascii'); j.copy(b,20); return b;
}
function sandbox(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'hq-bridge-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const repo=path.join(root,'repo'); fs.mkdirSync(repo); fs.mkdirSync(path.join(repo,'public'));
  cp.execFileSync('git',['init'],{cwd:repo,stdio:'ignore'});
  for(const folder of ['src','schemas']) fs.symlinkSync(path.join(process.cwd(),folder),path.join(repo,folder),'dir');
  const manifest=path.join(root,'manifest.json'), ledger=path.join(root,'credits.jsonl');
  const value=JSON.parse(fs.readFileSync('tests/fixtures/creative-manifest.synthetic.json','utf8'));
  value.assets=[{id:'station',kind:'model',alt:'Synthetic workstation',state:'pending',job_ref:null,storage_ref:null,sha256:null,reduced_motion_ref:null}];
  fs.writeFileSync(manifest,JSON.stringify(value),{mode:0o600});
  const budget=(...a)=>cp.spawnSync(process.execPath,[path.resolve('scripts/creative-bridge/budget.cjs'),a[0],ledger,...a.slice(1)],{cwd:repo,encoding:'utf8'});
  const imp=(src,...a)=>cp.spawnSync(process.execPath,[path.resolve('scripts/creative-bridge/import-asset.cjs'),manifest,'station',src,...a],{cwd:repo,encoding:'utf8'});
  return {root,repo,manifest,ledger,budget,imp,read:()=>JSON.parse(fs.readFileSync(manifest))};
}

test('budget: reservation before submission, cap survives restarts, retries never double-count', t=>{
  const {budget}=sandbox(t);
  const ok=r=>{assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);};
  assert.equal(ok(budget('reserve','hq-0350','200','req-concept-001','60')).remaining_after,140);
  assert.equal(ok(budget('reserve','hq-0350','200','req-concept-001','60')).replayed,true,'same request never reserved twice');
  assert.equal(budget('reserve','hq-0350','200','req-big-0001','150').status,2,'would exceed the cap');
  assert.match(budget('reserve','hq-0350','200','req-big-0001','150').stderr,/budget_exceeded/);
  ok(budget('settle','hq-0350','req-concept-001','job-aaaa-0001','58.5'));
  assert.equal(ok(budget('settle','hq-0350','req-concept-001','job-aaaa-0001','58.5')).replayed,true);
  // "Restart": a fresh process reads the same ledger.
  assert.deepEqual(ok(budget('status','hq-0350','200')),{project:'hq-0350',cap:200,spent:58.5,reserved_open:0,remaining:141.5});
  ok(budget('reserve','hq-0350','200','req-3d-0001','100')); ok(budget('release','hq-0350','req-3d-0001'));
  assert.equal(ok(budget('status','hq-0350','200')).remaining,141.5,'released reservation is freed');
  assert.equal(budget('settle','hq-0350','req-unknown-1','job-x-0001','5').status,2,'cannot record spend without a reservation');
  assert.equal(ok(budget('status','other-project','50')).spent,0,'projects are isolated');
});

test('synthetic 3D result: integrity, durable storage, project link, duplicate and tampering refused', t=>{
  const {repo,root,imp,read}=sandbox(t);
  const src=path.join(root,'station.glb'); const bytes=glb(); fs.writeFileSync(src,bytes);
  const hash=createHash('sha256').update(bytes).digest('hex');
  const flags=['--approve-public-use','--higgsfield-job=synthetic_job_hq0350'];
  // Not a GLB / truncated / wrong length → refused.
  const bad=path.join(root,'bad.glb'); const broken=Buffer.from(bytes); broken.writeUInt32LE(bytes.length+4,8); fs.writeFileSync(bad,broken);
  assert.equal(imp(bad,...flags).status,2);
  // Not self-contained: external / data URIs and vendor-specific required extensions are refused before anything is published.
  for (const [name,json] of [
    ['ext-image',{asset:{version:'2.0'},images:[{uri:'https://tracker.example.invalid/pixel.png'}]}],
    ['ext-buffer',{asset:{version:'2.0'},buffers:[{uri:'http://tracker.example.invalid/m.bin',byteLength:4}]}],
    ['data-uri',{asset:{version:'2.0'},images:[{uri:'data:image/png;base64,AAAA'}]}],
    ['odd-extension',{asset:{version:'2.0'},extensionsRequired:['ACME_custom_loader']}],
  ]) { const f=path.join(root,name+'.glb'); fs.writeFileSync(f,glb(json)); assert.equal(imp(f,...flags).status,2,name+' refused'); }
  assert.equal(fs.existsSync(path.join(repo,'public/creative-bridge'))?fs.readdirSync(path.join(repo,'public/creative-bridge')).length:0,0,'nothing was published by the refused imports');
  const embedded=path.join(root,'embedded.glb'); fs.writeFileSync(embedded,glb({asset:{version:'2.0'},buffers:[{byteLength:4}],images:[{bufferView:0,mimeType:'image/jpeg'}],extensionsRequired:['KHR_texture_transform']}));
  assert.equal(fs.existsSync(embedded),true);
  assert.equal(imp(src).status,2,'explicit approval is mandatory');
  const r=imp(src,...flags); assert.equal(r.status,0,r.stderr);
  const a=read().assets[0];
  assert.deepEqual([a.state,a.sha256,a.public_path,a.storage_ref],['ready',hash,'/creative-bridge/'+hash+'.glb','sha256:'+hash]);
  assert.deepEqual([...fs.readFileSync(path.join(repo,'public/creative-bridge',hash+'.glb'))],[...bytes],'stored bytes are identical');
  assert.equal(read().project_ref.length>0,true,'asset belongs to the manifest project');
  assert.equal(imp(src,...flags).status,0,'replay is idempotent'); assert.equal(fs.readdirSync(path.join(repo,'public/creative-bridge')).length,1,'no duplicate file');
  // A different file cannot replace a ready asset; tampering with stored bytes is detected.
  const other=path.join(root,'other.glb'); fs.writeFileSync(other,glb({asset:{version:'2.0'},nodes:[{name:'x'}]}));
  assert.equal(imp(other,...flags).status,2);
  fs.writeFileSync(path.join(repo,'public/creative-bridge',hash+'.glb'),Buffer.alloc(bytes.length,1));
  assert.equal(imp(src,...flags).status,2);
  // An image cannot be imported as a model.
  const png=path.join(root,'x.png'); fs.writeFileSync(png,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=','base64'));
  assert.equal(imp(png,...flags).status,2);
});
