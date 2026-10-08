
import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {createApp} from '../src/server/index.js';
import {pruneServiceHistory} from '../src/server/service-history.js';
import {restoreToNewPath} from '../src/server/maintenance.js';

const password='Session-Hardening-2026!';
test('migrate an existing v1 SQLite database without losing restaurant records',t=>{
 const folder=mkdtempSync(join(tmpdir(),'easywine-migrate-'));
 t.after(()=>rmSync(folder,{force:true,recursive:true}));
 const file=join(folder,'old.sqlite');
 const v1=new DatabaseSync(file);
 v1.exec(readFileSync(new URL('../src/server/schema.sql',import.meta.url),'utf8'));
 v1.prepare('INSERT INTO restaurants VALUES(?,?,?,?)')
   .run('existing-restaurant','legacy','Restaurant historique',new Date().toISOString());
 v1.close();
 const historical=join(folder,'recovered-v1.sqlite');
 assert.equal(restoreToNewPath(file,historical).version,1);
 const restored=openDatabase(historical);
 assert.equal(restored.prepare('SELECT MAX(version) AS v FROM schema_version').get().v,4);
 assert.equal(restored.prepare('SELECT name FROM restaurants WHERE slug=?').get('legacy').name,'Restaurant historique');
 restored.close();
 const upgraded=openDatabase(file);
 assert.equal(upgraded.prepare('SELECT MAX(version) AS v FROM schema_version').get().v,4);
 assert.equal(upgraded.prepare('SELECT name FROM restaurants WHERE slug=?').get('legacy').name,'Restaurant historique');
 assert.ok(upgraded.prepare("SELECT name FROM sqlite_master WHERE name='service_choices'").get());
 upgraded.close();
 const reopened=openDatabase(file);
 assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM restaurants').get().n,1);
 reopened.close();
});
test('reject unknown schemas without destroying data',t=>{
 const folder=mkdtempSync(join(tmpdir(),'easywine-foreign-'));
 t.after(()=>rmSync(folder,{force:true,recursive:true}));
 const file=join(folder,'foreign.sqlite');
 const foreign=new DatabaseSync(file);
 foreign.exec('CREATE TABLE proprietary_data(secret TEXT); INSERT INTO proprietary_data VALUES (\'unchanged\');');
 foreign.close();
 assert.throws(()=>openDatabase(file),/unknown nonempty database/);
 const verify=new DatabaseSync(file,{readOnly:true});
 assert.equal(verify.prepare('SELECT secret FROM proprietary_data').get().secret,'unchanged');
 assert.equal(verify.prepare('SELECT COUNT(*) AS n FROM sqlite_master WHERE name=?').get('restaurants').n,0);
 verify.close();
});
test('selection tracking is explicit, tenant-safe and idempotent; statistics reflect choices',async t=>{
 const db=openDatabase(':memory:');
 bootstrap(db,{slug:'service-a',name:'Service A',email:'a@example.fr',owner:'Alice',password});
 bootstrap(db,{slug:'service-b',name:'Service B',email:'b@example.fr',owner:'Bob',password});
 const server=createApp({db});server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(r=>server.close(r));db.close();});
 const origin='http://127.0.0.1:'+server.address().port;
 async function req(method,path,body,cookie){
  const response=await fetch(origin+path,{method,headers:{
   ...(method==='GET'?{}:{'Content-Type':'application/json','X-EasyWine-Request':'1',Origin:origin}),
   ...(cookie?{Cookie:cookie}:{})
  },...(method==='GET'?{}:{body:JSON.stringify(body||{})})});
  return {status:response.status,value:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
 }
 const login=async(slug,email)=>(await req('POST','/api/login',{slug,email,password})).cookie;
 const a=await login('service-a','a@example.fr'),b=await login('service-b','b@example.fr');
 const bottle=await req('POST','/api/wines',{producer:'Domaine A',cuvee:'Tradition',color:'rouge',tags:[],
  body:4,acidity:4,tannin:3,aromatic:3,priceCents:6500,stock:2,active:true,byGlass:false},a);
 const dish=await req('POST','/api/dishes',{name:'Canard de test',description:'',intensity:4,richness:4,
  acidity:3,aromatic:3,spice:1,active:true},a);
 const first=await req('POST','/api/recommend',{dishId:dish.value.dish.id},a);
 assert.equal(first.status,200);
 assert.match(first.value.sessionId,/^[0-9a-f-]{36}$/);
 assert.equal(first.value.recommendations.length,1);
 // A computed offer is counted even before any browser view or client choice.
 const beforeChoice=await req('GET','/api/stats',null,a);
 assert.equal(beforeChoice.value.totals.generated,1);
 assert.equal(beforeChoice.value.totals.chosen,0);
 assert.equal(beforeChoice.value.totals.shown,1); // backwards-compatible alias
 assert.equal(beforeChoice.value.wines.find(w=>w.id===bottle.value.wine.id).generated,1);
 assert.match(beforeChoice.value.disclaimer,/calculées côté serveur/);
 assert.equal((await req('POST','/api/service/choice',{sessionId:first.value.sessionId,wineId:bottle.value.wine.id},b)).status,404);
 assert.equal((await req('GET','/api/stats',null,b)).value.totals.shown,0);
 const choose=await req('POST','/api/service/choice',{sessionId:first.value.sessionId,wineId:bottle.value.wine.id},a);
 assert.equal(choose.status,200);
 assert.equal(choose.value.alreadyRecorded,false);
 const repeated=await req('POST','/api/service/choice',{sessionId:first.value.sessionId,wineId:bottle.value.wine.id},a);
 assert.equal(repeated.status,200);
 assert.equal(repeated.value.alreadyRecorded,true);
 const stats=await req('GET','/api/stats',null,a);
 assert.equal(stats.value.totals.shown,1);
 assert.equal(stats.value.totals.generated,1);
 assert.equal(stats.value.totals.chosen,1);
 const second=await req('POST','/api/recommend',{dishId:dish.value.dish.id},a);
 assert.equal(second.status,200);
 assert.equal((await req('PATCH','/api/wines/'+bottle.value.wine.id,{stock:0,expectedVersion:1},a)).status,200);
 assert.equal((await req('POST','/api/service/choice',{sessionId:second.value.sessionId,wineId:bottle.value.wine.id},a)).status,409);
 assert.equal((await req('GET','/api/stats',null,a)).value.totals.chosen,1);
 db.prepare('UPDATE service_sessions SET created_at=? WHERE id=?')
   .run('2020-01-01T00:00:00.000Z',first.value.sessionId);
 assert.equal(pruneServiceHistory(db,new Date('2021-01-01T00:00:00.000Z')),1);
 assert.equal((await req('GET','/api/stats',null,a)).value.totals.chosen,0);
});
