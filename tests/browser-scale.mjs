
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {createApp} from '../src/server/index.js';

const ITEMS=2400;
const db=openDatabase(':memory:');
const owner=bootstrap(db,{slug:'scale-test',name:'Maison charge',email:'owner@example.fr',
 owner:'Responsable',password:'Scale-Test-Pass-2026!'});
const statement=db.prepare('INSERT INTO wines(id,restaurant_id,producer,cuvee,color,body,acidity,tannin,aromatic,price_cents,stock,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
db.exec('BEGIN');
try{
 for(let i=0;i<ITEMS;i++){
  statement.run('scale-'+i,owner.restaurantId,'Domaine '+String(i).padStart(4,'0'),
   'Cuvée numéro '+i,i%3===0?'blanc':'rouge',3,4,3,4,5000+i,10,'2026-10-08T00:00:00.000Z');
 }
 db.exec('COMMIT');
}catch(error){db.exec('ROLLBACK');throw error;}
const server=createApp({db});server.listen(0,'127.0.0.1');await once(server,'listening');
const root='http://127.0.0.1:'+server.address().port;
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 await page.goto(root,{waitUntil:'networkidle'});
 await page.locator('#login-form input[name=slug]').fill('scale-test');
 await page.locator('#login-form input[name=email]').fill('owner@example.fr');
 await page.locator('#login-form input[name=password]').fill('Scale-Test-Pass-2026!');
 const loadStart=Date.now();
 await page.locator('#login-form button[type=submit]').click();
 await page.locator('#shell:not([hidden])').waitFor();
 const readyMs=Date.now()-loadStart;
 await page.locator('#menu [data-view=wines]').click();
 await page.getByText('Cuvée numéro 0',{exact:false}).first().waitFor();
 assert.equal(await page.locator('.item-row').count(),80);
 assert.match(await page.locator('.result-count').innerText(),/2400 référence/);
 const first=Date.now();
 await page.locator('.load-more').click();
 assert.equal(await page.locator('.item-row').count(),160);
 const expandMs=Date.now()-first;
 const search=page.getByRole('searchbox',{name:'Rechercher un vin'});
 const searchStart=Date.now();
 await search.fill('2399');
 await page.getByText('Cuvée numéro 2399').waitFor();
 const searchMs=Date.now()-searchStart;
 assert.equal(await page.locator('.item-row').count(),1);
 await search.fill('inexistant-test');
 await page.getByText('Aucun vin enregistré pour cette recherche.').waitFor();
 await search.fill('');
 assert.equal(await page.locator('.item-row').count(),80);
 await page.setViewportSize({width:390,height:844});
 const layout=await page.evaluate(()=>({
  overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),
  rows:document.querySelectorAll('.item-row').length,
  nodes:document.querySelectorAll('*').length
 }));
 assert.equal(layout.overflow,0);
 assert.equal(layout.rows,80);
 assert.deepEqual(errors,[]);
 const report={samples:ITEMS,readyMs,expandMs,searchMs,layout,synthetic:true};
 mkdirSync('test-artifacts',{recursive:true});
 writeFileSync('test-artifacts/ux-scale.json',JSON.stringify(report,null,2));
 console.log('BROWSER_SCALE_OK '+JSON.stringify(report));
}finally{
 if(browser)await browser.close();
 await new Promise(done=>server.close(done));db.close();
}
