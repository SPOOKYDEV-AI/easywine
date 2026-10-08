
import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {openDatabase} from '../src/server/db.js';
import {createApp} from '../src/server/index.js';

test('public bundles revalidate by content hash while tenant APIs remain no-store',async t=>{
 const db=openDatabase(':memory:');
 const server=createApp({db});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
 const url='http://127.0.0.1:'+server.address().port;
 for(const path of ['/','/app.js','/styles.css']){
  const response=await fetch(url+path);
  assert.equal(response.status,200);
  const etag=response.headers.get('etag');
  assert.match(etag,/^"[A-Za-z0-9_-]+"$/);
  assert.match(response.headers.get('cache-control'),/must-revalidate/);
  const body=await response.text();
  assert.ok(body.length>50);
  const cached=await fetch(url+path,{headers:{'If-None-Match':etag}});
  assert.equal(cached.status,304);
  assert.equal(await cached.text(),'');
  assert.equal(cached.headers.get('etag'),etag);
  const changed=await fetch(url+path,{headers:{'If-None-Match':'"other-version"'}});
  assert.equal(changed.status,200);
  assert.equal(await changed.text(),body);
 }
 const privateData=await fetch(url+'/api/session');
 assert.equal(privateData.status,200);
 assert.equal(privateData.headers.get('cache-control'),'no-store');
 assert.deepEqual(await privateData.json(),{user:null});
 const protectedRoute=await fetch(url+'/api/me');
 assert.equal(protectedRoute.status,401);
 assert.equal(protectedRoute.headers.get('cache-control'),'no-store');
});
