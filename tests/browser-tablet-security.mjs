import assert from 'node:assert/strict';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {createApp} from '../src/server/index.js';

const db=openDatabase(':memory:');
bootstrap(db,{slug:'privacy-tablet',name:'Maison Privée',email:'owner@example.fr',
 owner:'Responsable',password:'Privacy-Tablet-2026!'});
const server=createApp({db});
server.listen(0,'127.0.0.1');await once(server,'listening');
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:800,height:1280},hasTouch:true,isMobile:true});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 const login=async()=>{
  await page.locator('#login-form input[name=slug]').fill('privacy-tablet');
  await page.locator('#login-form input[name=email]').fill('owner@example.fr');
  await page.locator('#login-form input[name=password]').fill('Privacy-Tablet-2026!');
  await page.locator('#login-form button[type=submit]').tap();
  await page.locator('#shell:not([hidden])').waitFor();
 };
 await login();
 // Two minutes before local lock, give an accessible human action.
 await page.evaluate(()=>{
  const now=Date.now.bind(Date);
  Date.now=()=>now()+8*60*1000+500;
  window.dispatchEvent(new Event('focus'));
  Date.now=now;
 });
 await page.locator('#session-idle-warning:not([hidden])').waitFor();
 assert.equal(await page.locator('#session-idle-warning').getAttribute('role'),'status');
 await page.locator('#session-idle-continue').tap();
 await page.locator('#session-idle-warning').waitFor({state:'hidden'});

 // Simulate a suspended tablet waking after more than ten idle minutes.
 await page.evaluate(()=>{
  const now=Date.now.bind(Date);
  Date.now=()=>now()+11*60*1000;
  window.dispatchEvent(new Event('focus'));
  Date.now=now;
 });
 await page.locator('#login:not([hidden])').waitFor();
 assert.equal(await page.locator('#workspace').innerText(),'');
 assert.equal(await page.evaluate(()=>localStorage.getItem('easywine:shared-device-locked')),'1');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#login:not([hidden])').waitFor();
 assert.equal(await page.locator('#shell').isVisible(),false,
  'Shared tablet must not silently unlock using a still-live HttpOnly cookie');
 await login();
 assert.equal(await page.evaluate(()=>localStorage.getItem('easywine:shared-device-locked')),null);
 await page.locator('#logout-mobile').tap();
 await page.locator('#login:not([hidden])').waitFor();
 assert.equal(await page.locator('#workspace').innerText(),'');
 assert.equal(await page.evaluate(()=>localStorage.getItem('easywine:shared-device-locked')),'1');
 assert.deepEqual(errors,[]);
 console.log('BROWSER_TABLET_PRIVACY_OK: warning, idle lock, no cookie-based auto resume, explicit login and logout');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));db.close();
}
