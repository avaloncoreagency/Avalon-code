const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const Ajv=require('ajv');
const b=require('../../scripts/dev-bridge/load.cjs');
const {fixture}=require('./fixture.cjs');
const validate=new Ajv().compile(require('../../schemas/dev-bridge/resume-package.schema.json'));
test('bidirectional continuity: actual isolated git worktrees, synthetic provider records, no overwrite',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'avalon-continuity-'));
 const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const evidence=[];
 try {
  git(root,'init','-b','main');git(root,'config','user.name','Avalon synthetic demo');git(root,'config','user.email','demo@example.invalid');
  fs.writeFileSync(path.join(root,'baseline.txt'),'preserved');git(root,'add','.');git(root,'commit','-m','Synthetic baseline');
  const baseline=git(root,'rev-parse','HEAD');
  for(const [original,resuming] of [['miguel','samuel'],['samuel','miguel']]) {
   git(root,'switch','-c','demo/'+original,baseline);fs.writeFileSync(path.join(root,original+'.txt'),'original work');git(root,'add','.');git(root,'commit','-m',`Refs #8 synthetic ${original} work`);
   const source=git(root,'rev-parse','HEAD');const state=fixture();state.github.data.issues[0].owner=original;state.github.data.pulls[0].branch='demo/'+original;state.github.data.pulls[0].base_sha=baseline;state.github.data.pulls[0].head_sha=source;state.github.data.pulls[0].files=[original+'.txt'];
   const pkg=b.resume(state,8,resuming,'synthetic/isolated',source);assert.ok(validate(pkg));
   // Original owner unavailable: only committed evidence is carried to other worktree.
   const target=path.join(root,'resume-'+resuming);git(root,'worktree','add','-b','resume/'+resuming,target,source);
   assert.equal(fs.readFileSync(path.join(target,original+'.txt'),'utf8'),'original work');fs.writeFileSync(path.join(target,resuming+'.txt'),'continuation');git(target,'add','.');git(target,'commit','-m',`Refs #8 ${resuming} resumes isolated synthetic work`);
   assert.equal(git(root,'rev-parse','demo/'+original),source);assert.equal(git(root,'rev-parse','main'),baseline);assert.equal(fs.readFileSync(path.join(target,'baseline.txt'),'utf8'),'preserved');
   const head=git(target,'rev-parse','HEAD');state.github.data.commits.push({sha:head,date:new Date().toISOString(),author:resuming,url:''});
   evidence.push({original,resuming,base:baseline,source_sha:source,resume_sha:head,source_preserved:true,package:pkg,provider_evidence:'SYNTHETIC; real git operations in temporary repository'});
  }
  fs.mkdirSync('.dev-bridge',{recursive:true});fs.writeFileSync('.dev-bridge/continuity.json',JSON.stringify(evidence,null,2),{mode:0o600});
  assert.equal(evidence.length,2);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('encrypted artifact rejects tampering and keeps secrets out of ciphertext',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'avalon-artifact-'));const script=path.resolve('scripts/dev-bridge/artifact.cjs');
 const env={...process.env,BRIDGE_STATE_KEY:randomBytes(32).toString('hex')};
 try {
  fs.mkdirSync(path.join(root,'.dev-bridge'));fs.writeFileSync(path.join(root,'.dev-bridge/snapshot.json'),JSON.stringify(fixture()));
  execFileSync(process.execPath,[script,'seal'],{cwd:root,env});const file=path.join(root,'.dev-bridge/state.enc');const bytes=fs.readFileSync(file);assert.ok(!bytes.includes(Buffer.from('example.vercel.app')));
  execFileSync(process.execPath,[script,'open'],{cwd:root,env});const before=fs.readFileSync(path.join(root,'.dev-bridge/snapshot.json'));
  bytes[bytes.length-1]^=1;fs.writeFileSync(file,bytes);assert.throws(()=>execFileSync(process.execPath,[script,'open'],{cwd:root,env,stdio:'pipe'}));assert.deepEqual(fs.readFileSync(path.join(root,'.dev-bridge/snapshot.json')),before);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
