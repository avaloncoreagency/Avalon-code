// Private-file CLI. No network, provider generation or database credentials.
const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');
const core=require('./continuity-loader.cjs')('src/lib/creative-bridge/continuity.ts');
const [command,file,...args]=process.argv.slice(2);
function privatePath(value){if(!value)throw Error('path');const result=path.resolve(value);const root=cp.execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();if(result===root||result.startsWith(root+path.sep))throw Error('private');return result;}
function read(value){const p=privatePath(value);if(fs.statSync(p).size>262144)throw Error('size');return JSON.parse(fs.readFileSync(p,'utf8'));}
function atomic(p,value){const tmp=p+'.'+process.pid+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,p);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
try{
 const input=privatePath(file);let m=core.manifest(read(input));
 if(command==='validate'){console.log(JSON.stringify({valid:true,agent:m.agent,assets:m.assets.length,registration:'NOT_PERFORMED'}));}
 else if(command==='plan'){const p=core.registrationPlan(m);console.log(JSON.stringify({status:p.status,registration:'NOT_PERFORMED'}));}
 else {
  const lock=input+'.lock';const fd=fs.openSync(lock,'wx',0o600);
  try{
   m=core.manifest(read(input));
   if(command==='event')m=core.reconcile(m,read(args[0]));
   else if(command==='handoff')m=core.handoff(m,args[0],args[1],args[2]);
   else if(command==='emit-delivery'){
    const plan=core.registrationPlan(m);if(plan.status!=='ready_for_authorized_submission')throw Error('blocked');
    const output=privatePath(args[0]);if(fs.existsSync(output))throw Error('exists');atomic(output,plan.delivery);console.log('Private delivery exported; submission NOT_PERFORMED.');process.exitCode=0;
   }else throw Error('command');
   if(command!=='emit-delivery'){atomic(input,m);console.log('Private checkpoint saved; registration NOT_PERFORMED.');}
  }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
 }
}catch{console.error('Creative checkpoint refused: check schema, external private paths, source SHA, agent, existing file or lock. No remote action performed.');process.exitCode=2;}
