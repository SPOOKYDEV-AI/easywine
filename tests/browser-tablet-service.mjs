import assert from 'node:assert/strict';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {createApp} from '../src/server/index.js';

const db=openDatabase(':memory:');
bootstrap(db,{slug:'tablet-house',name:'Maison Tablette',email:'owner@example.fr',
 owner:'Responsable',password:'Tablet-Strong-2026!'});
const server=createApp({db});server.listen(0,'127.0.0.1');await once(server,'listening');
const origin='http://127.0.0.1:'+server.address().port;
let browser,releaseRecommend;
try{
 const signed=await fetch(origin+'/api/login',{method:'POST',headers:{
  Origin:origin,'Content-Type':'application/json','X-EasyWine-Request':'1'},
  body:JSON.stringify({slug:'tablet-house',email:'owner@example.fr',password:'Tablet-Strong-2026!'})});
 assert.equal(signed.status,200);
 const cookie=signed.headers.get('set-cookie').split(';')[0];
 async function seed(path,payload){
  const res=await fetch(origin+path,{method:'POST',headers:{
   Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-EasyWine-Request':'1'},
   body:JSON.stringify(payload)});
  assert.equal(res.status,201);
 }
 await seed('/api/wines',{producer:'Maison Tactile',cuvee:'Réserve',color:'rouge',tags:['frais'],
  body:4,acidity:4,tannin:3,aromatic:4,priceCents:6500,stock:12,active:true,byGlass:false});
 await seed('/api/dishes',{name:'Plat tablette',description:'Repas au service',
  intensity:4,richness:4,acidity:3,aromatic:3,spice:1,active:true});
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 // Actual touch emulation, not just desktop viewport resizing.
 const context=await browser.newContext({viewport:{width:800,height:1280},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.locator('#login:not([hidden])').waitFor();
 await page.locator('#login-form input[name=slug]').fill('tablet-house');
 await page.locator('#login-form input[name=email]').fill('owner@example.fr');
 await page.locator('#login-form input[name=password]').fill('Tablet-Strong-2026!');
 await page.locator('#login-form button[type=submit]').click();
 await page.locator('.service-grid').waitFor();
 const assertTablet=async({width,height,landscape})=>{
  await page.setViewportSize({width,height});
  const geometry=await page.evaluate(()=>{
   const dock=document.querySelector('#mobile-nav'),left=document.querySelector('.service-grid>.panel:first-child'),
    right=document.querySelector('.service-grid>.panel:last-child');
   return {
    touch:matchMedia('(any-pointer: coarse)').matches,
    dockVisible:getComputedStyle(dock).display!=='none'&&!dock.hidden,
    sidebarVisible:getComputedStyle(document.querySelector('.sidebar')).display!=='none',
    dockButtons:[...dock.querySelectorAll('button:not([hidden])')].map(el=>el.getBoundingClientRect().height),
    chips:[...document.querySelectorAll('.chip')].filter(el=>el.getClientRects().length>0)
     .map(el=>el.getBoundingClientRect().height),
    selects:[...document.querySelectorAll('.service-grid select')].map(el=>el.getBoundingClientRect().height),
    left:left.getBoundingClientRect().toJSON(),right:right.getBoundingClientRect().toJSON(),
    overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),
    logoutVisible:getComputedStyle(document.getElementById('logout-mobile')).display!=='none'
   };
  });
  assert.equal(geometry.touch,true,'A coarse pointer must be emulated');
  assert.equal(geometry.dockVisible,true,`Thumb dock must exist at ${width}`);
  assert.equal(geometry.sidebarVisible,false,`Sidebar must not waste ${width}px tablet space`);
  assert.equal(geometry.logoutVisible,true,'Session exit must remain reachable');
  assert.ok(geometry.dockButtons.every(h=>h>=48),'Dock targets >=48 CSS px');
  assert.ok(geometry.chips.length>=6,'At least six visible primary filters');
  assert.ok(geometry.chips.every(h=>h>=48),'Visible preference chips >=48 CSS px: '+JSON.stringify(geometry.chips));
  assert.ok(geometry.selects.every(h=>h>=50),'Selectors >=50 CSS px: '+JSON.stringify(geometry.selects));
  assert.ok(geometry.overflow<=1,`No horizontal overflow at ${width}`);
  if(landscape)assert.ok(Math.abs(geometry.left.y-geometry.right.y)<3,'Landscape must show both service panels side by side');
  else assert.ok(geometry.right.y>geometry.left.y+50,'Portrait must stack service panels');
 };
 await assertTablet({width:800,height:1280,landscape:false});
 await assertTablet({width:1024,height:768,landscape:true});
 await assertTablet({width:600,height:960,landscape:false});
 await assertTablet({width:800,height:1280,landscape:false});
 await page.locator('.optional-filters summary').tap();
 const advancedHeights=await page.locator('.optional-filters .chip').evaluateAll(nodes=>
  nodes.filter(el=>el.getClientRects().length>0).map(el=>el.getBoundingClientRect().height));
 assert.ok(advancedHeights.length>=3,'Expanded advanced options must be interactive');
 assert.ok(advancedHeights.every(h=>h>=48),'Expanded touch options >=48 CSS px: '+JSON.stringify(advancedHeights));
 await page.locator('.optional-filters summary').tap();
 const firstChip=page.locator('.chip').filter({hasText:'Léger'}).first();
 await firstChip.tap();
 assert.equal(await firstChip.getAttribute('aria-pressed'),'true');
 await firstChip.tap();
 assert.equal(await firstChip.getAttribute('aria-pressed'),'false');
 // Hold a genuine recommendation request. Changing dishes or preferences must
 // abort the pending fetch and unblock a fresh tap, with no "network broken" UI.
 let intercepted;
 const interceptedPromise=new Promise(resolve=>intercepted=resolve);
 const gate=new Promise(resolve=>releaseRecommend=resolve);
 let calls=0;
 await page.route('**/api/recommend',async route=>{
  calls++;
  if(calls===1){intercepted();await gate;}
  await route.continue();
 });
 const submit=page.getByRole('button',{name:/Trouver les meilleurs accords/});
 await submit.tap();
 await interceptedPromise;
 await page.getByText('Recherche des vins réellement disponibles…').waitFor();
 await page.locator('.chip').filter({hasText:'Frais'}).first().tap();
 await page.getByText('Vos critères ont changé.').waitFor();
 await page.waitForFunction(()=>!document.querySelector('.service-submit').disabled);
 assert.equal(await page.locator('#network-status').isVisible(),false,'An intentional cancellation is not an outage');
 // Release the route so Playwright can tear down its intercepted request.
 releaseRecommend();
 await submit.tap();
 await page.locator('.result-card:not(.classic)').waitFor();
 assert.equal(calls,2,'Changing criteria allows a new recommendation immediately');
 assert.equal(await page.locator('.results > div > h2').filter({hasText:'Vos accords'}).count(),1,
  'There must be exactly one current result panel after a canceled request');
 assert.equal(await page.locator('.results').getAttribute('aria-busy'),'false');
 assert.equal(await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth)),0);
 await page.locator('#mobile-nav [data-mobile-view=account]').tap();
 await page.locator('.account-grid').waitFor();
 await page.locator('#mobile-nav [data-mobile-view=service]').tap();
 await page.locator('.service-grid').waitFor();
 // A slow tab response cannot resurrect a previous session after sign-out.
 let statSeen,releaseStat;
 const statHit=new Promise(resolve=>statSeen=resolve);
 const statGate=new Promise(resolve=>releaseStat=resolve);
 await page.route('**/api/stats',async route=>{
  statSeen();
  await statGate;
  await route.continue();
 });
 await page.locator('#mobile-more').tap();
 await page.locator('#mobile-more-panel [data-mobile-view=stats]').tap();
 await statHit;
 await page.locator('#logout-mobile').tap();
 await page.locator('#login:not([hidden])').waitFor();
 assert.equal(await page.locator('#workspace').innerText(),'');
 releaseStat();
 await page.waitForTimeout(200);
 assert.equal(await page.locator('#shell').isVisible(),false);
 assert.equal(await page.locator('#notification').isVisible(),false);
 await page.unroute('**/api/stats');
 assert.deepEqual(errors,[]);
 console.log('BROWSER_TABLET_SERVICE_OK: 600/800/1024px, thumb dock, targets, portrait/landscape, interrupted request, recovered advice');
}finally{
 releaseRecommend?.();
 if(browser)await browser.close();
 await new Promise(done=>server.close(done));db.close();
}
