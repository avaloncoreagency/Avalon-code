// Fixtures must not hang awaiting an exit event that already happened.
module.exports=async function stopChild(child){
 if(child.exitCode!==null||child.signalCode!==null)return;
 await new Promise(resolve=>{
  const timer=setTimeout(()=>{child.kill('SIGKILL');resolve()},3000);timer.unref();
  child.once('exit',()=>{clearTimeout(timer);resolve()});child.kill();
 });
};
