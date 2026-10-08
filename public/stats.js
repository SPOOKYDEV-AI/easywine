
import {element as e,heading,euro,request,empty} from './ui.js';

export async function renderStats(container){
 container.replaceChildren(heading('Statistiques du service',
   'Les propositions calculées et les choix explicitement enregistrés par l’équipe.'));
 const {wines,totals,disclaimer}=await request('GET','/api/stats');
 const summary=e('div',{class:'stats-grid'},
  metric('Propositions calculées',totals.generated),
  metric('Vins choisis',totals.chosen),
  metric('Part des propositions choisies',totals.generated?Math.round(100*totals.chosen/totals.generated)+' %':'—'));
 container.append(summary,e('p',{class:'hint',text:disclaimer}));
 const panel=e('section',{class:'panel'},e('h2',{text:'Par référence'}));
 if(!wines.length||totals.generated===0){
  panel.append(empty('Aucune recommandation enregistrée. Les statistiques apparaîtront après les premiers services.'));
 }else{
  const list=e('div',{class:'item-list'});
  for(const wine of wines.filter(w=>w.generated>0||w.chosen>0)){
   list.append(e('article',{class:'item-row'},
    e('div',{},e('h3',{text:[wine.producer,wine.cuvee,wine.vintage].filter(Boolean).join(' ')}),
      e('p',{text:euro(wine.price_cents)})),
    e('div',{class:'item-actions'},
      e('span',{class:'pill',text:'Calculées · '+wine.generated}),
      e('span',{class:'pill',text:'Choisies · '+wine.chosen}))));
  }
  panel.append(list);
 }
 container.append(panel);
}
function metric(title,value){
 return e('div',{class:'panel stat-tile'},e('div',{class:'small-label',text:title}),
  e('strong',{text:String(value)}));
}
