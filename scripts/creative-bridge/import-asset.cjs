// Import an explicitly approved, already-downloaded Higgsfield asset.
// This does NOT call Higgsfield or verify a remote job; --higgsfield-job records
// the job id supplied by the operator (for subsequent independent verification).
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const {createHash} = require('node:crypto');
const core = require('./continuity-loader.cjs')('src/lib/creative-bridge/continuity.ts');
const {privatePath,read,atomic} = require('./private-files.cjs');
const [manifestFile,assetId,source,approval,jobOption,...extra] = process.argv.slice(2);
const HASH = /^[a-f0-9]{64}$/;
const JOB = /^--higgsfield-job=([a-zA-Z0-9][a-zA-Z0-9_-]{7,119})$/;
const MAX_BYTES = 12 * 1024 * 1024;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function mediaExtension(bytes) {
  // A signature alone is not enough. Reject truncated PNG, JPEG, WebP and MP4.
  if (bytes.length < 24) throw Error('media');
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    if (bytes.readUInt32BE(8)!==13 || bytes.toString('ascii',12,16)!=='IHDR' ||
        bytes.readUInt32BE(16)<1 || bytes.readUInt32BE(20)<1 ||
        bytes.readUInt32BE(16)>16000 || bytes.readUInt32BE(20)>16000) throw Error('media');
    return 'png';
  }
  if (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) {
    if (bytes[bytes.length-2]!==255 || bytes[bytes.length-1]!==217) throw Error('media');
    return 'jpg';
  }
  if (bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP') {
    if (bytes.readUInt32LE(4)!==bytes.length-8) throw Error('media');
    return 'webp';
  }
  if (bytes.toString('ascii',4,8)==='ftyp') {
    const box=bytes.readUInt32BE(0);
    if (box<16 || box>bytes.length) throw Error('media');
    return 'mp4';
  }
  throw Error('media');
}
function safeFileBytes(filename) {
  // lstat + O_NOFOLLOW + fstat prevents a symlink from publishing local secrets.
  if (typeof filename!=='string' || !filename) throw Error('source');
  const info=fs.lstatSync(filename);
  if (!info.isFile() || info.size<24 || info.size>MAX_BYTES) throw Error('size');
  const fd=fs.openSync(filename,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try {
    const open=fs.fstatSync(fd);
    if (!open.isFile() || open.size<24 || open.size>MAX_BYTES ||
        open.ino!==info.ino || open.dev!==info.dev) throw Error('source_changed');
    const bytes=Buffer.alloc(open.size);
    let offset=0;
    while (offset<bytes.length) {
      const count=fs.readSync(fd,bytes,offset,bytes.length-offset,offset);
      if (!count) throw Error('short_read');
      offset+=count;
    }
    if (fs.fstatSync(fd).size!==bytes.length) throw Error('source_changed');
    return bytes;
  } finally { fs.closeSync(fd); }
}
function verifyOutput(filename,digest) {
  const entry=fs.lstatSync(filename);
  if (!entry.isFile() || entry.isSymbolicLink() || entry.size>MAX_BYTES ||
      sha256(safeFileBytes(filename))!==digest) throw Error('published_asset_unavailable');
}

try {
  if (approval!=='--approve-public-use' || extra.length>0 ||
      (jobOption!==undefined && !JOB.test(jobOption))) throw Error('approval');
  const reportedJob=jobOption ? 'higgsfield:'+JOB.exec(jobOption)[1] : null;
  const file=privatePath(manifestFile),lock=file+'.lock',fd=fs.openSync(lock,'wx',0o600);
  try {
    let m=core.manifest(read(file));
    const asset=m.assets.find(a=>a.id===assetId);
    if (!asset) throw Error('identity');
    if (reportedJob && asset.job_ref && asset.job_ref!==reportedJob) throw Error('job_mismatch');
    const bytes=safeFileBytes(source),ext=mediaExtension(bytes);
    if ((ext==='mp4')!==(asset.kind==='video')) throw Error('kind');
    if (asset.kind==='video'&&!m.assets.some(a=>a.kind==='image'&&a.state==='ready'&&a.storage_ref===asset.reduced_motion_ref&&a.public_path)) throw Error('fallback');
    const digest=sha256(bytes);
    const root=cp.execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
    const publicRoot=path.join(root,'public');
    if (fs.realpathSync(publicRoot)!==publicRoot) throw Error('public_symlink');
    const outputDir=path.join(publicRoot,'creative-bridge');
    const output=path.join(outputDir,digest+'.'+ext);
    const publicPath='/creative-bridge/'+digest+'.'+ext;
    if (asset.state==='ready') {
      if (asset.sha256!==digest || !HASH.test(digest) ||
          asset.public_path!==publicPath || asset.storage_ref!=='sha256:'+digest) throw Error('immutable');
      verifyOutput(output,digest);
      console.log('Approved media already exists and actual published bytes match. No new upload.');
    } else {
      if (!['pending','generating'].includes(asset.state)) throw Error('state');
      fs.mkdirSync(outputDir,{recursive:true});
      if (fs.realpathSync(outputDir)!==outputDir) throw Error('public_symlink');
      if (fs.existsSync(output)) verifyOutput(output,digest);
      else fs.writeFileSync(output,bytes,{flag:'wx',mode:0o644});
      const job_ref=reportedJob??asset.job_ref??'approved-local-import';
      if (asset.state==='pending') m=core.reconcile(m,{
        id:'import-start:'+asset.id+':'+digest.slice(0,12),
        source_sha:m.head_sha,agent:m.agent,kind:'asset.result',
        asset:{...asset,state:'generating',job_ref},
      });
      const current=m.assets.find(a=>a.id===asset.id);
      m=core.reconcile(m,{
        id:'import-ready:'+asset.id+':'+digest.slice(0,12),
        source_sha:m.head_sha,agent:m.agent,kind:'asset.result',
        asset:{...current,state:'ready',job_ref,storage_ref:'sha256:'+digest,
          sha256:digest,public_path:publicPath},
      });
      atomic(file,m);
      console.log('Approved bytes copied and checkpoint saved. Operator-supplied job references are not remote-verified. Review diff; not deployed.');
    }
  } finally {fs.closeSync(fd);fs.unlinkSync(lock);}
} catch {
  console.error('Import refused. Check approval, local file/symlinks, integrity, provenance, manifest and published asset.');
  process.exitCode=2;
}
