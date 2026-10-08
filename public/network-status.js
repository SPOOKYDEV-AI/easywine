// Connection state is advisory: navigator.onLine does NOT guarantee API access.
// No automatic retries of writes or mutations are ever performed here.
const panel=document.getElementById('network-status');
const label=document.getElementById('network-status-text');
const retry=document.getElementById('network-retry');
let failureSeen=false;

function show(text){
 label.textContent=text;
 panel.hidden=false;
}
function clear(){
 if(!navigator.onLine)return;
 failureSeen=false;
 panel.hidden=true;
}
window.addEventListener('offline',()=>{
 failureSeen=true;
 show('Réseau indisponible. Les modifications ne seront pas synchronisées automatiquement.');
});
window.addEventListener('online',()=>{
 if(failureSeen)show('Le réseau semble rétabli. Vérifiez l’accès au serveur avant de reprendre.');
});
window.addEventListener('easywine:network-failed',()=>{
 failureSeen=true;
 show(navigator.onLine
  ?'EasyWine ne répond pas. Vérifiez la connexion au serveur.'
  :'Réseau indisponible. Vérifiez votre connexion.');
});
window.addEventListener('easywine:network-ok',clear);
retry.addEventListener('click',async()=>{
 if(retry.disabled)return;
 retry.disabled=true;
 const previous=retry.textContent;
 retry.textContent='Vérification…';
 try{
  const response=await fetch('/api/session',{method:'GET',credentials:'same-origin',
   cache:'no-store',signal:AbortSignal.timeout(7000)});
  // Any HTTP response proves reachability; no mutation and no session disclosure.
  if(!response.ok)throw Error('Serveur indisponible.');
  failureSeen=false;
  panel.hidden=true;
 }catch{
  failureSeen=true;
  show('Impossible de joindre EasyWine. Réessayez lorsque le réseau sera stable.');
 }finally{
  retry.disabled=false;
  retry.textContent=previous;
 }
});
if(!navigator.onLine){
 failureSeen=true;
 show('Réseau indisponible. Vérifiez votre connexion.');
}
