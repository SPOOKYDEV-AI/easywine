
import {byId,request,notice,handle,loadingState,loadingStage,watchLongLoading,errorState,withBusy,rotateRequestScope} from './ui.js';
import {viewFromHash,writeViewLocation} from './navigation.js';
import './network-status.js';
// Route-level code splitting: the login screen only downloads app.js and ui.js.
// Never evaluate the full administration/statistics modules before they are needed.
const routeModules=new Map();
let serviceModule=null;
function moduleFor(viewName){
 const section=['wines','dishes','history','users'].includes(viewName)?'admin':viewName;
 const loaders={
  service:()=>import('./service.js'),
  admin:()=>import('./admin.js'),
  stats:()=>import('./stats.js'),
  account:()=>import('./account.js')
 };
 if(!Object.hasOwn(loaders,section))throw new Error('Rubrique inconnue.');
 if(!routeModules.has(section)){
  const loading=loaders[section]().then(mod=>{
   if(section==='service')serviceModule=mod;
   return mod;
  }).catch(error=>{routeModules.delete(section);throw error;});
  routeModules.set(section,loading);
 }
 return routeModules.get(section);
}

let currentUser=null;
let pendingMfaChallenge=null;
let currentView='service';
let store={wines:[],dishes:[]};
let viewEpoch=0;
let hasCommittedView=false;
let sessionEpoch=0;
let storeLoadedAt=0;
const STALE_CATALOG_MS=30_000;
const workspace=byId('workspace');
function closeMobileMore(){
 byId('mobile-more-panel').hidden=true;
 byId('mobile-more').setAttribute('aria-expanded','false');
}


