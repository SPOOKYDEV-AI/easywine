
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {createApp} from '../src/server/index.js';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const db=openDatabase(':memory:');
bootstrap(db,{slug:'ux-test',name:'Maison UX',email:'owner@example.fr',owner:'Responsable',
 password:'UX-Strong-Password-2026!'});
const server=createApp({db});server.listen(0,'127.0.0.1');await once(server,'listening');
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 const login=await fetch(origin+'/api/login',{method:'POST',headers:{
  Origin:origin,'Content-Type':'application/json','X-EasyWine-Request':'1'
 },body:JSON.stringify({slug:'ux-test',email:'owner@example.fr',password:'UX-Strong-Password-2026!'})});
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const seed=async(path,payload)=>{
  const res=await fetch(origin+path,{method:'POST',headers:{
   Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-EasyWine-Request':'1'
  },body:JSON.stringify(payload)});
  assert.equal(res.status,201);
 };
 await seed('/api/wines',{producer:'Maison de l’UX',cuvee:'Réserve de test',color:'rouge',tags:['frais'],
  body:4,acidity:4,tannin:3,aromatic:3,priceCents:7500,stock:6,byGlass:false,active:true});
 await seed('/api/dishes',{name:'Plat de validation UX',description:'Plat de test',intensity:4,
  richness:4,acidity:3,aromatic:3,spice:2,active:true});
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.__ux={longTasks:0,cls:0,lcp:0};
  try{new PerformanceObserver(list=>{
   for(const item of list.getEntries())window.__ux.longTasks+=item.duration>50?1:0;
  }).observe({type:'longtask',buffered:true});}catch{}
  try{new PerformanceObserver(list=>{
   for(const entry of list.getEntries())if(!entry.hadRecentInput)window.__ux.cls+=entry.value;
  }).observe({type:'layout-shift',buffered:true});}catch{}
  try{new PerformanceObserver(list=>{
   for(const entry of list.getEntries())window.__ux.lcp=entry.startTime;
  }).observe({type:'largest-contentful-paint',buffered:true});}catch{}
 });
 let countSession=0;
 await page.route('**/api/session',async route=>{
  if(countSession++===0)await sleep(320);
  await route.continue();
 });
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.locator('#boot:not([hidden])').waitFor();
 await page.getByText('Préparation de votre espace…').waitFor();
 await page.locator('#login:not([hidden])').waitFor();
 assert.equal(await page.locator('#boot').isVisible(),false);
 const guestAssets=await page.evaluate(()=>performance.getEntriesByType('resource')
  .map(x=>new URL(x.name).pathname));
 for(const module of ['/admin.js','/account.js','/stats.js','/service.js'])
  assert.equal(guestAssets.includes(module),false,'Anonymous boot should not fetch '+module);
 let loginRequests=0;
 await page.route('**/api/login',async route=>{loginRequests++;await sleep(350);await route.continue();});
 await page.locator('#login-form input[name=slug]').fill('ux-test');
 await page.locator('#login-form input[name=email]').fill('owner@example.fr');
 await page.locator('#login-form input[name=password]').fill('UX-Strong-Password-2026!');
 await page.locator('#login-form button[type=submit]').click();
 await page.getByText('Connexion en cours…').waitFor();
 assert.equal(await page.locator('#login-form button[type=submit]').isDisabled(),true);
 await page.locator('#shell:not([hidden])').waitFor();
 assert.equal(loginRequests,1);
 assert.equal(await page.locator('#menu [data-view=service]').getAttribute('aria-current'),'page');
 const times={};
 const clickAndWait=async(name,selector)=>{
  const started=Date.now();await page.locator('#menu [data-view='+name+']').click();
  await page.locator(selector).waitFor();times[name]=Date.now()-started;
 };
 await clickAndWait('wines','.item-row');
 await page.getByText('Réserve de test').waitFor();
 let delayStats=true;
 await page.route('**/api/stats',async route=>{if(delayStats)await sleep(430);await route.continue();});
 await page.locator('#menu [data-view=stats]').click();
 await page.getByText('Calcul des statistiques…').waitFor();
 await page.locator('#menu [data-view=wines]').click();
 await page.getByText('Réserve de test').waitFor();
 assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource')
  .some(x=>new URL(x.name).pathname==='/admin.js')),true);
 await sleep(530);
 assert.equal(await page.locator('#menu [data-view=wines]').getAttribute('aria-current'),'page');
 assert.equal(await page.getByText('Statistiques du service').count(),0);
 delayStats=false;
 await page.unroute('**/api/stats');
 await page.route('**/api/stats',route=>route.abort('failed'));
 await page.locator('#menu [data-view=stats]').click();
 await page.getByText('Impossible de charger cette rubrique').waitFor();
 await page.unroute('**/api/stats');
 await page.getByRole('button',{name:'Réessayer'}).click();
 await page.getByText('Statistiques du service').waitFor();
 await page.locator('#menu [data-view=service]').click();
 await page.route('**/api/recommend',async route=>{await sleep(300);await route.continue();});
 await page.getByRole('button',{name:/Trouver les meilleurs accords/}).click();
 await page.getByText('Recherche des vins réellement disponibles…').waitFor();
 await page.locator('.result-card:not(.classic)').waitFor();
 await page.unroute('**/api/recommend');
 const desktop=await page.evaluate(()=>({
  ...window.__ux,
  nav:performance.getEntriesByType('navigation')[0]?.toJSON(),
  resourceCount:performance.getEntriesByType('resource').length,
  maxHorizontalOverflow:Math.max(0,document.documentElement.scrollWidth-window.innerWidth)
 }));
 assert.equal(desktop.maxHorizontalOverflow,0);
 await page.setViewportSize({width:390,height:844});
 await page.locator('#menu [data-view=wines]').click();
 await page.getByText('Réserve de test').waitFor();
 const mobile=await page.evaluate(()=>({
  horizontalOverflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),
  minNavHeight:Math.min(...[...document.querySelectorAll('#menu .nav-link')].map(x=>x.getBoundingClientRect().height))
 }));
 assert.equal(mobile.horizontalOverflow,0);
 assert.ok(mobile.minNavHeight>=43);
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.loading-spinner')||document.querySelector('.boot-progress span')).animationDuration),'0s');
 assert.deepEqual(errors,[]);
 mkdirSync('test-artifacts',{recursive:true});
 const metrics={platform:process.platform,synthetic:true,viewport:{desktop,mobile},navDurationsMs:times,errors};
 writeFileSync('test-artifacts/ux-lab-metrics.json',JSON.stringify(metrics,null,2));
 await page.screenshot({path:'test-artifacts/ux-mobile.png',fullPage:true});
 console.log('BROWSER_UX_OK '+JSON.stringify({nav:times,cls:desktop.cls,lcpMs:desktop.lcp,overflow:mobile.horizontalOverflow}));
}finally{
 if(browser)await browser.close();
 await new Promise(done=>server.close(done));db.close();
}
