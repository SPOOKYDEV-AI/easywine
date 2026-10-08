
import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {createApp} from '../src/server/index.js';

test('restaurant exclusions are versioned, tenant scoped, and respect the classic pairing',async t=>{
 const db=openDatabase(':memory:');
 bootstrap(db,{slug:'blocks-a',name:'Blocks A',email:'a@example.com',owner:'Owner A',password:'Secret-Passphrase-2026!'});
 bootstrap(db,{slug:'blocks-b',name:'Blocks B',email:'b@example.com',owner:'Owner B',password:'Secret-Passphrase-2026!'});
 const server=createApp({db});server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(r=>server.close(r));db.close();});
 const origin='http://127.0.0.1:'+server.address().port;
 async function req(method,path,body,cookie){
  const response=await fetch(origin+path,{method,headers:{
   ...(method==='GET'?{}:{'Content-Type':'application/json','X-EasyWine-Request':'1',Origin:origin}),
   ...(cookie?{Cookie:cookie}:{})
  },...(method==='GET'?{}:{body:JSON.stringify(body||{})})});
  return {status:response.status,result:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
 }
 const login=async slug=>(await req('POST','/api/login',{slug,email:slug==='blocks-a'?'a@example.com':'b@example.com',password:'Secret-Passphrase-2026!'})).cookie;
 const a=await login('blocks-a'),b=await login('blocks-b');
 const w=await req('POST','/api/wines',{producer:'Domaine',cuvee:'Signature',color:'rouge',tags:[],
  body:4,acidity:4,tannin:3,aromatic:3,priceCents:8000,stock:3,active:true,byGlass:false},a);
 assert.equal(w.status,201);
 const d=await req('POST','/api/dishes',{name:'Canard',description:'',intensity:4,richness:4,
  acidity:3,aromatic:3,spice:1,active:true},a);
 assert.equal(d.status,201);
 const did=d.result.dish.id,wid=w.result.wine.id;
 assert.equal((await req('PUT','/api/dishes/'+did+'/classic',{wineId:wid,expectedVersion:1},a)).status,200);
 assert.equal((await req('GET','/api/dishes/'+did+'/blocks',null,b)).status,404);
 assert.equal((await req('PUT','/api/dishes/'+did+'/blocks',{wineIds:[wid],expectedVersion:2},b)).status,404);
 assert.equal((await req('PUT','/api/dishes/'+did+'/blocks',{wineIds:[wid],expectedVersion:1},a)).status,409);
 assert.equal((await req('PUT','/api/dishes/'+did+'/blocks',{wineIds:[wid],expectedVersion:2},a)).status,200);
 const blocked=await req('GET','/api/dishes/'+did+'/blocks',null,a);
 assert.deepEqual(blocked.result.wineIds,[wid]);
 assert.equal(blocked.result.version,3);
 const result=await req('POST','/api/recommend',{dishId:did},a);
 assert.equal(result.status,200);
 assert.equal(result.result.classic.blocked,true);
 assert.equal(result.result.classic.available,false);
 assert.equal(result.result.recommendations.length,0);
 assert.equal((await req('PUT','/api/dishes/'+did+'/blocks',{wineIds:[],expectedVersion:2},a)).status,409);
 assert.equal((await req('PUT','/api/dishes/'+did+'/blocks',{wineIds:[],expectedVersion:3},a)).status,200);
 const restored=await req('POST','/api/recommend',{dishId:did},a);
 assert.equal(restored.result.classic.available,true);
 assert.equal(restored.result.classic.blocked,false);
 assert.equal(restored.result.recommendations.length,0); // Never duplicate the displayed classic
});
