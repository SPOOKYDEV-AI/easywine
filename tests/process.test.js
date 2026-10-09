
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {openDatabase} from '../src/server/db.js';

async function freePort(){
 const socket=createServer();
 socket.listen(0,'127.0.0.1');
 await once(socket,'listening');
 const port=socket.address().port;
 await new Promise(resolve=>socket.close(resolve));
 return port;
}
test('standalone Node server boots, serves the UI and survives process restart',async t=>{
 const folder=mkdtempSync(join(tmpdir(),'easywine-process-'));
 t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const path=join(folder,'service.sqlite');
 const port=await freePort();
 const url='http://127.0.0.1:'+port;
 async function boot(){
  const child=spawn(process.execPath,['src/server/index.js'],{
   cwd:fileURLToPath(new URL('../',import.meta.url)),
   env:{...process.env,PORT:String(port),HOST:'127.0.0.1',EASYWINE_DB:path},
   stdio:['ignore','pipe','pipe']
  });
  let logs='';
  child.stdout.on('data',chunk=>{logs+=chunk.toString();});
  child.stderr.on('data',chunk=>{logs+=chunk.toString();});
  let response;
  const deadline=Date.now()+7500;
  while(Date.now()<deadline){
   if(child.exitCode!==null)throw Error('Server exited unexpectedly: '+logs);
   try{response=await fetch(url+'/healthz');if(response.ok)break;}catch{}
   await new Promise(resolve=>setTimeout(resolve,70));
  }
  if(!response?.ok){
   child.kill();
   throw Error('Server failed to start: '+logs);
  }
  return child;
 }
 async function stop(child){
  if(child.exitCode!==null)return;
  child.kill('SIGTERM');
  await once(child,'exit');
 }
 const first=await boot();
 try{
  const response=await fetch(url+'/');
  assert.equal(response.status,200);
  assert.ok((await response.text()).includes('EasyWine'));
 }finally{await stop(first);}
 assert.ok(existsSync(path));
 const data=openDatabase(path);
 assert.equal(data.prepare('SELECT MAX(version) AS v FROM schema_version').get().v,5);
 data.close();
 const second=await boot();
 try{assert.equal((await fetch(url+'/healthz')).status,200);}
 finally{await stop(second);}
});
