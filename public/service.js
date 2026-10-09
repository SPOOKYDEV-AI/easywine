
import {element as e,heading,select,request,euro,empty,handle,loadingState,errorState,withBusy,notice,wineGlass} from './ui.js';

const styles=[
 ['leger','Léger'],['frais','Frais'],['mineral','Minéral'],['aromatique','Aromatique'],
 ['gourmand','Gourmand'],['puissant','Puissant'],['structure','Structuré'],
 ['original','Original'],['classique','Classique'],['decouverte','Découverte']
];
const colors=[['','Libre'],['rouge','Rouge'],['blanc','Blanc'],['rose','Rosé'],['bulles','Bulles'],['doux','Vin doux']];
const budgets=[
 ['none','Pas de tranche budgétaire',null,null],
 ['low','Moins de 50 €',0,4999],
 ['mid','50 – 80 €',5000,8000],
 ['high','80 – 120 €',8000,12000],
 ['upper','120 – 200 €',12000,20000],
 ['premium','200 € et +',20000,null]
];
const preferences={dishId:null,styles:new Set(),color:'',budget:'none'};
export function resetServicePreferences(){
 preferences.dishId=null;
 preferences.styles.clear();
 preferences.color='';
 preferences.budget='none';
}
function pills(group,items,selected,onSelect,onChanged){
 const wrap=e('div',{class:'chip-wrap'});
 for(const [value,title] of items){
  const button=e('button',{type:'button',class:'chip'+(selected(value)?' selected':''),
    'aria-pressed':String(selected(value)),text:title,
    onClick:()=>{onSelect(value);onChanged();for(const b of wrap.children){
      const isActive=selected(b.dataset.value);
      b.classList.toggle('selected',isActive);b.setAttribute('aria-pressed',String(isActive));
    }}});
  button.dataset.value=value;wrap.append(button);
 }
 return e('div',{class:'filter-group'},group?e('p',{class:'filter-name',text:group}):null,wrap);
}
function recommendationPrompt(changed=false){
 return e('div',{class:'results-placeholder'},
  e('div',{class:'placeholder-icon','aria-hidden':'true',text:'✧'}),
  e('h2',{text:changed?'Vos critères ont changé.':'Laissez parler votre cave.'}),
  e('p',{text:changed
   ?'Relancez la recherche pour obtenir des accords correspondant à votre nouvelle sélection.'
   :'Sélectionnez un plat et les préférences du client pour obtenir vos accords.'}));
}
function card(entry,classic=false,sessionId=null){
 const w=entry.wine;
 const title=[w.producer,w.cuvee,w.vintage].filter(Boolean).join(' ');
 const status=classic?'Accord de référence du restaurant':'Proposition '+entry.rank+' · indice '+entry.score+'/100';
 const top=e('div',{class:'result-top'},
   e('div',{},e('div',{class:'status',text:status}),e('h3',{text:title}),
     e('div',{class:'hint',text:[w.appellation,w.region,w.color].filter(Boolean).join(' · ')})),
   e('span',{class:'price',text:euro(w.priceCents)}));
 const article=e('article',{class:'result-card'+(classic?' classic':'')},top);
 if(classic){
  article.append(e('p',{class:entry.available?'hint':'danger',
    text:entry.blocked?'Exclu pour ce plat par le restaurateur. Accord conservé mais non proposable.':(entry.available?'Disponible dans votre cave':"Indisponible : l'accord de référence est conservé, mais ne peut pas être proposé.")}));
 }else{
  article.append(e('p',{text:entry.reason}),
    e('p',{class:'small-label',text:'À DIRE AU CLIENT'}),
    e('p',{class:'pitch',text:'« '+entry.pitch+' »'}),
    e('details',{},e('summary',{text:'En savoir plus sur cet accord'}),
      e('p',{text:entry.detail})));
 }

 if(sessionId&&(!classic||entry.available)){
  const choose=e('button',{type:'button',class:'button secondary choice-button',text:'Le client a choisi ce vin'});
  const feedback=e('span',{class:'hint'});
  choose.addEventListener('click',handle(async()=>{
   if(choose.disabled)return;
   choose.disabled=true;
   choose.setAttribute('aria-busy','true');
   choose.replaceChildren(wineGlass('mini'),' Enregistrement…');
   try{
    await request('POST','/api/service/choice',{sessionId,wineId:w.id});
    const parent=article.parentElement;
    if(parent)for(const button of parent.querySelectorAll('.choice-button')){
     button.disabled=true;
     button.removeAttribute('aria-busy');
    }
    choose.replaceChildren(document.createTextNode('✓ Choix enregistré'));
    feedback.textContent='Stock inchangé : ajustez-le dans « Ma cave » après la vente.';
    notice('Choix du client enregistré. Stock inchangé.',{type:'success'});
   }catch(error){
    choose.disabled=false;
    choose.removeAttribute('aria-busy');
    choose.replaceChildren(document.createTextNode('Le client a choisi ce vin'));
    throw error;
   }
  }));
  article.append(choose,feedback);
 }
 return article;
}
export function renderService(container,{dishes,wines},{role='staff',onNavigate=()=>{}}={}){
 const active=dishes.filter(d=>d.active);
 const canManage=role==='owner'||role==='manager';
 const headingEl=heading('Le bon accord, simplement.','Le savoir-faire de votre restaurant, adapté aux envies du client.');
 const layout=e('div',{class:'service-grid'});
 const left=e('section',{class:'panel'}),right=e('section',{class:'panel results'});
 layout.append(left,right);container.replaceChildren(headingEl,layout);
 if(!active.length){
  left.append(e('div',{class:'onboarding'},
   e('div',{class:'onboarding-mark','aria-hidden':'true',text:'✧'}),
   e('h2',{text:'Préparons votre premier service'}),
   e('p',{text:canManage
    ?'Commencez par créer un plat. Ajoutez ensuite les vins réellement disponibles en cave pour obtenir des accords.'
    :'La carte n’a pas encore de plat actif. Demandez à votre responsable de préparer le catalogue.'}),
   canManage?e('button',{type:'button',class:'button primary',
    text:'Créer mon premier plat →',onClick:()=>onNavigate('dishes')}):null));
  right.append(e('div',{class:'results-placeholder'},
   e('div',{class:'placeholder-icon',text:'✧'}),
   e('h2',{text:'Vos conseils arriveront ici'}),
   e('p',{text:'Une carte active et une cave renseignée suffisent pour commencer.'})));
  return;
 }
 if(!wines.some(w=>w.active&&w.stock>0)){
  const alert=e('div',{class:'onboarding-hint',role:'status'},
   e('p',{text:'Votre cave ne contient actuellement aucune bouteille active disponible.'}),
   canManage?e('button',{type:'button',class:'subtle-button',
     text:'Renseigner ma cave →',onClick:()=>onNavigate('wines')}):
     e('p',{class:'hint',text:'Contactez votre responsable pour mettre les stocks à jour.'}));
  left.append(alert);
 }
 const chosenStyles=preferences.styles;
 let criteriaVersion=0;
 let pendingRecommendation=null;
 let recommendationKey=null;
 function criteriaChanged(){
  criteriaVersion++;
  // A waiter can change the dish while the tablet's Wi-Fi is slow. Unblock
  // a fresh search immediately instead of holding the CTA for 15 seconds.
  pendingRecommendation?.abort();
  recommendationKey=null;
  right.setAttribute('aria-busy','false');
  right.replaceChildren(recommendationPrompt(true));
 }
 left.append(e('h3',{class:'step-heading'},e('span',{class:'step',text:'01'}),'Choisir le plat'));
 const dishSelect=select('dish',active.map(d=>[d.id,d.name]),preferences.dishId);
 if(!active.some(d=>d.id===dishSelect.value))preferences.dishId=dishSelect.value;
 dishSelect.addEventListener('change',()=>{preferences.dishId=dishSelect.value;criteriaChanged();});
 dishSelect.setAttribute('aria-label','Plat du client');left.append(dishSelect);

 left.append(pills('02 · Les envies du client',styles.slice(0,6),
   x=>chosenStyles.has(x),x=>{if(chosenStyles.has(x))chosenStyles.delete(x);else chosenStyles.add(x);},criteriaChanged));

 const advanced=e('details',{class:'optional-filters'},
  e('summary',{text:'Personnaliser davantage'}),
  pills('Autres styles',styles.slice(6),
    x=>chosenStyles.has(x),x=>{if(chosenStyles.has(x))chosenStyles.delete(x);else chosenStyles.add(x);},criteriaChanged),
  pills('Couleur / type de vin',colors,x=>x===preferences.color,x=>{preferences.color=x;},criteriaChanged),
  pills('Budget éventuel',budgets,x=>x===preferences.budget,x=>{preferences.budget=x;},criteriaChanged));
 left.append(advanced);
 const submit=e('button',{type:'button',class:'button primary service-submit',text:'Trouver les meilleurs accords →'});
 left.append(submit);
 right.append(recommendationPrompt());
 submit.addEventListener('click',handle(async()=>{
  await withBusy(submit,async()=>{
   const submittedVersion=criteriaVersion;
   right.setAttribute('aria-busy','true');
   right.replaceChildren(loadingState('Recherche des vins réellement disponibles…'));
   const budget=budgets.find(b=>b[0]===preferences.budget);
   const controller=new AbortController();
   pendingRecommendation=controller;
   recommendationKey??=crypto.randomUUID();
   const intentKey=recommendationKey;
   let data;
   try{
    data=await request('POST','/api/recommend',{
     dishId:dishSelect.value,styles:[...chosenStyles],color:preferences.color||null,
     minPriceCents:budget[2],maxPriceCents:budget[3],requestKey:intentKey
    },{signal:controller.signal});
   }catch(error){
    if(!controller.signal.aborted&&submittedVersion===criteriaVersion&&right.isConnected)
     right.replaceChildren(errorState(error?.message||'Erreur de recommandation.',()=>submit.click()));
    return;
   }finally{
    if(pendingRecommendation===controller)pendingRecommendation=null;
   }
   // A delayed response belongs to the submitted criteria, not later edits.
   // Never display it under a new selection or in a detached route.
   if(submittedVersion!==criteriaVersion||!right.isConnected)return;
   // A separate search after successfully rendering becomes a new intent.
   if(recommendationKey===intentKey)recommendationKey=null;
   const section=e('div',{},e('h2',{text:'Vos accords'}),
    e('p',{class:'result-confirmation',role:'status',
     text:data.recommendations.length+' suggestion(s) vérifiée(s) dans votre cave.'}));
   if(data.classic){
    section.append(e('p',{class:'small-label',text:'L’ACCORD CLASSIQUE'}),card(data.classic,true,data.sessionId));
   }
   section.append(e('p',{class:'small-label',text:'SÉLECTION POUR CE CLIENT'}));
   if(data.recommendations.length){
    for(const recommendation of data.recommendations)section.append(card(recommendation,false,data.sessionId));
   }else{
    section.append(empty('Aucun vin disponible ne respecte ces critères. Élargissez le budget ou la couleur.'));
   }
   section.append(e('p',{class:'hint',text:data.explanation}));
   right.replaceChildren(section);
   if(window.matchMedia('(max-width:1020px)').matches)
    right.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'start'});
  },'Recherche dans la cave…');
  right.setAttribute('aria-busy','false');
 }));
}
