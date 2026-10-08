
import {byId,element as e,heading,empty,euro,request,notice,handle,field,choiceField,scale,withBusy} from './ui.js';

const colors=[['rouge','Rouge'],['blanc','Blanc'],['rose','Rosé'],['bulles','Bulles'],['doux','Vin doux']];
const tags=['leger','frais','mineral','aromatique','gourmand','puissant','structure','original','classique','decouverte'];
function edit(title,build,save){
 const dialog=byId('editor'),form=byId('editor-form');
 byId('editor-title').textContent=title;
 const fields=byId('editor-fields');fields.replaceChildren();
 build(fields);
 const close=()=>{if(form.dataset.saving!=='true')dialog.close();};
 form.onsubmit=handle(async event=>{
  event.preventDefault();
  if(form.dataset.saving==='true')return;
  const submit=form.querySelector('button[type=submit]');
  form.dataset.saving='true';
  dialog.setAttribute('aria-busy','true');
  try{
   await withBusy(submit,async()=>{
    const data=new FormData(form);
    const confirmation=await save(data);
    dialog.close();
    notice(typeof confirmation==='string'?confirmation:'Modifications enregistrées.');
   },'Enregistrement…');
  }finally{
   delete form.dataset.saving;
   dialog.removeAttribute('aria-busy');
  }
 });
 dialog.oncancel=event=>{if(form.dataset.saving==='true')event.preventDefault();};
 dialog.showModal();
 (fields.querySelector('input:not([disabled]),select:not([disabled]),textarea:not([disabled])')||form.querySelector('button')).focus({preventScroll:true});
 byId('close-editor').onclick=close;
 byId('cancel-editor').onclick=close;
}
function check(parent,name,caption,checked){
 const c=e('input',{name,type:'checkbox',checked});
 parent.append(e('label',{class:'checkbox-label'},c,caption));return c;
}
function box(parent){const div=e('div',{class:'form-grid'});parent.append(div);return div;}
function money(cents){return (cents/100).toFixed(2);}
function cents(value){
 if(!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim()))throw Error('Prix en euros invalide.');
 return Math.round(Number(value.replace(',','.'))*100);
}
function scaleField(grid,title,name,v){choiceField(grid,title,name,scale,v);}
export function renderWines(container,{wines},refresh){
 container.replaceChildren(heading('Ma cave','Toutes les bouteilles de votre établissement.',
   e('div',{class:'item-actions'},e('button',{type:'button',class:'button secondary',text:'Importer CSV',onClick:()=>importEditor(refresh)}),e('button',{type:'button',class:'button primary',text:'+ Ajouter un vin',onClick:()=>wineEditor(null,refresh)}))));
 const toolbar=e('div',{class:'toolbar'});
 const search=e('input',{type:'search',placeholder:'Rechercher une cuvée, un producteur…','aria-label':'Rechercher un vin'});
 const count=e('p',{class:'hint result-count',role:'status','aria-live':'polite'});
 toolbar.append(search);container.append(toolbar);
 const list=e('div',{class:'item-list'});container.append(count,list);
 let shown=80;
 function draw(){
  const term=search.value.toLocaleLowerCase('fr');
  const matches=wines.filter(w=>[w.producer,w.cuvee,w.appellation,w.vintage].join(' ').toLocaleLowerCase('fr').includes(term));
  count.textContent=matches.length+' référence(s) trouvée(s) · '+Math.min(shown,matches.length)+' affichée(s)';
  list.replaceChildren();
  if(!matches.length){list.append(empty('Aucun vin enregistré pour cette recherche.'));return;}
  for(const w of matches.slice(0,shown)){
   list.append(e('div',{class:'item-row'},
    e('div',{},e('h3',{text:[w.producer,w.cuvee,w.vintage].filter(Boolean).join(' ')}),
      e('p',{text:[w.appellation,w.color,w.region].filter(Boolean).join(' · ')})),
    e('div',{class:'item-actions'},
      e('span',{class:'price',text:euro(w.priceCents)}),
      e('span',{class:'pill',text:w.active?(w.stock>0?w.stock+' en stock':'Épuisé'):'Désactivé'}),
      e('button',{type:'button',class:'subtle-button',text:'Mouvements',onClick:handle(()=>stockEditor(w,refresh))}),
      e('button',{type:'button',class:'subtle-button',text:'Modifier',onClick:()=>wineEditor(w,refresh)}))));
  }
  if(shown<matches.length)list.append(e('button',{type:'button',class:'button secondary load-more',
   text:'Afficher les '+Math.min(80,matches.length-shown)+' références suivantes',
   onClick:()=>{shown+=80;draw();}}));
 }
 search.addEventListener('input',()=>{shown=80;draw();});draw();
}

