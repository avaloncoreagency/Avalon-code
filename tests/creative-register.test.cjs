const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {registerPrivate}=require('../scripts/creative-bridge/register.cjs');
test('single-command registration reuses signed transport, keeps receipts and removes private exports',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'creative-register-'));
 const input=path.join(directory,'private.json');
 const document=JSON.parse(fs.readFileSync('tests/fixtures/creative-manifest.synthetic.json','utf8'));
 document.ci='PASSED';document.delivery={schema_version:1,provider:'higgsfield',module:'website',source_ref:document.project_ref,company_name:'Synthetic only',existing_lead_id:null,product_name:'Synthetic',description:'Not sold',project_url:'https://synthetic.example.invalid/',repository_url:''};
 let calls=0;const id='00000000-0000-4000-8000-000000000001';
 const run=(command,args)=>{calls++;assert.equal(command,process.execPath);assert.ok(args[0].endsWith('submit.mjs'));assert.deepEqual(JSON.parse(fs.readFileSync(args[1],'utf8')),document.delivery);assert.equal(fs.statSync(args[1]).mode&0o777,0o600);return JSON.stringify({project_path:'/admin/workspace/products/'+id,company_path:'/admin/workspace/clients/'+id});};
 try{
  const result=await registerPrivate(input,document,run);assert.equal(result.status,'recorded');assert.equal(result.manifest.receipt.project_id,id);assert.deepEqual(fs.readdirSync(directory),[]);
  assert.equal((await registerPrivate(input,result.manifest,run)).status,'recorded');assert.equal(calls,1);
  assert.equal((await registerPrivate(input,{...document,delivery:null},run)).status,'unassigned');assert.equal(calls,1);
  assert.equal((await registerPrivate(input,document,()=>JSON.stringify({project_path:'https://attacker.invalid',company_path:'bad'}))).status,'failed');
  assert.equal((await registerPrivate(input,document,()=>{throw Error('PRIVATE SECRET');})).status,'failed');assert.deepEqual(fs.readdirSync(directory),[]);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
