/**
 * Real Chromium screenshots of Website Designer's real HTML exporter, using
 * entirely synthetic site content. This is NOT a capture of a deployed Avalon
 * admin Preview or proof that owner sessions can save remotely.
 */
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const {chromium}=require("./qa/node_modules/playwright");

function loadTs(file,mocks={}) {
  const js=ts.transpileModule(fs.readFileSync(file,"utf8"),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const loaded={exports:{}};
  new Function("require","module","exports",js)((id)=>id in mocks?mocks[id]:require(id),loaded,loaded.exports);
  return loaded.exports;
}
const domain=loadTs("src/lib/os/domain.ts");
const {pageToHtml}=loadTs("src/lib/os/exporters.ts",{"./domain":domain});

test("render the actual Website Designer HTML export at desktop and iPhone widths",{
  timeout:60000,
},async()=>{
 const html=pageToHtml({
  title:"Forge — sitio sintético",
  seo_description:"Ejemplo de exportación privada sin datos de clientes.",
  blocks:[
    {type:"hero",heading:"Avalon Forge",subheading:"Crea, guarda y recupera un sitio real.",buttonLabel:"Servicios",buttonHref:"#servicios"},
    {type:"features",heading:"Servicios",items:["Website Designer","E-commerce Designer","CRM Creator"]},
    {type:"text",heading:"Edición persistente",body:"El HTML proviene del exportador real de Avalon OS. Contenido de prueba."},
    {type:"cta",heading:"Entrega",body:"Descarga HTML autónomo y revisa antes de publicar.",buttonLabel:"Volver arriba",buttonHref:"#servicios"},
  ],
 },"es");
 assert.match(html,/<title>Forge — sitio sintético<\/title>/);
 fs.mkdirSync("artifacts/forge",{recursive:true});
 const browser=await chromium.launch({headless:true});
 try{
  for(const [name,width,height] of [["desktop",1280,900],["iphone",390,844]]){
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
   await page.setContent(html,{waitUntil:"load"});
   assert.equal(await page.title(),"Forge — sitio sintético");
   assert.equal(await page.locator("h1").textContent(),"Avalon Forge");
   assert.equal(await page.locator(".features li").count(),3);
   await page.screenshot({path:path.join("artifacts","forge",`website-export-${name}.png`),fullPage:true});
   await page.close();
  }
 }finally{await browser.close();}
});
