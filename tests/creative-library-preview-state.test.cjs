const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const compile = (file, jsx = false) => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: jsx ? ts.JsxEmit.ReactJSX : undefined, esModuleInterop: true},
}).outputText;
const media = {exports: {}};
new Function('module','exports','require', compile('src/app/admin/creative-bridge/media-safety.ts'))(
  media,media.exports, () => {throw Error('Unexpected runtime media dependency');});
const sha = 'a'.repeat(64);
const image = {id:'still',kind:'image',state:'ready',sha256:sha,
  public_path:'/creative-bridge/'+sha+'.webp',alt:'Synthetic illustration',storage_ref:'sha256:'+sha};
const runtime = {jsx:(type,props)=>({type,props}), jsxs:(type,props)=>({type,props})};
const ui = {exports:{}};
new Function('module','exports','require', compile('src/app/admin/creative-bridge/asset.tsx', true))(
  ui,ui.exports, id => {
    if(id==='react/jsx-runtime')return runtime;
    if(id==='next/image')return {__esModule:true,default:'Image'};
    if(id==='@/lib/i18n')return {pick:(lang,es,en)=>lang==='en'?en:es};
    if(id==='./media-safety')return media.exports;
    if(id==='./media.module.css')return {motion:'motion',still:'still'};
    throw Error('Unexpected dependency '+id);
  });
const treeText = node => Array.isArray(node) ? node.map(treeText).join(' ')
  : typeof node === 'object' && node !== null
    ? [String(node.type), ...Object.values(node.props || {}).map(treeText)].join(' ')
    : String(node ?? '');

test('blocked, pending and reference-only statuses withhold otherwise ready media',()=>{
  for(const status of ['blocked','pending','reference_only']){
    assert.equal(media.exports.previewPathForStatus(status,image),null);
    const result=ui.exports.CreativeAsset({asset:image,assets:[image],lang:'es',status});
    assert.match(treeText(result),/Vista previa retenida/);
    assert.doesNotMatch(treeText(result),/Image|video/);
  }
});
test('only registered local paths render a preview, with no claim of byte verification',()=>{
  assert.equal(media.exports.previewPathForStatus('imported',image),image.public_path);
  const result=ui.exports.CreativeAsset({asset:image,assets:[image],lang:'en',status:'imported'});
  assert.equal(result.type,'Image');
  assert.equal(result.props.src,image.public_path);
  assert.equal(media.exports.previewPathForStatus('imported',{...image,public_path:'https://x.invalid/a.webp'}),null);
});
test('English and Spanish withheld states remain meaningful without loading media',()=>{
  const spanish=treeText(ui.exports.CreativeAsset({asset:image,assets:[image],lang:'es',status:'blocked'}));
  const english=treeText(ui.exports.CreativeAsset({asset:image,assets:[image],lang:'en',status:'blocked'}));
  assert.match(spanish,/bloqueado/);
  assert.match(english,/blocked/);
});