function importEditor(refresh){
 let validatedCsv=null;
 edit('Importer une cave CSV',fields=>{
  fields.append(e('p',{class:'muted',text:'Champs requis : producer, cuvee, color, body, acidity, tannin, aromatic, price_eur, stock. Séparateur point-virgule ou virgule.'}));
  const file=e('input',{type:'file',accept:'.csv,text/csv'});
  const preview=e('div',{class:'hint',text:'Sélectionnez votre CSV pour vérifier les références.'});
  fields.append(e('label',{},'Fichier CSV',file),preview);
  file.addEventListener('change',handle(async()=>{
   validatedCsv=null;
   const selected=file.files[0];
   if(!selected)return;
   if(selected.size>130000)throw Error('CSV limité à 130 Ko.');
   const source=await selected.text();
   const summary=await request('POST','/api/import/wines/preview',{csv:source});
   preview.replaceChildren(e('p',{text:summary.valid+' références valides sur '+summary.total+'.'}));
   for(const item of summary.sample)preview.append(e('p',{text:item.producer+' · '+item.cuvee+' · '+euro(item.priceCents)}));
   for(const issue of summary.errors.slice(0,10))preview.append(e('p',{class:'danger',text:'Ligne '+issue.line+' : '+issue.error}));
   if(summary.errors.length>10)preview.append(e('p',{text:(summary.errors.length-10)+' erreurs supplémentaires.'}));
   if(summary.canImport)validatedCsv=source;
  }));
 },async()=>{
  if(!validatedCsv)throw Error('Vérifiez le CSV avant import.');
  const result=await request('POST','/api/import/wines/commit',{csv:validatedCsv});
  await refresh();
  return result.imported+' références importées.';
 });
}


async function stockEditor(w,refresh){
 const result=await request('GET','/api/wines/'+w.id+'/stock-movements');
 const requestKey=crypto.randomUUID(); // Kept stable across retries of the same form
 edit('Mouvements · '+w.producer+' '+w.cuvee,fields=>{
  fields.append(e('p',{class:'muted',text:'Stock actuel : '+w.stock+
    ' bouteille(s). Une sortie est saisie avec un nombre négatif. Cette opération ne confirme pas une vente POS.'}));
  const grid=box(fields);
  const variation=field(grid,'Variation (+ ou −)','delta','','number',true);
  variation.step='1';variation.min='-1000000';variation.max='1000000';
  choiceField(grid,'Motif','reason',[
   ['restock','Réapprovisionnement'],['consumption','Consommation confirmée'],
   ['loss','Casse / perte'],['correction','Correction d’inventaire']
  ],'restock');
  const forecast=e('p',{class:'hint',text:'Indiquez la variation pour voir le stock après mouvement.'});
  variation.addEventListener('input',()=>{
   const v=Number(variation.value);
   forecast.textContent=variation.value&&Number.isSafeInteger(v)?
     'Stock après mouvement : '+(w.stock+v)+' bouteille(s)':'Indiquez une variation entière.';
  });
  fields.append(forecast);
  field(fields,'Justification à conserver dans l’historique','note','','text',true);
  fields.append(e('h3',{text:'Historique des mouvements'}));
  if(!result.movements.length)fields.append(empty('Aucun mouvement enregistré.'));
  const history=e('div',{class:'stock-movement-list'});
  for(const item of result.movements.slice(0,30)){
   const amount=(item.delta>0?'+':'')+item.delta;
   history.append(e('div',{class:'stock-movement-row'},
    e('strong',{text:amount+' · '+item.reason+' · '+item.afterStock+' en stock'}),
    e('p',{class:'hint',text:item.note+' · '+(item.actor||'Migration')+' · '+
      new Date(item.at).toLocaleString('fr-FR')})
   ));
  }
  fields.append(history);
 },async form=>{
  const delta=Number(form.get('delta'));
  if(!Number.isSafeInteger(delta)||delta===0)throw Error('Variation entière non nulle requise.');
  if(w.stock+delta<0||w.stock+delta>1000000)
   throw Error('Le stock ne peut pas être négatif ou dépasser un million.');
  const response=await request('POST','/api/wines/'+w.id+'/stock-movements',{
   delta,reason:form.get('reason'),note:form.get('note'),
   expectedVersion:w.version,requestKey
  });
  await refresh();
  return response.alreadyApplied?'Mouvement déjà enregistré.':'Mouvement enregistré avec succès.';
 });
}