function showLogin(){
 rotateRequestScope();
 sessionEpoch++;
 storeLoadedAt=0;
 store={wines:[],dishes:[]};
 if(serviceModule)serviceModule.resetServicePreferences();
 viewEpoch++;
 byId('boot').hidden=true;
 workspace.setAttribute('aria-busy','false');
 workspace.inert=false;
 workspace.replaceChildren(); // Never preserve a previous tenant's DOM behind the login screen.
 hasCommittedView=false;
 pendingMfaChallenge=null;
 byId('login-form').hidden=false;
 byId('mfa-form').hidden=true;
 byId('mfa-form').elements.code.value='';
 currentUser=null;
 closeMobileMore();
 byId('mobile-nav').hidden=true;
 byId('shell').hidden=true;
 byId('login').hidden=false;
 byId('login-form').elements.password.value='';
 const editor=byId('editor');
 if(editor.open)editor.close();
}
function showShell(){
 byId('boot').hidden=true;
 byId('login').hidden=true;
 byId('shell').hidden=false;
 byId('restaurant-name').textContent=currentUser.restaurantName;
 byId('user-label').textContent=currentUser.name+' · '+currentUser.role;
 const isStaff=currentUser.role==='staff';
 byId('mobile-nav').hidden=false;
 closeMobileMore();
 for(const button of document.querySelectorAll('#mobile-nav [data-mobile-view],#mobile-more-panel [data-mobile-view]')){
  button.hidden=isStaff&&!['service','account'].includes(button.dataset.mobileView);
 }
 byId('mobile-more').hidden=isStaff;
 for(const button of document.querySelectorAll('#menu [data-view]')){
  button.hidden=isStaff&&!['service','account'].includes(button.dataset.view);
  if(button.dataset.view==='users')button.hidden=currentUser.role==='staff';
 }
 byId('today').textContent=new Intl.DateTimeFormat('fr-FR',{dateStyle:'long'}).format(new Date());
}
async function load(onProgress){
 const generation=sessionEpoch;
 const restaurant=currentUser?.restaurantId;
 const completed={wines:false,dishes:false};
 const mark=key=>{
  completed[key]=true;
  // These are actual completed HTTP responses, not estimated request progress.
  if(generation===sessionEpoch&&restaurant===currentUser?.restaurantId)
   onProgress?.({...completed});
 };
 const [wines,dishes]=await Promise.all([
  request('GET','/api/wines').then(data=>{mark('wines');return data;}),
  request('GET','/api/dishes').then(data=>{mark('dishes');return data;})
 ]);
 if(generation!==sessionEpoch||currentUser?.restaurantId!==restaurant||!currentUser)return false;
 store={wines:wines.wines,dishes:dishes.dishes};
 storeLoadedAt=Date.now();
 return true;
}
async function refresh(){
 const generation=sessionEpoch;
 const loaded=await load();
 if(loaded&&generation===sessionEpoch)await view(currentView,{force:true});
}
async function view(name,{fromHistory=false,replaceHistory=false,force=false}={}){
 if(!currentUser)return;
 const forbidden=currentUser.role==='staff'&&!['service','account'].includes(name);
 if(forbidden)name='service';
 // Repeated taps on the active tab should not erase its content or repeat GETs.
 // Explicit refreshes after mutations must use force=true.
 if(!force&&name===currentView&&(hasCommittedView||workspace.getAttribute('aria-busy')==='true'))return;
 if(forbidden)writeViewLocation(name,{replace:true});
 else if(!fromHistory)writeViewLocation(name,{replace:replaceHistory});
 const epoch=++viewEpoch;
 const generation=sessionEpoch;
 const previousView=currentView;
 currentView=name;
 hasCommittedView=false;
 for(const button of document.querySelectorAll('#menu [data-view]')){
  const active=button.dataset.view===name;
  button.classList.toggle('active',active);
  if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
 }
 closeMobileMore();
 for(const button of document.querySelectorAll('[data-mobile-view]')){
  const active=button.dataset.mobileView===name;
  if(active)button.setAttribute('aria-current','page');
  else button.removeAttribute('aria-current');
 }
 const moreActive=['history','stats','users'].includes(name);
 byId('mobile-more').dataset.active=String(moreActive);
 const messages={
  service:'Préparation des accords…',wines:'Ouverture de la cave…',dishes:'Chargement de la carte…',
  history:'Lecture de l’historique…',stats:'Calcul des statistiques…',
  users:'Chargement de l’équipe…',account:'Ouverture des paramètres du compte…'
 };
 const staging=document.createElement('div');
 const target=workspace;
 target.setAttribute('aria-busy','true');
 // Keep the old screen inert while the next view resolves. A fast cached view
 // will paint directly, rather than flashing a full glass loader for one frame.
 target.inert=true;
 let stopLongLoading=()=>{};
 let loaderTimer;
 const showLoader=()=>{
  if(epoch!==viewEpoch||generation!==sessionEpoch)return;
  target.replaceChildren(loadingState(messages[name]||'Chargement…'));
  stopLongLoading=watchLongLoading(target);
 };
 if(target.firstElementChild)loaderTimer=setTimeout(showLoader,120);
 else showLoader(); // First route has no previous content to preserve.
 try{
  // A staff member's menu and an owner's inventory must not rely forever on
  // an old in-memory snapshot. Avoid hidden/background polling or write retries.
  if(['service','wines','dishes'].includes(name)&&Date.now()-storeLoadedAt>STALE_CATALOG_MS){
   const loaded=await load();
   if(!loaded||generation!==sessionEpoch||epoch!==viewEpoch)return;
  }
  const mod=await moduleFor(name);
  if(epoch!==viewEpoch||generation!==sessionEpoch)return;
  if(name==='service')mod.renderService(staging,store,{role:currentUser.role,onNavigate:view});
  else if(name==='wines')mod.renderWines(staging,store,refresh);
  else if(name==='dishes')mod.renderDishes(staging,store,refresh);
  else if(name==='history')await mod.renderHistory(staging);
  else if(name==='stats')await mod.renderStats(staging);
  else if(name==='users'){
   await mod.renderUsers(staging,{canManage:currentUser.role==='owner',refresh,currentId:currentUser.id});
   if(currentUser.role==='owner')mod.addUserButton(staging,refresh);
  }else if(name==='account')await mod.renderAccount(staging,currentUser,showLogin);
  if(epoch!==viewEpoch||generation!==sessionEpoch)return;
  target.replaceChildren(...staging.childNodes);
  hasCommittedView=true;
  target.inert=false;
  if(previousView!==name)window.scrollTo(0,0);
  target.focus({preventScroll:true});
  performance.mark('easywine:view:'+name+':ready');
 }catch(error){
  if(epoch!==viewEpoch||generation!==sessionEpoch)return;
  hasCommittedView=false;
  target.replaceChildren(errorState(error?.message||'Une erreur est survenue.',()=>view(name)));
 }finally{
  clearTimeout(loaderTimer);
  stopLongLoading();
  if(epoch===viewEpoch&&generation===sessionEpoch){
   target.inert=false;
   target.setAttribute('aria-busy','false');
  }
 }
}
async function enter(user){
 rotateRequestScope();
 sessionEpoch++;
 storeLoadedAt=0;
 currentUser=user;
 // Clear any residual workspace before showing a new authenticated session.
 // In particular, a preceding account's catalogue must never flash on screen.
 workspace.replaceChildren();
 workspace.inert=false;
 hasCommittedView=false;
 const stamp=++viewEpoch;
 const generation=sessionEpoch;
 const bootNode=byId('boot');
 // Keep one coherent startup screen until the real catalogue has loaded.
 // The workspace is never shown with an empty interim snapshot.
 bootNode.hidden=false;
 byId('login').hidden=true;
 byId('shell').hidden=true;
 if(!bootNode.querySelector('.boot-content'))
  bootNode.replaceChildren(loadingState('Chargement de votre cave et de votre carte…'));
 loadingStage(bootNode,'Chargement de votre cave et de votre carte…');
 const stopLongLoading=watchLongLoading(bootNode);
 try{
  const loaded=await load(({wines,dishes})=>{
   if(stamp!==viewEpoch||generation!==sessionEpoch)return;
   if(wines&&!dishes)loadingStage(bootNode,'Cave chargée · Chargement de la carte…');
   else if(dishes&&!wines)loadingStage(bootNode,'Carte chargée · Chargement de la cave…');
  });
  if(!loaded||stamp!==viewEpoch||generation!==sessionEpoch)return;
  showShell();
  await view(viewFromHash(window.location.hash)||'service',{replaceHistory:true});
  performance.mark('easywine:app-ready');
 }catch(error){
  if(stamp!==viewEpoch||generation!==sessionEpoch)return;
  bootNode.replaceChildren(errorState(error?.message||'Chargement impossible.',()=>enter(user)));
  bootNode.hidden=false;
 }finally{
  stopLongLoading();
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
// Intent-based preloading: hover or keyboard focus starts only the necessary
// route module. Never preload anonymous or role-restricted administration code.
function prepareRoute(name){
 if(!currentUser||(currentUser.role==='staff'&&!['service','account'].includes(name)))return;
 void moduleFor(name).catch(()=>{}); // A later real navigation can retry.
}
for(const button of document.querySelectorAll('#menu [data-view]')){
 button.addEventListener('click',handle(()=>view(button.dataset.view)));
 button.addEventListener('pointerenter',event=>{
  if(event.pointerType==='mouse'||event.pointerType==='pen')prepareRoute(button.dataset.view);
 });
 button.addEventListener('focus',()=>prepareRoute(button.dataset.view));
}
for(const button of document.querySelectorAll('[data-mobile-view]')){
 button.addEventListener('click',handle(()=>view(button.dataset.mobileView)));
 button.addEventListener('focus',()=>prepareRoute(button.dataset.mobileView));
}
byId('mobile-more').addEventListener('click',()=>{
 const panel=byId('mobile-more-panel'),next=!panel.hidden;
 panel.hidden=next;
 byId('mobile-more').setAttribute('aria-expanded',String(!next));
 if(!next)panel.querySelector('button:not([hidden])')?.focus();
});
document.addEventListener('pointerdown',event=>{
 const panel=byId('mobile-more-panel');
 if(!panel.hidden&&!panel.contains(event.target)&&!byId('mobile-more').contains(event.target))
  closeMobileMore();
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&!byId('mobile-more-panel').hidden){
  closeMobileMore();byId('mobile-more').focus();event.preventDefault();
 }
});
window.addEventListener('popstate',()=>{
 if(currentUser)view(viewFromHash(window.location.hash)||'service',{fromHistory:true});
});
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
 loadingStage(bootNode,'Vérification de votre session…');
 const stopLongLoading=watchLongLoading(bootNode);
 try{
  const result=await request('GET','/api/session');
  if(!result.user){showLogin();performance.mark('easywine:login-ready');return;}
  await enter(result.user);
 }catch(error){
  const message=error?.message||'Impossible de joindre EasyWine.';
  byId('boot').replaceChildren(errorState(message,boot));
  byId('boot').hidden=false;
 }finally{
  stopLongLoading();
 }
}
boot();
