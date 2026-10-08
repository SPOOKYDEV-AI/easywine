
import {element as e,heading,euro,request,empty} from './ui.js';

export async function renderStats(container){
 container.replaceChildren(heading('Statistiques du service',
   'Les recommandations affichées et les choix explicitement enregistrés par l’équipe.'));
 const {wines,totals,disclaimer}=await request('GET','/api/stats');
 const summary=e('div',{class:'stats-grid'},
  metric('Propositions affichées',totals.shown),
  metric('Vins choisis',totals.chosen),
  metric('Taux de sélection',totals.shown?Math.round(100*totals.chosen/totals.shown)+' %':'—'));
 container.append(summary,e('p',{class:'hint',text:disclaimer}));
 const panel=e('section',{class:'panel'},e('h2',{text:'Par référence'}));
 if(!wines.length||totals.shown===0){
  panel.append(empty('Aucune recommandation enregistrée. Les statistiques apparaîtront après les premiers services.'));
 }else{
  const list=e('div',{class:'item-list'});
  for(const wine of wines.filter(w=>w.shown>0||w.chosen>0)){
   list.append(e('article',{class:'item-row'},
    e('div',{},e('h3',{text:[wine.producer,wine.cuvee,wine.vintage].filter(Boolean).join(' ')}),
      e('p',{text:euro(wine.price_cents)})),
    e('div',{class:'item-actions'},
      e('span',{class:'pill',text:wine.shown+' affichage(s)'}),
      e('span',{class:'pill',text:wine.chosen+' choix'}))));
  }
  panel.append(list);
 }
 container.append(panel);
}
function metric(title,value){
 return e('div',{class:'panel stat-tile'},e('div',{class:'small-label',text:title}),
  e('strong',{text:String(value)}));
}