function wineEditor(w,refresh){
 edit(w?'Modifier le vin':'Ajouter un vin',fields=>{
  const grid=box(fields);
  field(grid,'Producteur','producer',w?.producer,'text',true);
  field(grid,'Cuvée','cuvee',w?.cuvee,'text',true);
  field(grid,'Appellation','appellation',w?.appellation);
  field(grid,'Millésime','vintage',w?.vintage);
  field(grid,'Région','region',w?.region);
  field(grid,'Cépages','grapes',w?.grapes);
  choiceField(grid,'Couleur','color',colors,w?.color||'rouge');
  field(grid,'Prix de vente (€)','price',w?money(w.priceCents):'0.00','text',true);
  const stock=field(grid,'Stock (bouteilles)','stock',w?.stock??0,'number',true);stock.min='0';stock.step='1';
  if(w){stock.disabled=true;stock.title='Utilisez « Mouvements » pour modifier et historiser le stock.';}
  for(const key of ['body','acidity','tannin','aromatic']){
   scaleField(grid,({body:'Corps',acidity:'Acidité',tannin:'Tanins',aromatic:'Expression aromatique'})[key],key,w?.[key]??3);
  }
  field(grid,'Tags (séparés par des virgules)','tags',(w?.tags||[]).join(', '));
  check(fields,'byGlass','Disponible au verre',w?.byGlass??false);
  check(fields,'active','Référence active',w?.active??true);
 },async form=>{
  const value=name=>String(form.get(name)||'');
  const parsedTags=value('tags').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(parsedTags.some(t=>!tags.includes(t)))throw Error('Tags autorisés : '+tags.join(', '));
  const payload={
   producer:value('producer'),cuvee:value('cuvee'),appellation:value('appellation'),
   vintage:value('vintage'),region:value('region'),grapes:value('grapes'),
   color:value('color'),priceCents:cents(value('price')),stock:w?w.stock:Number(value('stock')),
   body:Number(value('body')),acidity:Number(value('acidity')),
   tannin:Number(value('tannin')),aromatic:Number(value('aromatic')),
   tags:[...new Set(parsedTags)],byGlass:form.has('byGlass'),active:form.has('active')
  };
  if(w)payload.expectedVersion=w.version;
  await request(w?'PATCH':'POST',w?'/api/wines/'+w.id:'/api/wines',payload);
  await refresh();
 });
}
export function renderDishes(container,{dishes,wines},refresh){
 container.replaceChildren(heading('Ma carte','Décrivez vos plats, conservez vos accords signatures.',
  e('button',{type:'button',class:'button primary',text:'+ Ajouter un plat',onClick:()=>dishEditor(null,refresh)})));
 const list=e('div',{class:'item-list'});container.append(list);
 if(!dishes.length){list.append(empty('La carte est vide. Créez un premier plat.'));return;}
 for(const d of dishes){
  const classic=wines.find(w=>w.id===d.classicWineId);
  const actions=e('div',{class:'item-actions'},
   e('span',{class:'pill',text:d.active?'Actif':'Inactif'}),
   e('button',{type:'button',class:'subtle-button',text:'Accord classique',onClick:()=>classicEditor(d,wines,refresh)}),
   e('button',{type:'button',class:'subtle-button',text:'Exclusions',onClick:handle(()=>blocksEditor(d,wines,refresh))}),
   e('button',{type:'button',class:'subtle-button',text:'Modifier',onClick:()=>dishEditor(d,refresh)}));
  list.append(e('article',{class:'item-row'},
    e('div',{},e('h3',{text:d.name}),e('p',{text:d.description||'Aucune description'}),
      e('p',{class:'hint',text:classic?'Accord classique : '+classic.producer+' '+classic.cuvee:'Aucun accord classique défini'})),
    actions));
 }
}

async function blocksEditor(d,wines,refresh){
 const existing=await request('GET','/api/dishes/'+d.id+'/blocks');
 edit('Exclusions · '+d.name,fields=>{
  fields.append(e('p',{class:'muted',text:'Les vins cochés ne seront jamais suggérés pour ce plat, y compris s’ils sont en stock. L’accord de référence reste mémorisé.'}));
  if(!wines.length)fields.append(empty('Aucun vin disponible.'));
  const list=e('div',{class:'item-list'});
  for(const wine of wines){
   list.append(e('label',{class:'checkbox-label'},
    e('input',{type:'checkbox',name:'blockedWineIds',value:wine.id,checked:existing.wineIds.includes(wine.id)}),
    [wine.producer,wine.cuvee,wine.vintage].filter(Boolean).join(' ')));
  }
  fields.append(list);
 },async form=>{
  await request('PUT','/api/dishes/'+d.id+'/blocks',{
   wineIds:form.getAll('blockedWineIds'),expectedVersion:existing.version
  });
  await refresh();
 });
}

