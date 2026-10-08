
import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {createUser} from '../src/server/auth.js';
import {createApp} from '../src/server/index.js';

const strong='Initial-Safe-Password-2026!';
test('password rotation, session revocation, staff lifecycle and tenant boundaries',async t=>{
 const db=openDatabase(':memory:');
 const a=bootstrap(db,{slug:'security-a',name:'Security A',email:'owner-a@example.fr',owner:'Alice',password:strong});
 const b=bootstrap(db,{slug:'security-b',name:'Security B',email:'owner-b@example.fr',owner:'Bob',password:strong});
 const staffId=createUser(db,{restaurantId:a.restaurantId,name:'Server A',email:'staff@example.fr',role:'staff',password:strong});
 const server=createApp({db});server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(done=>server.close(done));db.close();});
 const origin='http://127.0.0.1:'+server.address().port;
 async function call(method,path,body,cookie){
   const response=await fetch(origin+path,{
     method,headers:{...(method==='GET'?{}:{'Content-Type':'application/json','X-EasyWine-Request':'1',Origin:origin}),
       ...(cookie?{Cookie:cookie}:{})},
     ...(method==='GET'?{}:{body:JSON.stringify(body||{})})
   });
   return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
 }
 async function login(slug,email,password=strong){
   const res=await call('POST','/api/login',{slug,email,password});
   assert.equal(res.status,200);return res.cookie;
 }
 const owner=await login('security-a','owner-a@example.fr');
 const another=await login('security-b','owner-b@example.fr');
 const staff=await login('security-a','staff@example.fr');
 assert.equal((await call('PATCH','/api/users/'+staffId,{active:false},another)).status,404);
 assert.equal((await call('PATCH','/api/users/'+staffId,{active:false},staff)).status,403);
 assert.equal((await call('PATCH','/api/users/'+staffId,{active:false},owner)).status,200);
 assert.equal((await call('GET','/api/me',null,staff)).status,401);
 assert.equal((await call('POST','/api/login',{slug:'security-a',email:'staff@example.fr',password:strong})).status,401);
 assert.equal((await call('PATCH','/api/users/'+staffId,{active:true},owner)).status,200);
 const restoredStaff=await login('security-a','staff@example.fr');
 assert.equal((await call('POST','/api/me/password',{currentPassword:'incorrect',newPassword:'AnotherVeryStrong2026!'},restoredStaff)).status,403);
 assert.equal((await call('POST','/api/me/password',{currentPassword:strong,newPassword:'AnotherVeryStrong2026!'},restoredStaff)).status,200);
 assert.equal((await call('GET','/api/me',null,restoredStaff)).status,401);
 assert.equal((await call('POST','/api/login',{slug:'security-a',email:'staff@example.fr',password:strong})).status,401);
 const newStaff=await login('security-a','staff@example.fr','AnotherVeryStrong2026!');
 assert.equal((await call('POST','/api/users/'+staffId+'/password',{password:'AdminResetPassword2026!'},owner)).status,200);
 assert.equal((await call('GET','/api/me',null,newStaff)).status,401);
 await login('security-a','staff@example.fr','AdminResetPassword2026!');
 assert.equal((await call('PATCH','/api/users/'+a.userId,{active:false},owner)).status,403);
 assert.equal((await call('POST','/api/users/'+b.userId+'/password',{password:strong},owner)).status,404);
 const log=await call('GET','/api/audit',null,owner);
 const auditText=JSON.stringify(log.data);
 assert.ok(auditText.includes('password-change'));
 assert.ok(auditText.includes('password-reset'));
 assert.ok(!auditText.includes('AdminResetPassword2026!'));
 assert.ok(!auditText.includes('AnotherVeryStrong2026!'));
});
