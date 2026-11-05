const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source=fs.readFileSync('src/app/admin/creative-bridge/media-safety.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const mod={exports:{}};
new Function('module','exports','require',js)(mod,mod.exports,()=>{throw Error('Unexpected runtime dependency')});
const {safeCreativeMediaPath,safeReducedMotionImage}=mod.exports;
const sha='a'.repeat(64), other='b'.repeat(64);
const image={id:'still',kind:'image',state:'ready',sha256:sha,public_path:'/creative-bridge/'+sha+'.webp',storage_ref:'sha256:'+sha,reduced_motion_ref:null};
const video={id:'video',kind:'video',state:'ready',sha256:other,public_path:'/creative-bridge/'+other+'.mp4',storage_ref:'sha256:'+other,reduced_motion_ref:'sha256:'+sha};

test('only exact local checksum paths for supported image and MP4 preview',()=>{
 assert.equal(safeCreativeMediaPath(image), image.public_path);
 assert.equal(safeCreativeMediaPath(video), video.public_path);
 for(const ext of ['png','jpg','jpeg','webp']) assert.equal(safeCreativeMediaPath({...image,public_path:'/creative-bridge/'+sha+'.'+ext}),'/creative-bridge/'+sha+'.'+ext);
});
test('reject signed URLs, external hosts, mismatched SHA, script, SVG, GLB and traversal',()=>{
 for(const path of [
   'https://cdn.example/file.webp','//cdn.example/file.webp',
   '/creative-bridge/'+sha+'.webp?token=secret','/creative-bridge/'+sha+'.webp#preview',
   '/creative-bridge/'+sha+'.svg','/creative-bridge/'+sha+'.glb','/creative-bridge/'+sha+'.html',
   '/creative-bridge/'+other+'.webp','/creative-bridge/'+sha+'.webp/../other',
   '/creative-bridge/'+sha+'.webp.mp4',
 ]) assert.equal(safeCreativeMediaPath({...image,public_path:path}),null,path);
 assert.equal(safeCreativeMediaPath({...image,sha256:'invalid'}),null);
 assert.equal(safeCreativeMediaPath({...image,state:'pending'}),null);
 assert.equal(safeCreativeMediaPath({...video,public_path:'/creative-bridge/'+other+'.webp'}),null);
});
test('video loads only with matching, ready, safe reduced-motion image',()=>{
 assert.deepEqual(safeReducedMotionImage(video,[image]),image);
 assert.equal(safeReducedMotionImage(video,[{...image,public_path:'https://cdn.example/unsafe.webp'}]),null);
 assert.equal(safeReducedMotionImage(video,[{...image,state:'failed'}]),null);
 assert.equal(safeReducedMotionImage(video,[{...image,storage_ref:'sha256:'+other}]),null);
 assert.equal(safeReducedMotionImage({...video,reduced_motion_ref:''},[image]),null);
 assert.equal(safeReducedMotionImage({...video,public_path:'https://cdn.example/unsafe.mp4'},[image]),null);
 assert.equal(safeReducedMotionImage(image,[image]),null);
});