function dishEditor(d,refresh){
 edit(d?'Modifier le plat':'Ajouter un plat',fields=>{
  const grid=box(fields);
  field(grid,'Nom du plat','name',d?.name,'text',true);
  field(grid,'Description','description',d?.description);
  for(const key of ['intensity','richness','acidity','aromatic','spice']){
   scaleField(grid,({intensity:'Intensité',richness:'Richesse / gras',acidity:'Acidité',
     aromatic:'Expression aromatique',spice:'Épices'})[key],key,d?.[key]??3);
  }
  check(fields,'active','Plat actif',d?.active??true);
 },async form=>{
  const value=name=>String(form.get(name)||'');
  const payload={
   name:value('name'),description:value('description'),
   intensity:Number(value('intensity')),richness:Number(value('richness')),
   acidity:Number(value('acidity')),aromatic:Number(value('aromatic')),
   spice:Number(value('spice')),active:form.has('active')
  };
  if(d)payload.expectedVersion=d.version;
  await request(d?'PATCH':'POST',d?'/api/dishes/'+d.id:'/api/dishes',payload);
  await refresh();
 });
}
function classicEditor(d,wines,refresh){
 edit('Accord classique · '+d.name,fields=>{
  const options=[['','Aucun accord défini'],...wines.map(w=>[w.id,[w.producer,w.cuvee,w.vintage].filter(Boolean).join(' ')])];
  fields.append(e('p',{class:'muted',text:'Cet accord restera mémorisé même lorsque le vin est épuisé. Chaque modification est historisée.'}));
  fields.append(e('label',{},'Vin de référence',(()=>{
   const selection=e('select',{name:'wineId'});
   for(const [id,title] of options)selection.append(e('option',{value:id,text:title}));
   selection.value=d.classicWineId||'';return selection;
  })()));
 },async form=>{
  await request('PUT','/api/dishes/'+d.id+'/classic',{
   wineId:form.get('wineId')||null,expectedVersion:d.version
  });
  await refresh();
 });
}
export async function renderHistory(container){
 container.replaceChildren(heading('Historique','Les changements réalisés dans votre établissement.'));
 const {events}=await request('GET','/api/audit');
 if(!events.length){container.append(empty('Aucune modification enregistrée.'));return;}
 const list=e('div',{class:'timeline'});container.append(list);
 for(const ev of events){
  list.append(e('div',{class:'timeline-item'},
   e('strong',{text:ev.action+' · '+ev.objectType}),
   e('p',{class:'hint',text:ev.actor+' · '+new Date(ev.at).toLocaleString('fr-FR')}),
   e('p',{text:ev.objectId})));
 }
}

export async function renderUsers(container,{canManage=false,refresh,currentId}={}){
 container.replaceChildren(heading('Mon équipe','Les personnes autorisées à utiliser EasyWine.'));
 const {users}=await request('GET','/api/users');
 const list=e('div',{class:'item-list'});container.append(list);
 for(const member of users){
  const actions=e('div',{class:'item-actions'},e('span',{class:'pill',text:member.role+(member.active?'':' · inactif')}));
  if(canManage&&member.id!==currentId&&member.role!=='owner'){
   actions.append(
    e('button',{type:'button',class:'subtle-button',text:member.active?'Désactiver':'Réactiver',
      onClick:()=>edit((member.active?'Désactiver':'Réactiver')+' · '+member.name,fields=>{
       fields.append(e('p',{class:'muted',text:member.active?
        'La désactivation retire immédiatement les accès et révoque toutes les sessions de cette personne.':
        'Le compte sera réactivé, sans rétablir ses anciennes sessions.'}));
      },async()=>{
       await request('PATCH','/api/users/'+member.id,{active:!member.active});await refresh();
      })}),
    e('button',{type:'button',class:'subtle-button',text:'Réinitialiser le mot de passe',
      onClick:()=>edit('Nouveau mot de passe · '+member.name,fields=>{
       field(box(fields),'Nouveau mot de passe (12 caractères minimum)','password','','password',true);
       fields.append(e('p',{class:'hint',text:'Toutes les sessions de cette personne seront révoquées. Communiquez le mot de passe par un canal sûr.'}));
      },async form=>{
       await request('POST','/api/users/'+member.id+'/password',{password:form.get('password')});
       await refresh();
      })})
   );
  }
  list.append(e('div',{class:'item-row'},e('div',{},
   e('h3',{text:member.name}),e('p',{text:member.email})),actions));
 }
}
export function addUserButton(container,refresh){
 const header=container.querySelector('.page-header');
 if(!header)return;
 header.append(e('button',{type:'button',class:'button primary',text:'+ Ajouter un membre',onClick:()=>edit('Ajouter un membre',fields=>{
  const grid=box(fields);
  field(grid,'Nom','name','','text',true);field(grid,'E-mail','email','','email',true);
  choiceField(grid,'Rôle','role',[['staff','Service'],['manager','Responsable']],'staff');
  field(grid,'Mot de passe initial (12 caractères minimum)','password','','password',true);
 },async form=>{
  await request('POST','/api/users',{
   name:form.get('name'),email:form.get('email'),role:form.get('role'),password:form.get('password')
  });
  await refresh();
 })}));
}
