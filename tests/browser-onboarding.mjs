
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {createUser} from '../src/server/auth.js';
import {createApp} from '../src/server/index.js';

const password='Onboarding-Test-2026!';
const db=openDatabase(':memory:');
const owner=bootstrap(db,{slug:'first-service',name:'Maison Première',email:'owner@example.fr',
 owner:'Responsable',password});
createUser(db,{restaurantId:owner.restaurantId,name:'Serveur',
 email:'staff@example.fr',role:'staff',password});
const server=createApp({db});server.listen(0,'127.0.0.1');await once(server,'listening');
let browser;
const origin='http://127.0.0.1:'+server.address().port;
async function signIn(page,email){
 await page.goto(origin,{waitUntil:'networkidle'});
 await page.locator('#login-form input[name=slug]').fill('first-service');
 await page.locator('#login-form input[name=email]').fill(email);
 await page.locator('#login-form input[name=password]').fill(password);
 await page.locator('#login-form button[type=submit]').click();
 await page.locator('#shell:not([hidden])').waitFor();
}
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const staff=await browser.newPage({viewport:{width:390,height:844}});
 await signIn(staff,'staff@example.fr');
 await staff.getByText('Préparons votre premier service').waitFor();
 await staff.getByText('Demandez à votre responsable').waitFor();
 assert.equal(await staff.getByRole('button',{name:'Créer mon premier plat'}).count(),0);
 await staff.close();

 const page=await browser.newPage({viewport:{width:390,height:844}});
 await signIn(page,'owner@example.fr');
 await page.getByRole('button',{name:/Créer mon premier plat/}).click();
 await page.getByText('La carte est vide.').waitFor();
 await page.getByRole('button',{name:/Ajouter un plat/}).click();
 await page.locator('#editor[open]').waitFor();
 await page.locator('#editor input[name=name]').fill('Velouté de saison');
 await page.locator('#editor button[type=submit]').click();
 await page.getByText('Velouté de saison').waitFor();
 await page.locator('#menu [data-view=service]').click();
 await page.getByText('Votre cave ne contient actuellement').waitFor();
 await page.getByRole('button',{name:/Renseigner ma cave/}).click();
 await page.getByRole('button',{name:/Ajouter un vin/}).click();
 await page.locator('#editor[open]').waitFor();
 await page.locator('#editor input[name=producer]').fill('Domaine des Premiers');
 await page.locator('#editor input[name=cuvee]').fill('Cuvée découverte');
 await page.locator('#editor input[name=price]').fill('38.50');
 await page.locator('#editor input[name=stock]').fill('8');
 await page.locator('#editor button[type=submit]').click();
 await page.getByText('Cuvée découverte').waitFor();
 await page.locator('#menu [data-view=service]').click();
 assert.equal(await page.getByText('Votre cave ne contient actuellement').count(),0);
 await page.getByRole('button',{name:/Trouver les meilleurs accords/}).click();
 await page.locator('.result-card:not(.classic)').waitFor();
 assert.ok((await page.locator('.result-card:not(.classic)').innerText()).includes('Cuvée découverte'));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
 mkdirSync('test-artifacts',{recursive:true});
 await page.screenshot({path:'test-artifacts/ux-first-service.png',fullPage:true});
 console.log('BROWSER_ONBOARDING_OK: staff-safe empty state, first dish, first stocked wine, first recommendation');
}finally{
 if(browser)await browser.close();
 await new Promise(done=>server.close(done));db.close();
}
