
import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {createApp} from '../src/server/index.js';
import {encryptMfaSecret,totpAt} from '../src/server/mfa-crypto.js';

test('MFA failure limits survive new challenges and missing keys never fall back to password-only',async t=>{
 const previous=process.env.EASYWINE_MFA_KEY,priorFile=process.env.EASYWINE_MFA_KEY_FILE;
 const key=randomBytes(32),secret=randomBytes(20),db=openDatabase(':memory:');
 process.env.EASYWINE_MFA_KEY=key.toString('hex');delete process.env.EASYWINE_MFA_KEY_FILE;
 const owner=bootstrap(db,{slug:'locked-owner',name:'Locked',email:'owner@example.fr',
  owner:'Alice',password:'Strong-Test-MFA-2026!'});
 db.prepare('INSERT INTO mfa_credentials(user_id,encrypted_secret,enabled,created_at) VALUES(?,?,1,?)')
  .run(owner.userId,encryptMfaSecret(secret,owner.userId,key),new Date().toISOString());
 const server=createApp({db});server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{
  await new Promise(done=>server.close(done));db.close();key.fill(0);secret.fill(0);
  if(previous===undefined)delete process.env.EASYWINE_MFA_KEY;else process.env.EASYWINE_MFA_KEY=previous;
  if(priorFile===undefined)delete process.env.EASYWINE_MFA_KEY_FILE;else process.env.EASYWINE_MFA_KEY_FILE=priorFile;
 });
 const origin='http://127.0.0.1:'+server.address().port;
 async function post(path,payload){
  const response=await fetch(origin+path,{method:'POST',headers:{
   Origin:origin,'Content-Type':'application/json','X-EasyWine-Request':'1'
  },body:JSON.stringify(payload)});
  return {status:response.status,result:await response.json(),cookie:response.headers.get('set-cookie')};
 }
 const passwordLogin=()=>post('/api/login',{slug:'locked-owner',email:'owner@example.fr',
  password:'Strong-Test-MFA-2026!'});
 const initial=await passwordLogin();
 assert.equal(initial.result.mfaRequired,true);
 assert.equal(initial.cookie,null);
 for(let i=0;i<5;i++){
  const failure=await post('/api/login/mfa',{challenge:initial.result.challenge,code:'not-an-otp'});
  assert.equal(failure.status,401);
 }
 assert.equal((await passwordLogin()).status,429);
 assert.ok(db.prepare('SELECT locked_until FROM mfa_credentials WHERE user_id=?').get(owner.userId).locked_until>new Date().toISOString());
 db.prepare('UPDATE mfa_credentials SET failed_attempts=0,locked_until=NULL WHERE user_id=?').run(owner.userId);
 const unlocked=await passwordLogin();
 assert.equal(unlocked.status,200);
 delete process.env.EASYWINE_MFA_KEY;
 const missingKey=await post('/api/login/mfa',{challenge:unlocked.result.challenge,code:totpAt(secret)});
 assert.equal(missingKey.status,500);
 assert.equal(missingKey.cookie,null);
 const me=await fetch(origin+'/api/me');
 assert.equal(me.status,401);
});
