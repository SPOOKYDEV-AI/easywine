import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {createUser,SESSION_IDLE_MS} from '../src/server/auth.js';
import {createApp} from '../src/server/index.js';

const password='Shared-Tablets-2026-Secure!';
const wine={producer:'Domaine Reprise',cuvee:'Service',color:'rouge',tags:[],
 body:4,acidity:4,tannin:3,aromatic:4,priceCents:6800,stock:4,active:true,byGlass:false};
const dish={name:'Plat reprise',description:'',intensity:4,richness:3,
 acidity:3,aromatic:4,spice:1,active:true};
test('tablette: idle cutoff is server-authoritative; retries never duplicate sessions',async t=>{
 const db=openDatabase(':memory:');
 const a=bootstrap(db,{slug:'tablet-idle-a',name:'Tablette A',email:'a@example.fr',
  owner:'Alice',password});
 const b=bootstrap(db,{slug:'tablet-idle-b',name:'Tablette B',email:'b@example.fr',
  owner:'Bob',password});
 createUser(db,{restaurantId:a.restaurantId,name:'Serveur',email:'staff@example.fr',
  role:'staff',password});
 const server=createApp({db});server.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(async()=>{await new Promise(r=>server.close(r));db.close();});
 const origin='http://127.0.0.1:'+server.address().port;
 async function req(method,path,data,cookie){
  const resp=await fetch(origin+path,{method,headers:{
   ...(method==='GET'?{}:{Origin:origin,'Content-Type':'application/json','X-EasyWine-Request':'1'}),
   ...(cookie?{Cookie:cookie}:{})
  },...(method==='GET'?{}:{body:JSON.stringify(data??{})})});
  return {status:resp.status,data:await resp.json(),cookie:resp.headers.get('set-cookie')?.split(';')[0]};
 }
 async function login(slug,email){
  const x=await req('POST','/api/login',{slug,email,password});
  assert.equal(x.status,200);return x.cookie;
 }
 const cookieA=await login('tablet-idle-a','a@example.fr');
 const cookieB=await login('tablet-idle-b','b@example.fr');
 const staff=await login('tablet-idle-a','staff@example.fr');
 assert.equal((await req('GET','/api/me',null,cookieA)).status,200);
 const w=await req('POST','/api/wines',wine,cookieA);
 const d=await req('POST','/api/dishes',dish,cookieA);
 assert.equal(w.status,201);assert.equal(d.status,201);
 const key=randomUUID(),payload={dishId:d.data.dish.id,styles:['frais'],requestKey:key};
 const first=await req('POST','/api/recommend',payload,cookieA);
 assert.equal(first.status,200);
 assert.equal(first.data.recommendations.length,1);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM service_sessions').get().n,1);
 const same=await req('POST','/api/recommend',payload,cookieA);
 assert.equal(same.status,200);
 assert.deepEqual(same.data,first.data,'Retry after a lost HTTP response returns identical server snapshot');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM service_sessions').get().n,1);
 assert.equal((await req('POST','/api/recommend',{...payload,styles:['leger']},cookieA)).status,409);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM service_sessions').get().n,1);
 // Same employee's key is scoped to the actor AND establishment.
 const parallel=await req('POST','/api/recommend',payload,staff);
 assert.equal(parallel.status,200);
 assert.notEqual(parallel.data.sessionId,first.data.sessionId);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM service_sessions').get().n,2);
 const dishB=await req('POST','/api/dishes',dish,cookieB);
 const wineB=await req('POST','/api/wines',wine,cookieB);
 assert.equal(dishB.status,201);assert.equal(wineB.status,201);
 const otherTenant=await req('POST','/api/recommend',
  {dishId:dishB.data.dish.id,requestKey:key,styles:['frais']},cookieB);
 assert.equal(otherTenant.status,200);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM service_sessions').get().n,3);
 // Cross-device inactivity must expire on the server without a browser timer.
 const sessionBefore=db.prepare('SELECT last_seen_at,expires_at FROM sessions WHERE user_id=?').get(a.userId);
 assert.ok(sessionBefore?.expires_at);
 db.prepare('UPDATE sessions SET last_seen_at=? WHERE user_id=?')
  .run(new Date(Date.now()-SESSION_IDLE_MS-1000).toISOString(),a.userId);
 assert.equal((await req('GET','/api/session',null,cookieA)).data.user,null);
 assert.equal((await req('GET','/api/me',null,cookieA)).status,401);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id=?').get(a.userId).n,0);
 // A timeout must not revoke another staff member's active session.
 assert.equal((await req('GET','/api/me',null,staff)).status,200);
 // A fresh login remains possible.
 const fresh=await login('tablet-idle-a','a@example.fr');
 assert.equal((await req('GET','/api/me',null,fresh)).status,200);
 assert.equal((await req('POST','/api/recommend',payload,cookieA)).status,401);
});
