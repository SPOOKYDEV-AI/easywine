
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {encryptMfaSecret} from '../src/server/mfa-crypto.js';
import {verifyMfaServerKey} from '../src/server/mfa.js';

test('existing MFA accounts must be decryptable before a real server can start',async t=>{
 const folder=mkdtempSync(join(tmpdir(),'easywine-mfa-boot-'));
 t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const filepath=join(folder,'db.sqlite');
 const db=openDatabase(filepath);
 const owner=bootstrap(db,{slug:'mfa-boot',name:'Maison test',email:'owner@example.fr',
  owner:'Owner',password:'A-Secure-Password-2026!'});
 const key=randomBytes(32),secret=randomBytes(20);
 db.prepare('INSERT INTO mfa_credentials(user_id,encrypted_secret,enabled,created_at) VALUES(?,?,1,?)')
   .run(owner.userId,encryptMfaSecret(secret,owner.userId,key),new Date().toISOString());
 const old=process.env.EASYWINE_MFA_KEY,oldFile=process.env.EASYWINE_MFA_KEY_FILE;
 try{
  process.env.EASYWINE_MFA_KEY=key.toString('hex');delete process.env.EASYWINE_MFA_KEY_FILE;
  assert.deepEqual(verifyMfaServerKey(db),{configured:true,accounts:1});
  process.env.EASYWINE_MFA_KEY=randomBytes(32).toString('hex');
  assert.throws(()=>verifyMfaServerKey(db));
  delete process.env.EASYWINE_MFA_KEY;
  assert.throws(()=>verifyMfaServerKey(db));
 }finally{
  if(old===undefined)delete process.env.EASYWINE_MFA_KEY;else process.env.EASYWINE_MFA_KEY=old;
  if(oldFile===undefined)delete process.env.EASYWINE_MFA_KEY_FILE;else process.env.EASYWINE_MFA_KEY_FILE=oldFile;
  db.close();key.fill(0);secret.fill(0);
 }
 // Subprocess must actually exit nonzero, not just return an unhealthy /healthz.
 const child=spawn(process.execPath,['src/server/index.js'],{
  cwd:fileURLToPath(new URL('../',import.meta.url)),
  env:{...process.env,EASYWINE_DB:filepath,EASYWINE_MFA_KEY:'',EASYWINE_MFA_KEY_FILE:''},
  stdio:['ignore','pipe','pipe']
 });
 let output='';
 child.stdout.on('data',x=>output+=x.toString());
 child.stderr.on('data',x=>output+=x.toString());
 const result=await new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
 assert.notEqual(result.code,0);
 assert.match(output,/EASYWINE_MFA_KEY/);
});
test('a brand-new installation can start without an MFA encryption key',()=>{
 const db=openDatabase(':memory:');
 try{assert.deepEqual(verifyMfaServerKey(db),{configured:false,accounts:0});}
 finally{db.close();}
});
