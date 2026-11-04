#!/usr/bin/env node
// Offline validation only. Never makes a network call or registers a CRM lead.
// Avoid printing the source document: it may contain private company details.
const fs=require("node:fs");
const path=require("node:path");
const ts=require("typescript");
const {createHash}=require("node:crypto");

function loadParser(){
 const source=fs.readFileSync("src/lib/os/creative-bridge-protocol.ts","utf8");
 const js=ts.transpileModule(source,{compilerOptions:{
   module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
 }}).outputText;
 const exports={};
 new Function("require","exports",js)((name)=>{
   if(name==="node:crypto")return require("node:crypto");
   throw Error("Unexpected protocol import");
 },exports);
 return exports;
}
try{
 const manifest=process.argv[2];
 if(!manifest || process.argv.length!==3)throw Error("usage");
 const info=fs.statSync(path.resolve(manifest));
 if(!info.isFile() || info.size>8192 || info.size===0)throw Error("size");
 const input=fs.readFileSync(path.resolve(manifest));
 const parsed=JSON.parse(input.toString("utf8"));
 const compact=Buffer.from(JSON.stringify(parsed),"utf8");
 if(compact.length>8192)throw Error("size");
 const protocol=loadParser();
 const delivery=protocol.parseCreativeDelivery(parsed);
 console.log(JSON.stringify({
   valid:true,bridge_enabled:"NOT_CHECKED",registration:"NOT_PERFORMED",
   module:delivery.module,
   source_ref_fingerprint:createHash("sha256").update(delivery.source_ref).digest("hex").slice(0,12),
   linked_existing_lead:Boolean(delivery.existing_lead_id),
   stable_project_url_present:Boolean(delivery.project_url),
   source_repository_present:Boolean(delivery.repository_url),
   asset_imported:false,
   reminder:"This validates reference_only metadata, not a real Higgsfield asset or deployment.",
 }));
}catch{
 console.error("Invalid creative handoff. Required: private JSON v1, stable HTTPS and exact company/module. No registration was attempted.");
 process.exitCode=2;
}
