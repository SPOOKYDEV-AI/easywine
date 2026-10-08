
import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {createUser} from '../src/server/auth.js';
import {createApp} from '../src/server/index.js';

const password='CorrectHorseBattery2026!';
const wine={producer:'Domaine A',cuvee:'Sélection',appellation:'Rhône',vintage:'2023',
 region:'Rhône',grapes:'Syrah',color:'rouge',tags:['frais'],body:4,acidity:4,
 tannin:3,aromatic:3,priceCents:8200,stock:4,byGlass:false,active:true};
const dish={name:'Canard rôti',description:'Jus corsé',intensity:4,richness:4,acidity:3,aromatic:3,spice:1,active:true};

test('API authorization, tenancy, classic history, stock and optimistic updates',async t=>{
 const db=openDatabase(':memory:');
 const a=bootstrap(db,{slug:'maison-a',name:'Maison A',email:'a@example.fr',owner:'Alice',password});
 const b=bootstrap(db,{slug:'maison-b',name:'Maison B',email:'b@example.fr',owner:'Bob',password});
 createUser(db,{restaurantId:a.restaurantId,name:'Service A',email:'staff@example.fr',role:'staff',password});
 const server=createApp({db});
 server.listen(0,'127.0.0.1');
 await once(server,'listening');
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
 const origin='http://127.0.0.1:'+server.address().port;
 const call=async(method,path,data,cookie)=>{
  const response=await fetch(origin+path,{method,headers:{
   ...(method==='GET'?{}:{'Content-Type':'application/json','X-EasyWine-Request':'1','Origin':origin}),
   ...(cookie?{'Cookie':cookie}:{})
  },...(method==='GET'?{}:{body:JSON.stringify(data||{})})});
  return {status:response.status,value:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
 };
 const login=async(slug,email)=>{
  const r=await call('POST','/api/login',{slug,email,password});
  assert.equal(r.status,200);
  assert.match(r.cookie,/^ew_session=/);
  return r.cookie;
 };
 const anonymous=await call('GET','/api/session');
 assert.equal(anonymous.status,200);
 assert.equal(anonymous.value.user,null);
 const alice=await login('maison-a','a@example.fr'),bob=await login('maison-b','b@example.fr');
 const active=await call('GET','/api/session',null,alice);
 assert.equal(active.status,200);
 assert.equal(active.value.user.name,'Alice');
 assert.equal(active.value.user.restaurantName,'Maison A');
 assert.equal(active.value.user.password_hash,undefined);
 assert.equal(active.value.user.salt,undefined);
 const staff=await login('maison-a','staff@example.fr');
 assert.equal((await call('GET','/api/wines')).status,401);
 assert.equal((await call('POST','/api/wines',wine,staff)).status,403);
 assert.equal((await call('POST','/api/wines',wine)).status,401);
 const c=await call('POST','/api/wines',wine,alice);
 assert.equal(c.status,201);
 const first=c.value.wine;
 const alt=await call('POST','/api/wines',{...wine,producer:'Domaine B',priceCents:5300},alice);
 assert.equal(alt.status,201);
 const d=await call('POST','/api/dishes',dish,alice);
 assert.equal(d.status,201);
 const house=await call('PUT','/api/dishes/'+d.value.dish.id+'/classic',
  {wineId:first.id,expectedVersion:1},alice);
 assert.equal(house.status,200);
 assert.equal(house.value.dish.classicWineId,first.id);
 assert.equal((await call('PUT','/api/dishes/'+d.value.dish.id+'/classic',
  {wineId:alt.value.wine.id,expectedVersion:1},alice)).status,409);
 assert.equal((await call('GET','/api/wines',null,bob)).value.wines.length,0);
 assert.equal((await call('GET','/api/dishes',null,bob)).value.dishes.length,0);
 assert.equal((await call('PUT','/api/dishes/'+d.value.dish.id+'/classic',
  {wineId:alt.value.wine.id,expectedVersion:2},bob)).status,404);
 assert.equal((await call('POST','/api/recommend',{dishId:d.value.dish.id},bob)).status,404);
 const updated=await call('PATCH','/api/wines/'+first.id,{stock:0,expectedVersion:1},alice);
 assert.equal(updated.status,200);
 assert.equal(updated.value.wine.stock,0);
 const result=await call('POST','/api/recommend',{dishId:d.value.dish.id,styles:['frais']},staff);
 assert.equal(result.status,200);
 assert.equal(result.value.classic.available,false);
 assert.ok(result.value.recommendations.every(x=>x.wine.id!==first.id));
 assert.ok(result.value.recommendations.some(x=>x.wine.id===alt.value.wine.id));
 const log=await call('GET','/api/audit',null,alice);
 assert.ok(log.value.events.some(e=>e.action==='set-classic'));
 assert.equal((await call('GET','/api/audit',null,staff)).status,403);
 const bad=await fetch(origin+'/api/wines',{method:'POST',
  headers:{'Content-Type':'application/json','Cookie':alice},body:JSON.stringify(wine)});
 assert.equal(bad.status,403);
 const logout=await call('POST','/api/logout',{},alice);
 assert.equal(logout.status,200);
 assert.equal((await call('GET','/api/me',null,alice)).status,401);
 assert.equal((await call('GET','/api/session',null,alice)).value.user,null);
});
