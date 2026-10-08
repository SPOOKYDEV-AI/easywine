import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {createApp} from '../src/server/index.js';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const db=openDatabase(':memory:');
bootstrap(db,{slug:'premium-house',name:'Maison Signature',email:'owner@example.fr',
 owner:'Responsable',password:'Premium-Test-2026!'});
const server=createApp({db});server.listen(0,'127.0.0.1');await once(server,'listening');
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 const login=await fetch(origin+'/api/login',{method:'POST',headers:{
  Origin:origin,'Content-Type':'application/json','X-EasyWine-Request':'1'},
  body:JSON.stringify({slug:'premium-house',email:'owner@example.fr',password:'Premium-Test-2026!'})});
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const seed=async(path,data)=>{
  const r=await fetch(origin+path,{method:'POST',headers:{
   Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-EasyWine-Request':'1'},
   body:JSON.stringify(data)});
  assert.equal(r.status,201);
 };
 await seed('/api/wines',{producer:'Domaine Élégance',cuvee:'Signature',color:'rouge',tags:['frais'],
  body:4,acidity:4,tannin:3,aromatic:4,priceCents:6700,stock:8,byGlass:false,active:true});
 await seed('/api/dishes',{name:'Plat signature',description:'Accord test',intensity:4,
  richness:4,acidity:3,aromatic:3,spice:1,active:true});
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 mkdirSync('test-artifacts',{recursive:true});
 await page.route('**/api/session',async route=>{await sleep(580);await route.continue();});
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.locator('#boot:not([hidden]) .wine-glass--hero').waitFor();
 await page.screenshot({path:'test-artifacts/premium-boot.png'});
 const liquid=page.locator('#boot .wine-glass__liquid');
 assert.match(await liquid.evaluate(el=>getComputedStyle(el).animationName),/wine-pour/);
 await page.locator('#login:not([hidden])').waitFor();
 await page.locator('#login-form input[name=slug]').fill('premium-house');
 await page.locator('#login-form input[name=email]').fill('owner@example.fr');
 await page.locator('#login-form input[name=password]').fill('Premium-Test-2026!');
 await page.locator('#login-form button[type=submit]').click();
 await page.locator('#shell:not([hidden])').waitFor();

 await page.locator('#menu [data-view=wines]').click();
 await page.getByText('Domaine Élégance').waitFor();
 await page.getByRole('button',{name:'Modifier'}).first().click();
 await page.locator('#editor input[name=region]').fill('Cave Prestige');
 let updates=0;
 await page.route('**/api/wines/*',async route=>{
  if(route.request().method()==='PATCH'){updates++;await sleep(400);}
  await route.continue();
 });
 await page.locator('#editor button[type=submit]').click();
 await page.locator('#editor button.is-busy .wine-glass--mini').waitFor();
 assert.equal(await page.locator('#editor button[type=submit]').isDisabled(),true);
 await page.locator('#editor').waitFor({state:'hidden'});
 assert.equal(updates,1);
 await page.locator('#notification[data-type=success]').waitFor();
 assert.match(await page.locator('.feedback-copy').innerText(),/enregistrées/i);
 assert.equal(await page.locator('.feedback-dismiss').getAttribute('aria-label'),'Fermer la notification');
 await page.unroute('**/api/wines/*');

 // An invalid edit is never silently closed, and error feedback is explicit.
 await page.getByRole('button',{name:'Modifier'}).first().click();
 await page.locator('#editor input[name=price]').fill('prix invalide');
 await page.locator('#editor button[type=submit]').click();
 await page.locator('#notification[data-type=error]').waitFor();
 assert.match(await page.locator('.feedback-copy').innerText(),/Prix en euros invalide/);
 assert.equal(await page.locator('#editor').isVisible(),true);
 assert.equal(await page.locator('#editor input[name=price]').inputValue(),'prix invalide');
 await page.locator('.feedback-dismiss').click();
 assert.equal(await page.locator('#notification').isVisible(),false);
 await page.locator('#cancel-editor').click();

 // Preview feedback is distinguishable from the final import confirmation.
 await page.getByRole('button',{name:'Importer CSV'}).click();
 await page.locator('#editor[open]').waitFor();
 await page.route('**/api/import/wines/preview',async route=>{
  await sleep(390);
  await route.continue();
 });
 await page.locator('#editor input[type=file]').setInputFiles({
  name:'reserve.csv',mimeType:'text/csv',
  buffer:Buffer.from('producer;cuvee;color;body;acidity;tannin;aromatic;price_eur;stock\nMaison des tests;Cuvée imaginée;blanc;2;4;2;4;36,50;3\n')
 });
 await page.locator('.import-preview[aria-busy=true] .wine-glass--mini').waitFor();
 await page.getByText('Fichier vérifié · prêt à importer.').waitFor();
 assert.equal(await page.locator('.import-preview').getAttribute('aria-busy'),null);
 await page.unroute('**/api/import/wines/preview');
 await page.locator('#cancel-editor').click();

 await page.locator('#menu [data-view=service]').click();
 await page.getByRole('button',{name:/Trouver les meilleurs accords/}).waitFor();
 await page.route('**/api/recommend',async route=>{await sleep(350);await route.continue();});
 await page.getByRole('button',{name:/Trouver les meilleurs accords/}).click();
 await page.locator('.view-loading .wine-glass--inline').waitFor();
 await page.getByText('Recherche des vins réellement disponibles…').waitFor();
 await page.locator('.result-card:not(.classic)').waitFor();
 await page.getByText(/suggestion\(s\) vérifiée\(s\) dans votre cave/).waitFor();
 await page.unroute('**/api/recommend');

 // Changing a filter invalidates previously displayed advice immediately.
 await page.getByRole('button',{name:'Léger',exact:true}).click();
 await page.getByText('Vos critères ont changé.').waitFor();
 assert.equal(await page.locator('.result-confirmation').count(),0);

 // A response that was computed before a filter change must never reappear
 // beneath the user's newer preferences, even when the HTTP request succeeds.
 let releaseRecommendation,interceptRecommendation;
 const heldResponse=new Promise(resolve=>{releaseRecommendation=resolve;});
 const intercepted=new Promise(resolve=>{interceptRecommendation=resolve;});
 await page.route('**/api/recommend',async route=>{
  interceptRecommendation();
  await heldResponse;
  await route.continue();
 });
 await page.locator('.service-submit').click();
 await intercepted;
 await page.locator('.view-loading .wine-glass--inline').waitFor();
 await page.getByRole('button',{name:'Léger',exact:true}).click();
 await page.getByText('Vos critères ont changé.').waitFor();
 releaseRecommendation();
 await page.locator('.service-submit:not(.is-busy)').waitFor();
 assert.equal(await page.locator('.result-confirmation').count(),0);
 assert.equal(await page.getByText('Vos critères ont changé.').count(),1);
 await page.unroute('**/api/recommend');
 await page.locator('.service-submit').click();
 await page.locator('.result-card:not(.classic)').waitFor();

 await page.emulateMedia({reducedMotion:'reduce'});
 await page.locator('#menu [data-view=stats]').click();
 await page.route('**/api/audit',route=>route.continue());
 await page.locator('#menu [data-view=history]').click();
 await page.locator('#menu [data-view=service]').click();
 await page.route('**/api/recommend',async route=>{await sleep(300);await route.continue();});
 await page.getByRole('button',{name:/Trouver les meilleurs accords/}).click();
 await page.locator('.view-loading .wine-glass__liquid').waitFor();
 const reduced=await page.locator('.view-loading .wine-glass__liquid').evaluate(el=>({
  animation:getComputedStyle(el).animationName,clip:getComputedStyle(el).clipPath
 }));
 assert.equal(reduced.animation,'none');
 assert.equal(reduced.clip,'none');
 await page.locator('.result-card:not(.classic)').waitFor();
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth)),0);
 mkdirSync('test-artifacts',{recursive:true});
 await page.screenshot({path:'test-artifacts/premium-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('BROWSER_PREMIUM_OK: animated glass, busy buttons, success/error feedback, wine pairing, reduced motion');
}finally{
 if(browser)await browser.close();
 await new Promise(done=>server.close(done));db.close();
}
