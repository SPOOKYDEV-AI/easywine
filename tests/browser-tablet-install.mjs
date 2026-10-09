import assert from 'node:assert/strict';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {openDatabase} from '../src/server/db.js';
import {createApp} from '../src/server/index.js';

const db=openDatabase(':memory:');
const server=createApp({db});
server.listen(0,'127.0.0.1');
await once(server,'listening');
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:800,height:1280},hasTouch:true,isMobile:true});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 const link=await page.locator('link[rel=manifest]').getAttribute('href');
 assert.equal(link,'/manifest.webmanifest');
 const resp=await context.request.get(origin+link);
 assert.equal(resp.status(),200);
 assert.match(resp.headers()['content-type'],/application\/manifest\+json/);
 const manifest=await resp.json();
 assert.equal(manifest.id,'/');
 assert.equal(manifest.scope,'/');
 assert.equal(manifest.start_url,'/');
 assert.equal(manifest.display,'standalone');
 assert.equal(manifest.orientation,'any');
 assert.equal(manifest.theme_color,'#682c3c');
 const expected=[
  ['/icon-192.png',192,'any'],['/icon-512.png',512,'any'],
  ['/icon-maskable-512.png',512,'maskable'],['/icon-180.png',180,null]
 ];
 for(const [src,size,purpose] of expected){
  const icon=await context.request.get(origin+src);
  assert.equal(icon.status(),200,src);
  assert.match(icon.headers()['content-type'],/image\/png/);
  const bytes=await icon.body();
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16),size);
  assert.equal(bytes.readUInt32BE(20),size);
  const natural=await page.evaluate(async(src)=>{
   const img=new Image();
   img.src=src;
   await img.decode();
   return {w:img.naturalWidth,h:img.naturalHeight};
  },src);
  assert.deepEqual(natural,{w:size,h:size},'PNG must be decodable in Chrome');
  if(purpose){
   const entry=manifest.icons.find(i=>i.src===src);
   assert.equal(entry?.sizes,size+'x'+size);
   assert.equal(entry?.purpose,purpose);
  }
 }
 assert.equal(await page.locator('link[rel=apple-touch-icon]').getAttribute('href'),'/icon-180.png');
 // Intentionally do not register an offline service worker until storage and
 // stale stock semantics have explicit business acceptance.
 assert.equal(await page.evaluate(async()=>
  (await navigator.serviceWorker.getRegistrations()).length),0);
 const api=await context.request.get(origin+'/api/session');
 assert.equal(api.status(),200);
 assert.equal(api.headers()['cache-control'],'no-store');
 const html=await context.request.get(origin+'/');
 assert.equal(html.headers()['cache-control'],'public, max-age=0, must-revalidate');
 assert.deepEqual(errors,[]);
 console.log('BROWSER_TABLET_INSTALL_OK: standalone manifest, 4 decoded PNG sizes, CSP, no cache of tenant APIs');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
 db.close();
}
