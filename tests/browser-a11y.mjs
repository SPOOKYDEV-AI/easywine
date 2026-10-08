import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {createApp} from '../src/server/index.js';
import {scanWCAG} from './axe-util.mjs';

const db=openDatabase(':memory:');
bootstrap(db,{slug:'a11y-house',name:'Maison Inclusive',email:'owner@example.fr',
 owner:'Responsable',password:'Audit-WCAG-Test-2026!'});
const server=createApp({db});server.listen(0,'127.0.0.1');await once(server,'listening');
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 const results=[];
 const scan=async title=>results.push(await scanWCAG(page,title));
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
 await page.locator('#login:not([hidden])').waitFor();
 await scan('login-desktop');
 await page.locator('#login-form input[name=slug]').fill('a11y-house');
 await page.locator('#login-form input[name=email]').fill('owner@example.fr');
 await page.locator('#login-form input[name=password]').fill('Audit-WCAG-Test-2026!');
 await page.locator('#login-form button[type=submit]').click();
 await page.locator('#shell:not([hidden])').waitFor();
 await page.getByText('Préparons votre premier service').waitFor();
 await scan('first-service-desktop');
 await page.locator('#menu [data-view=wines]').click();
 await page.getByRole('button',{name:/Ajouter un vin/}).waitFor();
 await scan('cave-empty-desktop');
 await page.getByRole('button',{name:/Ajouter un vin/}).click();
 await page.locator('#editor[open]').waitFor();
 await scan('wine-dialog-desktop');
 await page.locator('#cancel-editor').click();
 await page.locator('#menu [data-view=account]').click();
 await page.locator('.account-grid').waitFor();
 await scan('account-desktop');
 await page.setViewportSize({width:390,height:844});
 await page.locator('#mobile-nav [data-mobile-view=service]').click();
 await page.getByText('Préparons votre premier service').waitFor();
 await scan('service-mobile');
 await page.locator('#mobile-more').click();
 await page.locator('#mobile-more-panel:not([hidden])').waitFor();
 await scan('mobile-more-panel');
 mkdirSync('test-artifacts',{recursive:true});
 writeFileSync('test-artifacts/a11y-wcag22-lab.json',JSON.stringify(results,null,2));
 const violations=results.flatMap(x=>x.violations.map(v=>({screen:x.screen,...v})));
 console.log('A11Y_FINDINGS '+JSON.stringify(violations.map(x=>({
  screen:x.screen,id:x.id,impact:x.impact,selectors:x.nodes.map(y=>y.target)
 }))));
 console.log('A11Y_AUDIT_COMPLETE scans='+results.length+' violations='+violations.length);
 assert.equal(results.length,7);
}finally{
 if(browser)await browser.close();
 await new Promise(done=>server.close(done));db.close();
}
