// Explicitly approved local media only. No network, generation or publication.
const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');const {createHash}=require('node:crypto');
const core=require('./continuity-loader.cjs')('src/lib/creative-bridge/continuity.ts');const {privatePath,read,atomic}=require('./private-files.cjs');
const [manifestFile,assetId,source,approval]=process.argv.slice(2);
try{
 if(approval!=='--approve-public-use')throw Error('approval');
 const file=privatePath(manifestFile),lock=file+'.lock',fd=fs.openSync(lock,'wx',0o600);
 try{
  let m=core.manifest(read(file));const asset=m.assets.find(a=>a.id===assetId);if(!asset)throw Error('identity');
  const stat=fs.statSync(source);if(!stat.isFile()||stat.size<12||stat.size>12*1024*1024)throw Error('size');const bytes=fs.readFileSync(source);
  let ext;if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))ext='png';else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)ext='jpg';else if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')ext='webp';else if(bytes.toString('ascii',4,8)==='ftyp')ext='mp4';else throw Error('media');
  if((ext==='mp4')!==(asset.kind==='video'))throw Error('kind');
  if(asset.kind==='video'&&!m.assets.some(a=>a.kind==='image'&&a.state==='ready'&&a.storage_ref===asset.reduced_motion_ref&&a.public_path))throw Error('fallback');
  const digest=createHash('sha256').update(bytes).digest('hex');
  if(asset.state==='ready'){if(asset.sha256!==digest)throw Error('immutable');console.log('Existing approved import verified. No publication performed.');}
  else{
   if(!['pending','generating'].includes(asset.state))throw Error('state');
   const root=cp.execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();const publicRoot=path.join(root,'public');if(fs.realpathSync(publicRoot)!==publicRoot)throw Error('public symlink');
   const outputDir=path.join(publicRoot,'creative-bridge');fs.mkdirSync(outputDir,{recursive:true});if(fs.realpathSync(outputDir)!==outputDir)throw Error('public symlink');
   const output=path.join(outputDir,digest+'.'+ext);
   if(fs.existsSync(output)){if(fs.lstatSync(output).isSymbolicLink()||createHash('sha256').update(fs.readFileSync(output)).digest('hex')!==digest)throw Error('collision');}else fs.writeFileSync(output,bytes,{flag:'wx',mode:0o644});
   if(asset.state==='pending')m=core.reconcile(m,{id:'import-start:'+asset.id+':'+digest.slice(0,12),source_sha:m.head_sha,agent:m.agent,kind:'asset.result',asset:{...asset,state:'generating',job_ref:asset.job_ref??'approved-local-import'}});
   m=core.reconcile(m,{id:'import-ready:'+asset.id+':'+digest.slice(0,12),source_sha:m.head_sha,agent:m.agent,kind:'asset.result',asset:{...asset,state:'ready',job_ref:asset.job_ref??'approved-local-import',storage_ref:'sha256:'+digest,sha256:digest,public_path:'/creative-bridge/'+digest+'.'+ext}});
   atomic(file,m);console.log('Approved media copied into public/creative-bridge and checkpoint saved. Review Git diff; no deployment or provider generation performed.');
  }
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}catch{console.error('Import refused. Check public-use approval, private manifest, asset state, media signature, size, fallback and source identity.');process.exitCode=2;}
