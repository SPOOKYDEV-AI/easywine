
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {createApp} from '../src/server/index.js';

const secret='Race-safe-UX-2026!';
const db=openDatabase(':memory:');
for(const [slug,name,email] of [['tenant-a','Maison A','a@example.fr'],['tenant-b','Maison B','b@example.fr']]){
 bootstrap(db,{slug,name,email,owner:name,password:secret});
}
const server=createApp({db});server.listen(0,'127.0.0.1');
await once(server,'listening');
const root='http://127.0.0.1:'+server.address().port;
async function makeFixtures(slug,email,producer){
 const login=await fetch(root+'/api/login',{method:'POST',headers:{Origin:root,
  'Content-Type':'application/json','X-EasyWine-Request':'1'},
  body:JSON.stringify({slug,email,password:secret})});
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const body={producer,cuvee:'Cuvée '+slug,color:'rouge',tags:[],body:4,acidity:4,tannin:3,
   aromatic:3,priceCents:7500,stock:4,active:true,byGlass:false};
 const result=await fetch(root+'/api/wines',{method:'POST',headers:{
  Origin:root,Cookie:cookie,'Content-Type':'application/json','X-EasyWine-Request':'1'},
  body:JSON.stringify(body)});
 assert.equal(result.status,201);
}
await makeFixtures('tenant-a','a@example.fr','Domaine A secret');
await makeFixtures('tenant-b','b@example.fr','Domaine B visible');
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1180,height:840}});
 const errors=[];
 page.on('pageerror',x=>errors.push(x.message));
 async function login(slug,email){
  await page.locator('#login-form input[name=slug]').fill(slug);
  await page.locator('#login-form input[name=email]').fill(email);
  await page.locator('#login-form input[name=password]').fill(secret);
  await page.locator('#login-form button[type=submit]').click();
  await page.locator('#shell:not([hidden])').waitFor();
 }
 await page.goto(root,{waitUntil:'networkidle'});
 await login('tenant-a','a@example.fr');
 await page.locator('#menu [data-view=wines]').click();
 await page.getByText('Domaine A secret').waitFor();
 assert.equal(new URL(page.url()).hash,'#/wines');
 await page.locator('#menu [data-view=stats]').click();
 await page.getByText('Statistiques du service').waitFor();
 await page.evaluate(()=>history.back());
 await page.getByText('Domaine A secret').waitFor();
 assert.equal(new URL(page.url()).hash,'#/wines');
 await page.evaluate(()=>history.forward());
 await page.getByText('Statistiques du service').waitFor();
 assert.equal(new URL(page.url()).hash,'#/stats');
 assert.equal(await page.evaluate(()=>performance.getEntriesByType('navigation').length),1);

 // The browser may still have network access while the restaurant API fails.
 await page.locator('#menu [data-view=service]').click();
 await page.route('**/api/stats',route=>route.abort('failed'));
 await page.locator('#menu [data-view=stats]').click();
 await page.getByText('Impossible de charger cette rubrique').waitFor();
 await page.locator('#network-status:not([hidden])').waitFor();
 assert.match(await page.locator('#network-status-text').innerText(),/ne répond pas/i);
 await page.unroute('**/api/stats');
 await page.locator('#network-retry').click();
 await page.locator('#network-status').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Réessayer'}).click();
 await page.getByText('Statistiques du service').waitFor();

 // Browser offline events are advisory; no mutation should be retried.
 await page.context().setOffline(true);
 await page.locator('#network-status:not([hidden])').waitFor();
 assert.match(await page.locator('#network-status-text').innerText(),/Réseau indisponible/i);
 await page.context().setOffline(false);
 await page.locator('#network-retry').click();
 await page.locator('#network-status').waitFor({state:'hidden'});

 // An old tenant's delayed data must never repopulate a new tenant's view.
 await page.locator('#menu [data-view=account]').click();
 await page.locator('.account-grid').waitFor();
 await page.evaluate(()=>{
  const original=Date.now.bind(Date);
  Date.now=()=>original()+65_000;
 });
 let held=0,release;
 const gate=new Promise(resolve=>{release=resolve;});
 await page.route('**/api/wines',async route=>{
  held++;
  if(held===1){await gate;await route.fulfill({json:{wines:[{id:'stale',producer:'Domaine A secret',
   cuvee:'Should never appear',stock:99,active:true}]}});}
  else await route.continue();
 });
 await page.locator('#menu [data-view=wines]').click();
 await page.getByText('Ouverture de la cave…').waitFor();
 await page.locator('#logout').click();
 await page.locator('#login:not([hidden])').waitFor();
 assert.equal(await page.locator('#workspace').innerText(),'','Logout must scrub the old tenant DOM');
 assert.equal(await page.locator('#workspace').getAttribute('inert'),null);
 await login('tenant-b','b@example.fr');
 await page.locator('#menu [data-view=wines]').click();
 await page.getByText('Domaine B visible').waitFor();
 release();
 await page.waitForTimeout(250);
 assert.equal(await page.getByText('Domaine A secret').count(),0);
 assert.equal(await page.locator('#shell:not([hidden])').count(),1);
 assert.equal(await page.locator('#network-status:not([hidden])').count(),0);
 await page.unroute('**/api/wines');
 assert.deepEqual(errors,[]);
 console.log('BROWSER_NETWORK_HISTORY_OK: Back/Forward, network recovery, offline, stale-tenant isolation');
}finally{
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));db.close();
}
