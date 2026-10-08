
import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {createApp} from '../src/server/index.js';
import {decryptMfaSecret,totpAt,base32} from '../src/server/mfa-crypto.js';

const password='MFA-Strong-Test-Password-2026!';
test('full MFA lifecycle: enrollment, no password bypass, OTP replay, recovery and revocation',async t=>{
 const previous=process.env.EASYWINE_MFA_KEY,priorFile=process.env.EASYWINE_MFA_KEY_FILE;
 const encryptionKey=randomBytes(32);
 process.env.EASYWINE_MFA_KEY=encryptionKey.toString('hex');
 delete process.env.EASYWINE_MFA_KEY_FILE;
 const db=openDatabase(':memory:');
 const owner=bootstrap(db,{slug:'mfa-a',name:'Maison MFA',email:'owner@example.fr',owner:'Alice',password});
 bootstrap(db,{slug:'mfa-b',name:'Autre Maison',email:'owner@example.fr',owner:'Bob',password});
 const server=createApp({db});server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{
  await new Promise(done=>server.close(done));db.close();encryptionKey.fill(0);
  if(previous===undefined)delete process.env.EASYWINE_MFA_KEY;else process.env.EASYWINE_MFA_KEY=previous;
  if(priorFile===undefined)delete process.env.EASYWINE_MFA_KEY_FILE;
  else process.env.EASYWINE_MFA_KEY_FILE=priorFile;
 });
 const origin='http://127.0.0.1:'+server.address().port;
 async function call(method,path,body,cookie){
  const response=await fetch(origin+path,{method,headers:{
   ...(method==='GET'?{}:{Origin:origin,'Content-Type':'application/json','X-EasyWine-Request':'1'}),
   ...(cookie?{Cookie:cookie}:{})
  },...(method==='GET'?{}:{body:JSON.stringify(body||{})})});
  return {status:response.status,data:await response.json(),
   cookie:response.headers.get('set-cookie')?.split(';')[0]};
 }
 const login=async(slug='mfa-a',pass=password)=>
  call('POST','/api/login',{slug,email:'owner@example.fr',password:pass});
 const initial=await login();
 assert.equal(initial.status,200);
 assert.ok(initial.cookie);
 const unauthenticated=await call('GET','/api/me/mfa');
 assert.equal(unauthenticated.status,401);
 assert.equal((await call('POST','/api/me/mfa/setup',{password:'bad'},initial.cookie)).status,403);
 const setup=await call('POST','/api/me/mfa/setup',{password},initial.cookie);
 assert.equal(setup.status,200);
 assert.match(setup.data.secret,/^[A-Z2-7]{32}$/);
 assert.match(setup.data.uri,/^otpauth:\/\/totp\//);
 assert.equal((await call('GET','/api/me/mfa',null,initial.cookie)).data.pending,true);
 const credential=db.prepare('SELECT * FROM mfa_credentials WHERE user_id=?').get(owner.userId);
 const secret=decryptMfaSecret(credential.encrypted_secret,owner.userId,encryptionKey);
 assert.equal(setup.data.secret,base32(secret));
 const otp=totpAt(secret);
 assert.equal((await call('POST','/api/me/mfa/confirm',{code:'000000'},initial.cookie)).status,401);
 const enabled=await call('POST','/api/me/mfa/confirm',{code:otp},initial.cookie);
 assert.equal(enabled.status,200);
 assert.equal(enabled.data.codes.length,8);
 assert.ok(enabled.data.sessionRevoked);
 assert.equal((await call('GET','/api/me',null,initial.cookie)).status,401);
 const required=await login();
 assert.equal(required.status,200);
 assert.equal(required.data.mfaRequired,true);
 assert.match(required.data.challenge,/^[A-Za-z0-9_-]{43}$/);
 assert.equal(required.cookie,undefined);
 assert.equal((await call('GET','/api/me')).status,401);
 assert.equal((await call('POST','/api/login/mfa',{challenge:required.data.challenge,code:'invalid'})).status,401);
 assert.equal((await call('POST','/api/login/mfa',{challenge:required.data.challenge,code:otp})).status,401);
 const correct=await call('POST','/api/login/mfa',{challenge:required.data.challenge,code:enabled.data.codes[0]});
 assert.equal(correct.status,200);
 assert.ok(correct.cookie);
 assert.equal((await call('GET','/api/me/mfa',null,correct.cookie)).data.enabled,true);
 const replayChallenge=await login();
 assert.equal((await call('POST','/api/login/mfa',{challenge:replayChallenge.data.challenge,code:otp})).status,401);
 const recovery=await call('POST','/api/login/mfa',{
  challenge:replayChallenge.data.challenge,code:enabled.data.codes[1]});
 assert.equal(recovery.status,200);
 assert.ok(recovery.cookie);
 const again=await login();
 assert.equal((await call('POST','/api/login/mfa',{challenge:again.data.challenge,code:enabled.data.codes[2]})).status,401);
 assert.equal((await call('GET','/api/me/mfa',null,recovery.cookie)).data.recoveryCodesRemaining,6);
 // Password rotation invalidates an outstanding MFA challenge too.
 const outstanding=await login();
 assert.equal((await call('POST','/api/me/password',{currentPassword:password,
  newPassword:'New-MFA-Password-2026!'},recovery.cookie)).status,200);
 assert.equal((await call('POST','/api/login/mfa',{challenge:outstanding.data.challenge,
  code:enabled.data.codes[1]})).status,401);
 const afterPassword=await login('mfa-a','New-MFA-Password-2026!');
 assert.equal(afterPassword.data.mfaRequired,true);
 const afterRecovery=await call('POST','/api/login/mfa',
  {challenge:afterPassword.data.challenge,code:enabled.data.codes[2]});
 assert.equal(afterRecovery.status,200);
 // Disabling needs BOTH the new password and a live one-time second factor.
 assert.equal((await call('POST','/api/me/mfa/disable',{password:'bad',code:enabled.data.codes[3]},
  afterRecovery.cookie)).status,403);
 const disabled=await call('POST','/api/me/mfa/disable',{password:'New-MFA-Password-2026!',
  code:enabled.data.codes[3]},afterRecovery.cookie);
 assert.equal(disabled.status,200);
 assert.equal(disabled.data.disabled,true);
 assert.equal((await call('GET','/api/me',null,afterRecovery.cookie)).status,401);
 const passwordOnly=await login('mfa-a','New-MFA-Password-2026!');
 assert.equal(passwordOnly.status,200);
 assert.ok(passwordOnly.cookie);
 assert.equal(passwordOnly.data.mfaRequired,undefined);
 const otherRestaurant=await login('mfa-b');
 assert.ok(otherRestaurant.cookie);
 assert.equal((await call('GET','/api/me/mfa',null,otherRestaurant.cookie)).data.enabled,false);
 const events=await call('GET','/api/audit',null,passwordOnly.cookie);
 const audit=JSON.stringify(events.data.events);
 assert.match(audit,/mfa-enabled/);
 assert.match(audit,/mfa-disabled/);
 assert.ok(!audit.includes(enabled.data.codes[0]));
 assert.ok(!audit.includes(setup.data.secret));
 secret.fill(0);
});
