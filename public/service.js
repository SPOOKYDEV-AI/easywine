
import {element as e,heading,select,request,euro,empty,handle} from './ui.js';

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
function pills(group,items,selected,onSelect){
 const wrap=e('div',{class:'chip-wrap'});
 for(const [value,title] of items){
  const button=e('button',{type:'button',class:'chip'+(selected(value)?' selected':''),
    'aria-pressed':String(selected(value)),text:title,
    onClick:()=>{onSelect(value);for(const b of wrap.children){
      const isActive=selected(b.dataset.value);
      b.classList.toggle('selected',isActive);b.setAttribute('aria-pressed',String(isActive));
    }}});
  button.dataset.value=value;wrap.append(button);
 }
 return e('div',{class:'filter-group'},e('p',{class:'filter-name',text:group}),wrap);
}
function card(entry,classic=false){
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
    text:entry.available?'Disponible dans votre cave':"Indisponible : l'accord de référence est conservé, mais ne peut pas être proposé."}));
 }else{
  article.append(e('p',{text:entry.reason}),
    e('p',{class:'small-label',text:'À DIRE AU CLIENT'}),
    e('p',{class:'pitch',text:'« '+entry.pitch+' »'}),
    e('details',{},e('summary',{text:'En savoir plus sur cet accord'}),
      e('p',{text:entry.detail})));
 }
 return article;
}
export function renderService(container,{dishes}){
 const active=dishes.filter(d=>d.active);
 const headingEl=heading('Le bon accord, simplement.','Le savoir-faire de votre restaurant, adapté aux envies du client.');
 const layout=e('div',{class:'service-grid'});
 const left=e('section',{class:'panel'}),right=e('section',{class:'panel results'});
 layout.append(left,right);container.replaceChildren(headingEl,layout);
 if(!active.length){
  left.append(empty('Aucun plat actif. Ajoutez des plats depuis « Ma carte ».'));
  right.append(empty('Les recommandations s’afficheront ici.'));return;
 }
 const chosenStyles=new Set();let chosenColor='',chosenBudget='none';
 left.append(e('h3',{class:'step-heading'},e('span',{class:'step',text:'01'}),'Choisir le plat'));
 const dishSelect=select('dish',active.map(d=>[d.id,d.name]));
 dishSelect.setAttribute('aria-label','Plat du client');left.append(dishSelect);
 left.append(pills('02 · Les envies du client',styles,x=>chosenStyles.has(x),x=>{
   if(chosenStyles.has(x))chosenStyles.delete(x);else chosenStyles.add(x);
 }));
 left.append(pills('03 · Couleur / type de vin',colors,x=>x===chosenColor,x=>{chosenColor=x;}));
 left.append(pills('04 · Budget éventuel',budgets,x=>x===chosenBudget,x=>{chosenBudget=x;}));
 const submit=e('button',{type:'button',class:'button primary service-submit',text:'Trouver les meilleurs accords →'});
 left.append(submit);
 right.append(e('div',{class:'results-placeholder'},e('div',{class:'placeholder-icon',text:'✧'}),
  e('h2',{text:'Laissez parler votre cave.'}),e('p',{text:'Sélectionnez un plat et les préférences du client pour obtenir vos accords.'})));
 submit.addEventListener('click',handle(async()=>{
  submit.disabled=true;submit.textContent='Recherche dans la cave…';
  try{
   const budget=budgets.find(b=>b[0]===chosenBudget);
   const data=await request('POST','/api/recommend',{
    dishId:dishSelect.value,styles:[...chosenStyles],color:chosenColor||null,
    minPriceCents:budget[2],maxPriceCents:budget[3]
   });
   const section=e('div',{},e('h2',{text:'Vos accords'}));
   if(data.classic){
    section.append(e('p',{class:'small-label',text:'L’ACCORD CLASSIQUE'}),card(data.classic,true));
   }
   section.append(e('p',{class:'small-label',text:'SÉLECTION POUR CE CLIENT'}));
   if(data.recommendations.length){
    for(const recommendation of data.recommendations)section.append(card(recommendation));
   }else{
    section.append(empty('Aucun vin disponible ne respecte ces critères. Élargissez le budget ou la couleur.'));
   }
   section.append(e('p',{class:'hint',text:data.explanation}));
   right.replaceChildren(section);
  }finally{submit.disabled=false;submit.textContent='Trouver les meilleurs accords →';}
 }));
}
