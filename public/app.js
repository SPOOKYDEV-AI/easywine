
import {byId,request,notice,handle,empty} from './ui.js';
import {renderService} from './service.js';
import {renderStats} from './stats.js';
import {renderWines,renderDishes,renderHistory,renderUsers,addUserButton} from './admin.js';
import {renderAccount} from './account.js';

let currentUser=null;
let pendingMfaChallenge=null;
let currentView='service';
let store={wines:[],dishes:[]};
const workspace=byId('workspace');

function showLogin(){
 pendingMfaChallenge=null;
 byId('login-form').hidden=false;
 byId('mfa-form').hidden=true;
 byId('mfa-form').elements.code.value='';
 currentUser=null;
 byId('shell').hidden=true;
 byId('login').hidden=false;
 byId('login-form').elements.password.value='';
}
function showShell(){
 byId('login').hidden=true;
 byId('shell').hidden=false;
 byId('restaurant-name').textContent=currentUser.restaurantName;
 byId('user-label').textContent=currentUser.name+' · '+currentUser.role;
 const isStaff=currentUser.role==='staff';
 for(const button of document.querySelectorAll('#menu [data-view]')){
  button.hidden=isStaff&&!['service','account'].includes(button.dataset.view);
  if(button.dataset.view==='users')button.hidden=currentUser.role==='staff';
 }
 byId('today').textContent=new Intl.DateTimeFormat('fr-FR',{dateStyle:'long'}).format(new Date());
}
async function load(){
 const [wines,dishes]=await Promise.all([
  request('GET','/api/wines'),request('GET','/api/dishes')
 ]);
 store={wines:wines.wines,dishes:dishes.dishes};
}
async function refresh(){await load();await view(currentView);}
async function view(name){
 if(!currentUser)return;
 if(currentUser.role==='staff'&&!['service','account'].includes(name))name='service';
 currentView=name;
 for(const button of document.querySelectorAll('#menu [data-view]'))
  button.classList.toggle('active',button.dataset.view===name);
 workspace.replaceChildren(empty('Chargement…'));
 if(name==='service')renderService(workspace,store);
 else if(name==='wines')renderWines(workspace,store,refresh);
 else if(name==='dishes')renderDishes(workspace,store,refresh);
 else if(name==='history')await renderHistory(workspace);
 else if(name==='stats')await renderStats(workspace);
 else if(name==='users'){
  await renderUsers(workspace,{canManage:currentUser.role==='owner',refresh,currentId:currentUser.id});
  if(currentUser.role==='owner')addUserButton(workspace,refresh);
 }else if(name==='account')await renderAccount(workspace,currentUser,showLogin);
 workspace.focus({preventScroll:true});
}
byId('login-form').addEventListener('submit',handle(async event=>{
 event.preventDefault();
 const submit=event.target.querySelector('button[type=submit]');
 submit.disabled=true;
 try{
  const form=new FormData(event.target);
  const result=await request('POST','/api/login',{
   slug:String(form.get('slug')).trim().toLowerCase(),
   email:String(form.get('email')).trim(),
   password:String(form.get('password'))
  });
  if(result.mfaRequired){
   pendingMfaChallenge=result.challenge;
   byId('login-form').hidden=true;
   byId('mfa-form').hidden=false;
   byId('mfa-form').elements.code.focus();
   return;
  }
  currentUser=result.user;
  await load();showShell();await view('service');
 }finally{submit.disabled=false;}
}));

byId('mfa-form').addEventListener('submit',handle(async event=>{
 event.preventDefault();
 if(!pendingMfaChallenge)throw Error('Votre défi de sécurité a expiré. Recommencez la connexion.');
 const submit=event.target.querySelector('button[type=submit]');
 submit.disabled=true;
 try{
  const code=String(new FormData(event.target).get('code')||'').trim();
  const result=await request('POST','/api/login/mfa',{challenge:pendingMfaChallenge,code});
  pendingMfaChallenge=null;
  currentUser=result.user;
  await load();showShell();await view('service');
 }finally{submit.disabled=false;}
}));
byId('mfa-cancel').addEventListener('click',showLogin);
for(const button of document.querySelectorAll('#menu [data-view]')){
 button.addEventListener('click',handle(()=>view(button.dataset.view)));
}
const logout=handle(async()=>{
 await request('POST','/api/logout',{});
 showLogin();
});
byId('logout').addEventListener('click',logout);
byId('logout-mobile').addEventListener('click',logout);
window.addEventListener('easywine:unauthorized',showLogin);
(async()=>{
 try{
  const result=await request('GET','/api/me');
  currentUser=result.user;
  await load();showShell();await view('service');
 }catch(error){showLogin();}
})();
