
import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../src/server/db.js';
import {stockMovement,verifyStockLedger} from '../src/server/stock-ledger.js';
import {createBackup} from '../src/server/maintenance.js';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {bootstrap} from '../src/server/bootstrap.js';
import {createUser} from '../src/server/auth.js';
import {createApp} from '../src/server/index.js';

const password='Test-Stock-Password-2026!';
const initialWine={producer:'Domaine',cuvee:'Réserve',color:'rouge',tags:[],body:4,acidity:4,
 tannin:3,aromatic:3,priceCents:6800,stock:3,active:true,byGlass:false};
test('stock ledger is tenant isolated, transactionally consistent and retry-safe',async t=>{
 const db=openDatabase(':memory:');
 const tenantA=bootstrap(db,{slug:'stock-a',name:'Maison A',email:'a@example.fr',owner:'Alice',password});
 bootstrap(db,{slug:'stock-b',name:'Maison B',email:'b@example.fr',owner:'Bob',password});
 createUser(db,{restaurantId:tenantA.restaurantId,name:'Serveur',email:'staff@example.fr',role:'staff',password});
 const server=createApp({db});server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(done=>server.close(done));db.close();});
 const root='http://127.0.0.1:'+server.address().port;
 async function req(method,path,data,cookie){
  const response=await fetch(root+path,{method,headers:{
   ...(method==='GET'?{}:{Origin:root,'Content-Type':'application/json','X-EasyWine-Request':'1'}),
   ...(cookie?{Cookie:cookie}:{})
  },...(method==='GET'?{}:{body:JSON.stringify(data||{})})});
  return {status:response.status,data:await response.json(),
    cookie:response.headers.get('set-cookie')?.split(';')[0]};
 }
 async function login(slug,email){
  const result=await req('POST','/api/login',{slug,email,password});
  assert.equal(result.status,200);return result.cookie;
 }
 const alice=await login('stock-a','a@example.fr');
 const bob=await login('stock-b','b@example.fr');
 const staff=await login('stock-a','staff@example.fr');
 const created=await req('POST','/api/wines',initialWine,alice);
 assert.equal(created.status,201);
 const wineId=created.data.wine.id,path='/api/wines/'+wineId+'/stock-movements';
 assert.equal((await req('GET',path,null,bob)).status,404);
 assert.equal((await req('POST',path,{delta:1,reason:'restock',note:'Livraison',expectedVersion:1,
   requestKey:randomUUID()},staff)).status,403);
 const opening=await req('GET',path,null,alice);
 assert.equal(opening.data.movements.length,1);
 assert.equal(opening.data.movements[0].reason,'opening');
 assert.equal(opening.data.movements[0].afterStock,3);
 const key=randomUUID();
 const adjustment={delta:-2,reason:'consumption',note:'Service table 4',expectedVersion:1,requestKey:key};
 const first=await req('POST',path,adjustment,alice);
 assert.equal(first.status,200);
 assert.equal(first.data.wine.stock,1);
 assert.equal(first.data.wine.version,2);
 assert.equal(first.data.alreadyApplied,false);
 const repeated=await req('POST',path,adjustment,alice);
 assert.equal(repeated.status,200);
 assert.equal(repeated.data.alreadyApplied,true);
 assert.equal(repeated.data.movementId,first.data.movementId);
 assert.equal((await req('POST',path,{...adjustment,delta:-1},alice)).status,409);
 assert.equal((await req('POST',path,{...adjustment,requestKey:randomUUID()},alice)).status,409);
 assert.equal((await req('POST',path,{...adjustment,expectedVersion:2,requestKey:randomUUID()},bob)).status,404);
 assert.equal((await req('POST',path,{...adjustment,delta:-2,expectedVersion:2,requestKey:randomUUID()},alice)).status,409);
 const patch=await req('PATCH','/api/wines/'+wineId,{stock:5,expectedVersion:2},alice);
 assert.equal(patch.status,200);
 assert.equal(patch.data.wine.stock,5);
 const latest=await req('GET',path,null,alice);
 assert.equal(latest.data.movements.length,3);
 assert.deepEqual(latest.data.movements.map(x=>x.reason),['manual','consumption','opening']);
 assert.deepEqual(latest.data.movements.map(x=>x.afterStock),[5,1,3]);
 assert.deepEqual(latest.data.movements.map(x=>x.delta),[4,-2,3]);
 assert.equal(db.prepare('SELECT stock FROM wines WHERE id=?').get(wineId).stock,5);
 const another=await req('POST',path,{delta:3,reason:'restock',note:'Livraison',expectedVersion:3,requestKey:randomUUID()},alice);
 assert.equal(another.status,200);
 assert.equal(another.data.wine.stock,8);
 assert.equal((await req('GET',path,null,staff)).status,403);
 assert.equal((await req('POST',path,{delta:0,reason:'restock',note:'Livraison',expectedVersion:4,requestKey:randomUUID()},alice)).status,400);
 const logs=await req('GET','/api/audit',null,alice);
 assert.ok(logs.data.events.some(x=>x.action==='stock-adjust'));
 assert.equal((await req('GET','/api/wines',null,bob)).data.wines.length,0);
});

test('backups fail closed when an external writer bypasses the stock journal',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'ew-ledger-integrity-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const db=openDatabase(':memory:');
 try{
  const owner=bootstrap(db,{slug:'ledger-check',name:'Maison',email:'owner@example.fr',owner:'Owner',password});
  const actor={id:owner.userId,restaurant_id:owner.restaurantId};
  const wineId=randomUUID();
  db.prepare(
   'INSERT INTO wines(id,restaurant_id,producer,cuvee,color,body,acidity,tannin,aromatic,price_cents,stock,updated_at)'+
   ' VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run(wineId,owner.restaurantId,'Domaine','Cuvée','rouge',3,3,3,3,7000,2,new Date().toISOString());
  stockMovement(db,actor,wineId,0,2,'opening','Ouverture');
  assert.equal(verifyStockLedger(db),true);
  db.prepare('UPDATE wines SET stock=3 WHERE id=?').run(wineId);
  assert.throws(()=>verifyStockLedger(db),/Stock actuel incompatible/);
  await assert.rejects(()=>createBackup(db,dir),/Stock actuel incompatible/);
  assert.deepEqual(readdirSync(dir),[]);
  db.prepare('UPDATE wines SET stock=2 WHERE id=?').run(wineId);
  db.prepare('UPDATE wines SET stock=5 WHERE id=?').run(wineId);
  stockMovement(db,actor,wineId,2,5,'restock','Livraison');
  assert.equal(verifyStockLedger(db),true);
  db.prepare("UPDATE stock_movements SET before_stock=1 WHERE reason='restock'").run();
  assert.throws(()=>verifyStockLedger(db),/Chaîne de stock incohérente/);
 }finally{db.close();}
});
