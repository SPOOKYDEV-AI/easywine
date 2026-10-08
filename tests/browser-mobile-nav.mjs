
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {createUser} from '../src/server/auth.js';
import {createApp} from '../src/server/index.js';

const password='Mobile-UX-Safe-2026!';
const db=openDatabase(':memory:');
const owner=bootstrap(db,{slug:'mobile-tabs',name:'Maison Mobile',email:'owner@example.fr',
 owner:'Responsable',password});
createUser(db,{restaurantId:owner.restaurantId,name:'Serveur',
 email:'staff@example.fr',role:'staff',password});
const server=createApp({db});server.listen(0,'127.0.0.1');await once(server,'listening');
let browser;
const origin='http://127.0.0.1:'+server.address().port;
async function login(page,email){
 await page.goto(origin,{waitUntil:'networkidle'});
 await page.locator('#login-form input[name=slug]').fill('mobile-tabs');
 await page.locator('#login-form input[name=email]').fill(email);
 await page.locator('#login-form input[name=password]').fill(password);
 await page.locator('#login-form button[type=submit]').click();
 await page.locator('#mobile-nav:not([hidden])').waitFor();
}
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await login(page,'owner@example.fr');
 assert.equal(await page.locator('.sidebar').isVisible(),false);
 assert.equal(await page.locator('#mobile-nav button:not([hidden])').count(),5);
 const tabSizes=await page.locator('#mobile-nav button:not([hidden])').evaluateAll(
  buttons=>buttons.map(b=>({width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height}))
 );
 assert.ok(tabSizes.every(x=>x.width>=44&&x.height>=44));
 const more=page.locator('#mobile-more');
 await more.click();
 assert.equal(await more.getAttribute('aria-expanded'),'true');
 await page.locator('#mobile-more-panel:not([hidden])').waitFor();
 await page.keyboard.press('Escape');
 assert.equal(await more.getAttribute('aria-expanded'),'false');
 assert.equal(await more.evaluate(el=>document.activeElement===el),true);
 await more.click();
 await page.locator('#mobile-more-panel [data-mobile-view=stats]').click();
 await page.getByText('Statistiques du service').waitFor();
 assert.equal(await page.locator('#mobile-more-panel').isVisible(),false);
 assert.equal(await more.getAttribute('data-active'),'true');
 await page.locator('#mobile-nav [data-mobile-view=account]').click();
 await page.locator('.account-grid').waitFor();
 await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
 await page.locator('#mobile-nav [data-mobile-view=service]').click();
 await page.getByText('Préparons votre premier service').waitFor();
 assert.equal(await page.evaluate(()=>scrollY),0);
 await page.setViewportSize({width:320,height:720});
 assert.equal(await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth)),0);
 mkdirSync('test-artifacts',{recursive:true});
 await page.screenshot({path:'test-artifacts/mobile-navigation.png',fullPage:true});
 await page.close();
 const staff=await browser.newPage({viewport:{width:390,height:844}});
 await login(staff,'staff@example.fr');
 assert.equal(await staff.locator('#mobile-more').isVisible(),false);
 assert.equal(await staff.locator('#mobile-nav [data-mobile-view=wines]').isVisible(),false);
 assert.equal(await staff.locator('#mobile-nav [data-mobile-view=dishes]').isVisible(),false);
 assert.equal(await staff.locator('#mobile-nav [data-mobile-view=service]').isVisible(),true);
 assert.equal(await staff.locator('#mobile-nav [data-mobile-view=account]').isVisible(),true);
 await staff.locator('#mobile-nav [data-mobile-view=account]').click();
 await staff.locator('.account-grid').waitFor();
 assert.deepEqual(errors,[]);
 console.log('BROWSER_MOBILE_NAV_OK: thumb tabs, overflow, Escape, role gating and scroll reset');
}finally{
 if(browser)await browser.close();
 await new Promise(done=>server.close(done));db.close();
}
