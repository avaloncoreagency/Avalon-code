const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const cp=require('node:child_process');const {createHash}=require('node:crypto');
test('approved local media is durably imported once; unsupported files and unapproved publication are refused',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'creative-import-'));const repo=path.join(root,'repo');fs.mkdirSync(repo);fs.mkdirSync(path.join(repo,'public'));cp.execFileSync('git',['init'],{cwd:repo,stdio:'ignore'});for(const folder of ['src','schemas'])fs.symlinkSync(path.join(process.cwd(),folder),path.join(repo,folder),'dir');
 const file=path.join(root,'manifest.json'),source=path.join(root,'hero.png');const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=','base64');fs.writeFileSync(source,bytes);
 const value=JSON.parse(fs.readFileSync('tests/fixtures/creative-manifest.synthetic.json','utf8'));value.assets=[{id:'hero',kind:'image',alt:'Synthetic image',state:'pending',job_ref:null,storage_ref:null,sha256:null,reduced_motion_ref:null}];fs.writeFileSync(file,JSON.stringify(value),{mode:0o600});
 const script=path.resolve('scripts/creative-bridge/import-asset.cjs');const run=(approval)=>cp.spawnSync(process.execPath,[script,file,'hero',source,...approval?[approval]:[]],{cwd:repo,encoding:'utf8'});
 try{
  assert.equal(run().status,2);assert.equal(fs.existsSync(path.join(repo,'public/creative-bridge')),false);
  assert.equal(run('--approve-public-use').status,0);const saved=JSON.parse(fs.readFileSync(file));const hash=createHash('sha256').update(bytes).digest('hex');assert.equal(saved.assets[0].sha256,hash);assert.equal(saved.assets[0].state,'ready');assert.ok(fs.readFileSync(path.join(repo,'public',saved.assets[0].public_path)).equals(bytes));
  assert.equal(run('--approve-public-use').status,0);assert.equal(fs.readdirSync(path.join(repo,'public/creative-bridge')).length,1);
  fs.writeFileSync(source,'<svg onload="alert(1)"></svg>');assert.equal(run('--approve-public-use').status,2);assert.equal(JSON.parse(fs.readFileSync(file)).assets[0].sha256,hash);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
