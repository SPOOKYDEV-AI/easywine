
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {chromium} from 'playwright';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {createApp} from '../src/server/index.js';
import {decryptMfaSecret,totpAt} from '../src/server/mfa-crypto.js';

const prior=process.env.EASYWINE_MFA_KEY,key=randomBytes(32);
process.env.EASYWINE_MFA_KEY=key.toString('hex');
const db=openDatabase(':memory:');
const owner=bootstrap(db,{slug:'mfa-chrome',name:'Maison Sécurisée',email:'owner@example.fr',
 owner:'Responsable',password:'Chrome-MFA-Test-2026!'});
const server=createApp({db});server.listen(0,'127.0.0.1');
await once(server,'listening');
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1024,height:768}});
 const errors=[];
 page.on('pageerror',x=>errors.push(x.message));
 page.on('response',res=>{if(res.status()>=400&&!res.url().endsWith('/api/me'))errors.push('HTTP '+res.status()+' '+res.url());});
 async function login(){
  await page.locator('#login-form input[name=slug]').fill('mfa-chrome');
  await page.locator('#login-form input[name=email]').fill('owner@example.fr');
  await page.locator('#login-form input[name=password]').fill('Chrome-MFA-Test-2026!');
  await page.locator('#login-form button[type=submit]').click();
 }
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
 await login();
 await page.locator('#shell:not([hidden])').waitFor();
 await page.locator('#menu [data-view=account]').click();
 await page.getByRole('button',{name:'Commencer la configuration'}).waitFor();
 await page.locator('.account-grid section').last().locator('input[type=password]').fill('Chrome-MFA-Test-2026!');
 await page.getByRole('button',{name:'Commencer la configuration'}).click();
 try{await page.locator('.secret-value').waitFor({timeout:8000});}
 catch(error){
  console.log('MFA_ACCOUNT_DIAGNOSTIC:',(await page.locator('#workspace').innerText()).slice(0,1600));
  console.log('MFA_NETWORK_DIAGNOSTIC:',errors.slice(-10));
  console.log('MFA_TOAST_DIAGNOSTIC:',await page.locator('#notification').innerText());
  console.log('MFA_FORM_DIAGNOSTIC:',await page.locator('.account-grid section').last().locator('form').evaluate(form=>({
   valid:form.checkValidity(),html:form.outerHTML,
   values:[...form.querySelectorAll('input')].map(x=>({name:x.name,type:x.type,length:x.value.length,valid:x.checkValidity()}))
  })));
  throw error;
 }
 const encrypted=db.prepare('SELECT encrypted_secret FROM mfa_credentials WHERE user_id=?')
  .get(owner.userId).encrypted_secret;
 const secret=decryptMfaSecret(encrypted,owner.userId,key);
 const code=totpAt(secret);
 await page.locator('.mfa-setup input[name=otp]').fill(code);
 await page.getByRole('button',{name:'Vérifier et activer'}).click();
 await page.locator('.recovery-codes').waitFor();
 assert.equal((await page.locator('.recovery-codes').innerText()).trim().split('\n').length,8);
 await page.getByRole('button',{name:/J’ai sauvegardé les codes/}).click();
 await page.locator('#login:not([hidden])').waitFor();
 await login();
 await page.locator('#mfa-form:not([hidden])').waitFor();
 await page.locator('#mfa-form input[name=code]').fill(code);
 await page.locator('#mfa-form button[type=submit]').click();
 await page.locator('#shell:not([hidden])').waitFor();
 await page.locator('#menu [data-view=account]').click();
 await page.getByText('Second facteur actif').waitFor();
 assert.deepEqual(errors,[]);
 secret.fill(0);
 console.log('BROWSER_MFA_OK: enrollment, recovery codes and second-factor login');
}finally{
 if(browser)await browser.close();
 await new Promise(done=>server.close(done));db.close();key.fill(0);
 if(prior===undefined)delete process.env.EASYWINE_MFA_KEY;else process.env.EASYWINE_MFA_KEY=prior;
}
