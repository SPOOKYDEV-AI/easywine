import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const cwd=fileURLToPath(new URL('../',import.meta.url));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){
 const s=createServer();
 s.listen(0,'127.0.0.1');await once(s,'listening');
 const port=s.address().port;
 await new Promise(resolve=>s.close(resolve));
 return port;
}
test('sandbox UI entrypoint is restricted and always runs in-memory on localhost',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'easywine-ui-isolation-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const sentinel=join(dir,'production.sqlite');
 writeFileSync(sentinel,'PERSISTENT FILE MUST NOT BE TOUCHED');
 const baseEnv={...process.env,EASYWINE_DB:sentinel,PORT:String(await freePort())};
 const launch=(extra={})=>spawn(process.execPath,['scripts/sandbox-audit-server.js'],{
  cwd,env:{...baseEnv,...extra},stdio:['ignore','pipe','pipe']
 });
 const denied=launch({SPOOKY_SANDBOX:''});
 const deniedExit=await once(denied,'exit');
 assert.notEqual(deniedExit[0],0);
 assert.equal(readFileSync(sentinel,'utf8'),'PERSISTENT FILE MUST NOT BE TOUCHED');
 const child=launch({SPOOKY_SANDBOX:'1'});
 let logs='';
 child.stdout.on('data',b=>{logs+=b.toString();});
 child.stderr.on('data',b=>{logs+=b.toString();});
 try{
  let ready=false;
  const url='http://127.0.0.1:'+baseEnv.PORT;
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){
   if(child.exitCode!==null)throw Error('Sandbox UI server exited: '+logs);
   try{const r=await fetch(url+'/healthz');if(r.ok){ready=true;break;}}
   catch{}
   await delay(75);
  }
  assert.equal(ready,true,logs);
  const page=await fetch(url+'/');
  assert.equal(page.status,200);
  assert.match(await page.text(),/easywine/i);
  assert.equal(readFileSync(sentinel,'utf8'),'PERSISTENT FILE MUST NOT BE TOUCHED');
 }finally{
  if(child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}
 }
 assert.equal(readFileSync(sentinel,'utf8'),'PERSISTENT FILE MUST NOT BE TOUCHED');
});
