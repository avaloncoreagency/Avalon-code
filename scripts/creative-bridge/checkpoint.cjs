// Private-file CLI. No network, provider generation or database credentials.
const fs=require('node:fs');const cp=require('node:child_process');
const core=require('./continuity-loader.cjs')('src/lib/creative-bridge/continuity.ts');
const [command,file,...args]=process.argv.slice(2);
const {privatePath,read,atomic}=require('./private-files.cjs');
async function main(){try{
 const input=privatePath(file);let m=core.manifest(read(input));
 if(command==='validate'){console.log(JSON.stringify({valid:true,agent:m.agent,assets:m.assets.length,registration:'NOT_PERFORMED'}));}
 else if(command==='plan'){const p=core.registrationPlan(m);console.log(JSON.stringify({status:p.status,registration:'NOT_PERFORMED'}));}
 else {
  const lock=input+'.lock';const fd=fs.openSync(lock,'wx',0o600);
  try{
   m=core.manifest(read(input));
   if(command==='event')m=core.reconcile(m,read(args[0]));
   else if(command==='register'){
    const result=await require('./register.cjs').registerPrivate(input,m);
    if(result.status!=='recorded'){console.error('Registration not performed or not confirmed: '+result.status);process.exitCode=2;return;}
    m=result.manifest;
   }
   else if(command==='advance'){const current=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();if(current!==args[1])throw Error('commit');const branch=cp.execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim();m=core.advance(m,args[0],args[1],branch,args[2]);}
   else if(command==='handoff')m=core.handoff(m,args[0],args[1],args[2]);
   else if(command==='emit-delivery'){
    const plan=core.registrationPlan(m);if(plan.status!=='ready_for_authorized_submission')throw Error('blocked');
    const output=privatePath(args[0]);if(fs.existsSync(output))throw Error('exists');atomic(output,plan.delivery);console.log('Private delivery exported; submission NOT_PERFORMED.');process.exitCode=0;
   }else throw Error('command');
   if(command!=='emit-delivery'){atomic(input,m);console.log(command==='register'?'Registration receipt saved; publication NOT_PERFORMED.':'Private checkpoint saved; registration NOT_PERFORMED.');}
  }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
 }
}catch{console.error('Creative checkpoint refused: check schema, external private paths, source SHA, agent, existing file or lock. An unconfirmed delivery must be retried with the same reference.');process.exitCode=2;}
}
main().catch(()=>{console.error('Checkpoint operation could not be confirmed. Retry using the same project reference.');process.exitCode=2;});
