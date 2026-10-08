
import {byId,request,notice,handle,loadingState,errorState,withBusy} from './ui.js';
import {renderService,resetServicePreferences} from './service.js';
import {renderStats} from './stats.js';
import {renderWines,renderDishes,renderHistory,renderUsers,addUserButton} from './admin.js';
import {renderAccount} from './account.js';

let currentUser=null;
let pendingMfaChallenge=null;
let currentView='service';
let store={wines:[],dishes:[]};
let viewEpoch=0;
const workspace=byId('workspace');

function showLogin(){
 store={wines:[],dishes:[]};
 resetServicePreferences();
 viewEpoch++;
 byId('boot').hidden=true;
 byId('workspace').setAttribute('aria-busy','false');
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
 byId('boot').hidden=true;
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
 const epoch=++viewEpoch;
 currentView=name;
 for(const button of document.querySelectorAll('#menu [data-view]')){
  const active=button.dataset.view===name;
  button.classList.toggle('active',active);
  if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
 }
 const messages={
  service:'Préparation des accords…',wines:'Ouverture de la cave…',dishes:'Chargement de la carte…',
  history:'Lecture de l’historique…',stats:'Calcul des statistiques…',
  users:'Chargement de l’équipe…',account:'Ouverture des paramètres du compte…'
 };
 const staging=document.createElement('div');
 const target=workspace;
 target.setAttribute('aria-busy','true');
 target.replaceChildren(loadingState(messages[name]||'Chargement…'));
 try{
  if(name==='service')renderService(staging,store,{role:currentUser.role,onNavigate:view});
  else if(name==='wines')renderWines(staging,store,refresh);
  else if(name==='dishes')renderDishes(staging,store,refresh);
  else if(name==='history')await renderHistory(staging);
  else if(name==='stats')await renderStats(staging);
  else if(name==='users'){
   await renderUsers(staging,{canManage:currentUser.role==='owner',refresh,currentId:currentUser.id});
   if(currentUser.role==='owner')addUserButton(staging,refresh);
  }else if(name==='account')await renderAccount(staging,currentUser,showLogin);
  if(epoch!==viewEpoch)return;
  target.replaceChildren(...staging.childNodes);
  target.focus({preventScroll:true});
  performance.mark('easywine:view:'+name+':ready');
 }catch(error){
  if(epoch!==viewEpoch)return;
  target.replaceChildren(errorState(error?.message||'Une erreur est survenue.',()=>view(name)));
 }finally{
  if(epoch===viewEpoch)target.setAttribute('aria-busy','false');
 }
}
async function enter(user){
 currentUser=user;
 const stamp=++viewEpoch;
 showShell();
 workspace.setAttribute('aria-busy','true');
 workspace.replaceChildren(loadingState('Chargement de votre cave et de votre carte…'));
 try{
  await load();
  if(stamp!==viewEpoch)return;
  await view('service');
  performance.mark('easywine:app-ready');
 }catch(error){
  if(stamp!==viewEpoch)return;
  workspace.setAttribute('aria-busy','false');
  workspace.replaceChildren(errorState(error?.message||'Chargement impossible.',()=>enter(user)));
 }
}
byId('login-form').addEventListener('submit',handle(async event=>{
 event.preventDefault();
 const submit=event.target.querySelector('button[type=submit]');
 await withBusy(submit,async()=>{
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
  await enter(result.user);
 },'Connexion en cours…');
}));

byId('mfa-form').addEventListener('submit',handle(async event=>{
 event.preventDefault();
 if(!pendingMfaChallenge)throw Error('Votre défi de sécurité a expiré. Recommencez la connexion.');
 const submit=event.target.querySelector('button[type=submit]');
 await withBusy(submit,async()=>{
  const code=String(new FormData(event.target).get('code')||'').trim();
  const result=await request('POST','/api/login/mfa',{challenge:pendingMfaChallenge,code});
  pendingMfaChallenge=null;
  await enter(result.user);
 },'Vérification du code…');
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
async function boot(){
 const bootNode=byId('boot');
 if(!bootNode.querySelector('.boot-content')){
  bootNode.replaceChildren(loadingState('Vérification de votre session…'));
 }
 byId('boot').hidden=false;
 byId('login').hidden=true;
 byId('shell').hidden=true;
 try{
  const result=await request('GET','/api/session');
  if(!result.user){showLogin();performance.mark('easywine:login-ready');return;}
  await enter(result.user);
 }catch(error){
  const message=error?.message||'Impossible de joindre EasyWine.';
  byId('boot').replaceChildren(errorState(message,boot));
  byId('boot').hidden=false;
 }
}
boot();
