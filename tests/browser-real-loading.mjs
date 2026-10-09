import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {createApp} from '../src/server/index.js';

const db=openDatabase(':memory:');
bootstrap(db,{slug:'loading-house',name:'Maison du Temps',email:'owner@example.fr',
 owner:'Responsable',password:'Loading-Strong-2026!'});
const server=createApp({db});
server.listen(0,'127.0.0.1');
await once(server,'listening');
const origin='http://127.0.0.1:'+server.address().port;
let browser,releaseDish,releaseStats,releasePatch;
try{
 const signedIn=await fetch(origin+'/api/login',{method:'POST',headers:{
  Origin:origin,'Content-Type':'application/json','X-EasyWine-Request':'1'},
  body:JSON.stringify({slug:'loading-house',email:'owner@example.fr',password:'Loading-Strong-2026!'})});
 assert.equal(signedIn.status,200);
 const cookie=signedIn.headers.get('set-cookie').split(';')[0];
 async function seed(path,payload){
  const response=await fetch(origin+path,{method:'POST',headers:{
   Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-EasyWine-Request':'1'},
   body:JSON.stringify(payload)});
  assert.equal(response.status,201);
 }
 await seed('/api/wines',{producer:'Domaine du Temps',cuvee:'Signature',color:'rouge',
  tags:['frais'],body:4,acidity:4,tannin:3,aromatic:4,priceCents:6500,
  stock:8,active:true,byGlass:false});
 await seed('/api/dishes',{name:'Plat du service',description:'Accord test',
  intensity:4,richness:4,acidity:3,aromatic:3,spice:1,active:true});

 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.locator('#login:not([hidden])').waitFor();

 // Keep the dishes request pending. The catalogue and the shell must not be
 // treated as ready simply because the wine request has completed.
 let signalDish;
 const dishReceived=new Promise(resolve=>signalDish=resolve);
 const dishGate=new Promise(resolve=>releaseDish=resolve);
 await page.route('**/api/dishes',async route=>{
  signalDish();
  await dishGate;
  await route.continue();
 });
 await page.locator('#login-form input[name=slug]').fill('loading-house');
 await page.locator('#login-form input[name=email]').fill('owner@example.fr');
 await page.locator('#login-form input[name=password]').fill('Loading-Strong-2026!');
 await page.locator('#login-form button[type=submit]').click();
 await dishReceived;
 await page.getByText('Cave chargée · Chargement de la carte…').waitFor();
 assert.equal(await page.locator('#shell').isVisible(),false);
 assert.equal(await page.locator('#boot').isVisible(),true);
 const glass=page.locator('#boot .wine-glass--hero');
 assert.equal(await glass.count(),1);
 for(const cls of ['wine-glass__rim','wine-glass__liquid-glint','wine-glass__edge-glint','wine-glass__fill','wine-glass__swell','wine-glass__bowl-inner','wine-glass__stem','wine-glass__foot','wine-glass__wine-light'])
  assert.equal(await glass.locator('.'+cls).count(),1);
 const dimensions=await glass.evaluate(svg=>({
  viewBox:svg.getAttribute('viewBox'),
  wineStops:svg.querySelectorAll('[id$="-wine"] stop').length,
  stemStops:svg.querySelectorAll('[id$="-stem"] stop').length,
  radialGlows:svg.querySelectorAll('radialGradient').length
 }));
 assert.deepEqual(dimensions,{viewBox:'0 0 120 180',wineStops:5,stemStops:4,radialGlows:2});

 // The pour finishes, but restrained surface movement persists until HTTP
 // completion. A genuine slow response changes text, not a fake percentage.
 await page.locator('#boot .loading-detail:not([hidden])').waitFor({timeout:7000});
 assert.equal(await page.locator('#boot .wine-glass__swell').evaluate(el=>
  el.getAnimations().some(a=>a.animationName==='wine-tide'&&a.playState==='running')),true);
 assert.equal(await page.locator('#boot').innerText().then(s=>s.includes('%')),false);
 mkdirSync('test-artifacts',{recursive:true});
 await page.locator('#boot').screenshot({path:'test-artifacts/crystal-glass-v4.png'});
 releaseDish();
 await page.locator('#shell:not([hidden])').waitFor();
 await page.unroute('**/api/dishes');
 // Unique SVG IDs must survive multiple simultaneous loading components.
 // Two cloned glasses may never reference one another's gradient or bowl mask.
 const isolation=await page.evaluate(async()=>{
  const {wineGlass}=await import('/ui.js');
  const host=document.createElement('div');
  host.style.position='absolute';
  host.style.left='-9999px';
  document.body.append(host);
  host.append(wineGlass('inline'),wineGlass('mini'),wineGlass('inline'));
  const glasses=[...host.querySelectorAll('svg')];
  const ids=glasses.flatMap(svg=>[...svg.querySelectorAll('[id]')].map(el=>el.id));
  const referenceProblems=[];
  for(const svg of glasses){
   for(const el of svg.querySelectorAll('[clip-path],[fill]')){
    const attr=el.getAttribute('clip-path')||el.getAttribute('fill');
    const match=/^url\(#([^)]+)\)$/.exec(attr||'');
    if(match&&!svg.querySelector('[id="'+match[1]+'"]'))
     referenceProblems.push(match[1]);
   }
  }
  const details=glasses.map(svg=>({
   clip:svg.querySelector('.wine-glass__fill').parentElement.getAttribute('clip-path'),
   gradient:svg.querySelector('.wine-glass__liquid').getAttribute('fill')
  }));
  host.remove();
  return {count:glasses.length,ids,referenceProblems,details};
 });
 assert.equal(isolation.count,3);
 assert.equal(new Set(isolation.ids).size,isolation.ids.length,'No duplicate clip or gradient IDs');
 assert.deepEqual(isolation.referenceProblems,[],'Each SVG must resolve its own references');
 for(const detail of isolation.details){
  assert.match(detail.clip,/^url\(#ew-glass-/);
  assert.match(detail.gradient,/^url\(#ew-glass-/);
 }
 await page.getByRole('button',{name:/Trouver les meilleurs accords/}).waitFor();
 assert.equal(await page.locator('#boot').isVisible(),false);

 // Real route loading: a deliberate slow GET keeps the inline indicator alive,
 // then removes it immediately on completion (no artificial completion delay).
 let signalStats;
 const statsReceived=new Promise(resolve=>signalStats=resolve);
 const statsGate=new Promise(resolve=>releaseStats=resolve);
 await page.route('**/api/stats',async route=>{
  signalStats();
  await statsGate;
  await route.continue();
 });
 await page.locator('#menu [data-view=stats]').click();
 await statsReceived;
 await page.locator('#workspace[aria-busy=true] .wine-glass--inline').waitFor();
 await page.locator('#workspace .loading-detail:not([hidden])').waitFor({timeout:7000});
 releaseStats();
 await page.getByText('Statistiques du service').waitFor();
 await page.unroute('**/api/stats');
 assert.equal(await page.locator('#workspace .view-loading').count(),0);
 assert.equal(await page.locator('#workspace').getAttribute('aria-busy'),'false');

 // A dark primary busy button must have a visible light glass, and must only
 // confirm success after the actual PATCH result.
 await page.locator('#menu [data-view=wines]').click();
 await page.getByText('Domaine du Temps').waitFor();
 await page.getByRole('button',{name:'Modifier'}).first().click();
 await page.locator('#editor input[name=region]').fill('Coteaux des Tests');
 let signalPatch;
 const patchReceived=new Promise(resolve=>signalPatch=resolve);
 const patchGate=new Promise(resolve=>releasePatch=resolve);
 await page.route('**/api/wines/*',async route=>{
  if(route.request().method()==='PATCH'){
   signalPatch();
   await patchGate;
  }
  await route.continue();
 });
 await page.locator('#editor button[type=submit]').click();
 await patchReceived;
 const button=page.locator('#editor button.primary.is-busy');
 await button.locator('.wine-glass--mini').waitFor();
 const colors=await button.evaluate(node=>{
  const glass=node.querySelector('.wine-glass');
  return {
   wine:getComputedStyle(glass.querySelector('.wine-glass__liquid')).fill,
   outline:getComputedStyle(glass.querySelector('.wine-glass__outline')).stroke,
   busy:node.getAttribute('aria-busy')
  };
 });
 assert.deepEqual(colors,{wine:'rgb(233, 173, 174)',outline:'rgb(255, 249, 244)',busy:'true'});
 assert.equal(await button.evaluate(el=>getComputedStyle(el).opacity),'1');
 assert.match(await button.locator('.wine-glass').evaluate(el=>getComputedStyle(el).animationName),/wine-breathe/);
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await button.locator('.wine-glass').evaluate(el=>getComputedStyle(el).animationName),'none');
 await page.emulateMedia({reducedMotion:'no-preference'});
 assert.equal(await page.locator('#editor').isVisible(),true);
 releasePatch();
 await page.locator('#editor').waitFor({state:'hidden'});
 await page.unroute('**/api/wines/*');
 await page.locator('#notification[data-type=success]').waitFor();

 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('#boot .wine-glass__fill').evaluate(el=>
  getComputedStyle(el).animationName),'none');
 assert.deepEqual(errors,[]);
 console.log('BROWSER_REAL_LOADING_OK: genuine catalogue phases, persistent motion, slow route, busy contrast, reduced motion');
}finally{
 releaseDish?.();releaseStats?.();releasePatch?.();
 if(browser)await browser.close();
 await new Promise(resolve=>server.close(resolve));
 db.close();
}
