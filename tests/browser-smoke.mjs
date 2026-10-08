
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {createApp} from '../src/server/index.js';

const db=openDatabase(':memory:');
bootstrap(db,{slug:'browser-e2e',name:'Maison de test',email:'owner@example.fr',owner:'Responsable',
  password:'Playwright-Testing-2026!'});
const server=createApp({db});
server.listen(0,'127.0.0.1');
await once(server,'listening');
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try{
 const login=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-EasyWine-Request':'1'},
  body:JSON.stringify({slug:'browser-e2e',email:'owner@example.fr',password:'Playwright-Testing-2026!'})});
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 async function seed(path,body){
  const response=await fetch(origin+path,{method:'POST',headers:{
   Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-EasyWine-Request':'1'
  },body:JSON.stringify(body)});
  assert.equal(response.status,201);
  return response.json();
 }
 await seed('/api/wines',{producer:'Domaine du Test',cuvee:'Cuvée de validation',appellation:'AOC Rhône',
  vintage:'2023',region:'Rhône',grapes:'Syrah',color:'rouge',tags:['frais'],
  body:4,acidity:4,tannin:3,aromatic:3,priceCents:7200,stock:5,byGlass:false,active:true});
 await seed('/api/dishes',{name:'Canard rôti de test',description:'Jus réduit',
  intensity:4,richness:4,acidity:3,aromatic:3,spice:1,active:true});
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1024,height:768}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{if(response.status()>=400 && !(response.status()===401 && response.url().endsWith('/api/me')))errors.push('HTTP '+response.status()+' '+response.url());});
 page.on('requestfailed',request=>errors.push(request.failure()?.errorText||'Failed network request'));
 await page.goto(origin,{waitUntil:'networkidle'});
 await page.locator('input[name=slug]').fill('browser-e2e');
 await page.locator('input[name=email]').fill('owner@example.fr');
 await page.locator('input[name=password]').fill('Playwright-Testing-2026!');
 await page.locator('#login-form button[type=submit]').click();
 await page.locator('#shell:not([hidden])').waitFor();
 assert.ok(await page.getByText('Maison de test').count());
 await page.locator('#menu [data-view=dishes]').click();
 await page.getByText('Canard rôti de test').waitFor();
 await page.locator('#menu [data-view=wines]').click();
 await page.getByText('Cuvée de validation').waitFor();
 await page.getByRole('button',{name:'Importer CSV'}).click();
 await page.locator('#editor[open]').waitFor();
 await page.locator('#editor input[type=file]').setInputFiles({
  name:'test.csv',mimeType:'text/csv',
  buffer:Buffer.from('producer;cuvee;color;body;acidity;tannin;aromatic;price_eur;stock\nAutre domaine;Cuvée importée;blanc;2;5;1;4;58,50;2\n')
 });
 await page.getByText('1 références valides sur 1.').waitFor();
 await page.locator('#cancel-editor').click();
 await page.locator('#menu [data-view=service]').click();
 await page.locator('.chip').filter({hasText:'Frais'}).click();
 await page.getByRole('button',{name:/Trouver les meilleurs accords/}).click();
 await page.locator('.result-card:not(.classic)').waitFor();
 assert.ok((await page.locator('#workspace').innerText()).includes('Je vous propose Domaine du Test'));
 await page.getByRole('button',{name:'Le client a choisi ce vin'}).click();
 await page.getByText(/Choix enregistré/).waitFor();
 await page.locator('#menu [data-view=stats]').click();
 await page.getByText('Par référence').waitFor();
 assert.deepEqual(await page.locator('.stat-tile strong').allTextContents(),['1','1','100 %']);
 await page.locator('#menu [data-view=service]').click();
 mkdirSync('test-artifacts',{recursive:true});
 await page.screenshot({path:'test-artifacts/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.reload({waitUntil:'networkidle'});
 await page.locator('#shell:not([hidden])').waitFor();
 await page.locator('#menu [data-view=service]').click();
 assert.equal(await page.locator('#logout-mobile').isVisible(),true);
 await page.screenshot({path:'test-artifacts/mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('BROWSER_SMOKE_OK: login, cave, plats, CSV, recommandations et mobile');
}finally{
 if(browser)await browser.close();
 await new Promise(done=>server.close(done));
 db.close();
}
