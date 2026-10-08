
import {byId,element as e,heading,empty,euro,request,notice,handle,field,choiceField,scale} from './ui.js';

const colors=[['rouge','Rouge'],['blanc','Blanc'],['rose','Rosé'],['bulles','Bulles'],['doux','Vin doux']];
const tags=['leger','frais','mineral','aromatique','gourmand','puissant','structure','original','classique','decouverte'];
function edit(title,build,save){
 const dialog=byId('editor'),form=byId('editor-form');
 byId('editor-title').textContent=title;
 const fields=byId('editor-fields');fields.replaceChildren();
 build(fields);
 form.onsubmit=handle(async event=>{
  event.preventDefault();
  const data=new FormData(form);
  await save(data);
  dialog.close();notice('Modifications enregistrées.');
 });
 dialog.showModal();
 byId('close-editor').onclick=()=>dialog.close();
 byId('cancel-editor').onclick=()=>dialog.close();
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
 toolbar.append(search);container.append(toolbar);
 const list=e('div',{class:'item-list'});container.append(list);
 function draw(){
  const term=search.value.toLocaleLowerCase('fr');
  const matches=wines.filter(w=>[w.producer,w.cuvee,w.appellation,w.vintage].join(' ').toLocaleLowerCase('fr').includes(term));
  list.replaceChildren();
  if(!matches.length){list.append(empty('Aucun vin enregistré pour cette recherche.'));return;}
  for(const w of matches){
   list.append(e('div',{class:'item-row'},
    e('div',{},e('h3',{text:[w.producer,w.cuvee,w.vintage].filter(Boolean).join(' ')}),
      e('p',{text:[w.appellation,w.color,w.region].filter(Boolean).join(' · ')})),
    e('div',{class:'item-actions'},
      e('span',{class:'price',text:euro(w.priceCents)}),
      e('span',{class:'pill',text:w.active?(w.stock>0?w.stock+' en stock':'Épuisé'):'Désactivé'}),
      e('button',{type:'button',class:'subtle-button',text:'Modifier',onClick:()=>wineEditor(w,refresh)}))));
  }
 }
 search.addEventListener('input',draw);draw();
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
  notice(result.imported+' références importées.');
  await refresh();
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
   color:value('color'),priceCents:cents(value('price')),stock:Number(value('stock')),
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
   e('button',{type:'button',class:'subtle-button',text:'Modifier',onClick:()=>dishEditor(d,refresh)}));
  list.append(e('article',{class:'item-row'},
    e('div',{},e('h3',{text:d.name}),e('p',{text:d.description||'Aucune description'}),
      e('p',{class:'hint',text:classic?'Accord classique : '+classic.producer+' '+classic.cuvee:'Aucun accord classique défini'})),
    actions));
 }
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
export async function renderUsers(container){
 container.replaceChildren(heading('Mon équipe','Les personnes autorisées à utiliser EasyWine.'));
 const {users}=await request('GET','/api/users');
 const list=e('div',{class:'item-list'});container.append(list);
 for(const user of users)list.append(e('div',{class:'item-row'},e('div',{},
  e('h3',{text:user.name}),e('p',{text:user.email})),
  e('span',{class:'pill',text:user.role+(user.active?'':' · inactif')})));
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
