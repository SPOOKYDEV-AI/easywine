
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWineCsv} from '../src/server/import-csv.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {openDatabase} from '../src/server/db.js';
import {createApp} from '../src/server/index.js';
import {once} from 'node:events';

const header='producer;cuvee;color;body;acidity;tannin;aromatic;price_eur;stock;vintage';
const valid='"Domaine; du Rhône";Cuvée 1;rouge;4;4;3;3;85,50;5;2023';
test('French CSV respects escaped separators and exact euro cents',()=>{
 const result=parseWineCsv(header+'\r\n'+valid);
 assert.equal(result.errors.length,0);
 assert.equal(result.rows[0].wine.producer,'Domaine; du Rhône');
 assert.equal(result.rows[0].wine.priceCents,8550);
});
test('CSV validates all entries and does not silently invent missing profiles',()=>{
 const incomplete='Producteur;Cuvée 2;rouge;;4;3;3;55;2;2024';
 const result=parseWineCsv(header+'\n'+valid+'\n'+incomplete);
 assert.equal(result.rows.length,1);
 assert.equal(result.errors.length,1);
 assert.equal(result.errors[0].line,3);
});
test('preview, atomic commit, duplicates and tenant isolation',async t=>{
 const db=openDatabase(':memory:');
 bootstrap(db,{slug:'import-a',name:'Import A',email:'a@example.com',owner:'Alice',password:'secure-password-example-2026'});
 bootstrap(db,{slug:'import-b',name:'Import B',email:'b@example.com',owner:'Bob',password:'secure-password-example-2026'});
 const server=createApp({db});server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(r=>server.close(r));db.close();});
 const origin='http://127.0.0.1:'+server.address().port;
 async function req(path,payload,cookie){
  const response=await fetch(origin+path,{method:'POST',headers:{
   Origin:origin,'Content-Type':'application/json','X-EasyWine-Request':'1',
   ...(cookie?{Cookie:cookie}:{})
  },body:JSON.stringify(payload)});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
 }
 const alice=(await req('/api/login',{slug:'import-a',email:'a@example.com',password:'secure-password-example-2026'})).cookie;
 const bob=(await req('/api/login',{slug:'import-b',email:'b@example.com',password:'secure-password-example-2026'})).cookie;
 const invalid=await req('/api/import/wines/preview',{csv:header+'\n'+valid+'\nMissing;Bad;rouge;x;3;3;3;25;1;2020'},alice);
 assert.equal(invalid.status,200);
 assert.equal(invalid.data.canImport,false);
 assert.equal((await req('/api/import/wines/commit',{csv:header+'\n'+valid+'\nMissing;Bad;rouge;x;3;3;3;25;1;2020'},alice)).status,422);
 assert.equal(db.prepare('SELECT count(*) AS n FROM wines').get().n,0);
 const committed=await req('/api/import/wines/commit',{csv:header+'\n'+valid},alice);
 assert.equal(committed.status,201);
 assert.equal(committed.data.imported,1);
 assert.equal((await req('/api/import/wines/commit',{csv:header+'\n'+valid},alice)).status,422);
 const other=await req('/api/import/wines/commit',{csv:header+'\n'+valid},bob);
 assert.equal(other.status,201);
 assert.equal(db.prepare('SELECT count(*) AS n FROM wines').get().n,2);
});
