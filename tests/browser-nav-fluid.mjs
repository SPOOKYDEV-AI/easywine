import assert from 'node:assert/strict';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {createApp} from '../src/server/index.js';

const db=openDatabase(':memory:');
bootstrap(db,{slug:'fluid-house',name:'Maison Fluide',email:'owner@example.fr',
 owner:'Responsable',password:'Fluid-Premium-Test-2026!'});
const server=createApp({db});
server.listen(0,'127.0.0.1');
await once(server,'listening');
const origin='http://127.0.0.1:'+server.address().port;
let browser,releaseStats;
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1240,height:860}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.locator('#login:not([hidden])').waitFor();
 await page.locator('#login-form input[name=slug]').fill('fluid-house');
 await page.locator('#login-form input[name=email]').fill('owner@example.fr');
 await page.locator('#login-form input[name=password]').fill('Fluid-Premium-Test-2026!');
 await page.locator('#login-form button[type=submit]').click();
 await page.getByText('Préparons votre premier service').waitFor();

 // Monitor actual loading node insertion, not an estimated time or screenshot.
 // Real pointer intent can fetch the administration module before the click.
 await page.locator('#menu [data-view=wines]').hover();
 await page.waitForFunction(()=>performance.getEntriesByType('resource')
  .some(entry=>new URL(entry.name).pathname==='/admin.js'));
 await page.evaluate(()=>{
  window.__fluidLoaderInsertions=0;
  const root=document.getElementById('workspace');
  window.__fluidObserver=new MutationObserver(()=>{
   if(root.querySelector('.view-loading'))window.__fluidLoaderInsertions++;
  });
  window.__fluidObserver.observe(root,{childList:true});
 });
 await page.locator('#menu [data-view=wines]').click();
 await page.getByRole('button',{name:/Ajouter un vin/}).waitFor();
 await page.locator('#menu [data-view=service]').click();
 await page.getByText('Préparons votre premier service').waitFor();
 await page.evaluate(()=>{window.__fluidLoaderInsertions=0;});
 // Both these modules and datasets are hot: neither route should flash a loader.
 await page.locator('#menu [data-view=wines]').click();
 await page.getByRole('button',{name:/Ajouter un vin/}).waitFor();
 await page.locator('#menu [data-view=service]').click();
 await page.getByText('Préparons votre premier service').waitFor();
 assert.equal(await page.evaluate(()=>window.__fluidLoaderInsertions),0,
  'Hot navigation must never insert a transient glass loader');
 assert.equal(await page.locator('#workspace').getAttribute('aria-busy'),'false');
 assert.equal(await page.locator('#workspace').getAttribute('inert'),null);

 // Slow real data must produce a live, accessible loader after the grace period.
 let intercepted;
 const gotStats=new Promise(resolve=>{intercepted=resolve;});
 const statsGate=new Promise(resolve=>{releaseStats=resolve;});
 let statsRequests=0;
 await page.route('**/api/stats',async route=>{
  statsRequests++;
  intercepted();
  await statsGate;
  await route.continue();
 });
 await page.locator('#menu [data-view=stats]').click();
 await gotStats;
 await page.locator('#workspace[aria-busy=true] .wine-glass--inline').waitFor();
 assert.equal(await page.locator('#workspace').getAttribute('inert'),'');
 assert.equal(await page.locator('#workspace .view-loading').getAttribute('role'),'status');
 assert.equal(await page.locator('#workspace').getAttribute('aria-busy'),'true');
 releaseStats();
 await page.getByText('Statistiques du service').waitFor();
 await page.unroute('**/api/stats');
 assert.equal(await page.locator('#workspace .view-loading').count(),0);
 assert.equal(await page.locator('#workspace').getAttribute('aria-busy'),'false');
 assert.equal(await page.locator('#workspace').getAttribute('inert'),null);
 // Clicking the already selected tab again must be a strict no-op.
 await page.evaluate(()=>{window.__fluidCurrentNode=document.querySelector('#workspace').firstElementChild;});
 await page.locator('#menu [data-view=stats]').click();
 assert.equal(await page.evaluate(()=>
  document.querySelector('#workspace').firstElementChild===window.__fluidCurrentNode),true);
 assert.equal(statsRequests,1);

 // Pending navigation cannot restore stale content after a fast second route.
 let signalDelay,releaseDelay;
 const delayHit=new Promise(resolve=>signalDelay=resolve);
 const delayGate=new Promise(resolve=>releaseDelay=resolve);
 await page.route('**/api/audit',async route=>{
  signalDelay();
  await delayGate;
  await route.continue();
 });
 await page.locator('#menu [data-view=history]').click();
 await delayHit;
 await page.locator('#menu [data-view=wines]').click();
 await page.getByRole('button',{name:/Ajouter un vin/}).waitFor();
 releaseDelay();
 await page.waitForTimeout(250);
 assert.equal(await page.locator('#workspace > .page-header h1').filter({hasText:'Historique'}).count(),0);
 assert.equal(await page.locator('#menu [data-view=wines]').getAttribute('aria-current'),'page');
 assert.equal(await page.locator('#workspace').getAttribute('aria-busy'),'false');
 await page.unroute('**/api/audit');

 // Scope the entrance animation to broad containers, and respect reduced motion.
 const initialMotion=await page.locator('#workspace > .page-header').evaluate(el=>
  getComputedStyle(el).animationName);
 assert.match(initialMotion,/ew-route-arrive/);
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('#workspace > .page-header').evaluate(el=>
  getComputedStyle(el).animationName),'none');
 assert.deepEqual(errors,[]);
 console.log('BROWSER_NAV_FLUID_OK: hot-route zero flicker, slow HTTP loader, active-tab no-op, stale race, reduced motion');
}finally{
 releaseStats?.();
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
 db.close();
}
