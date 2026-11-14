const {test}=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{once}=require('node:events');
const stop=require('./support/stop-child.cjs');
test('fixture cleanup handles an already exited child and terminates a running child',async()=>{
 const exited=spawn(process.execPath,['-e','process.exit(0)']);await once(exited,'exit');await stop(exited);assert.equal(exited.exitCode,0);
 const running=spawn(process.execPath,['-e','setInterval(()=>{},1000)']);await once(running,'spawn');await stop(running);assert.notEqual(running.signalCode,null);
});
