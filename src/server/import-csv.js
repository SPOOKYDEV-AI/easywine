
import {wineInput,fail} from './validation.js';

const required=['producer','cuvee','color','body','acidity','tannin','aromatic','price_eur','stock'];
const textValue=(value='')=>value.trim();
function decimal(value){
 const s=textValue(value).replace(',','.');
 if(!/^\d+(?:\.\d{1,2})?$/.test(s))fail('Prix en euros invalide.');
 const [whole,part='']=s.split('.');
 return Number(whole)*100+Number(part.padEnd(2,'0'));
}
function int(value){
 if(!/^\d+$/.test(textValue(value)))fail('Entier attendu.');
 return Number(value);
}
function flag(value,defaultValue){
 if(value===undefined||!value.trim())return defaultValue;
 if(['1','oui','true','yes'].includes(value.trim().toLowerCase()))return true;
 if(['0','non','false','no'].includes(value.trim().toLowerCase()))return false;
 fail('Booléen attendu (oui/non).');
}
export function parseCsv(content){
 if(typeof content!=='string'||content.length>130000)fail('Fichier CSV trop volumineux (130 Ko maximum).');
 const csv=content.replace(/^\uFEFF/,'');
 if(!csv.trim())fail('Fichier vide.');
 const firstLine=csv.split(/\r?\n/,1)[0];
 const separator=(firstLine.match(/;/g)||[]).length>=(firstLine.match(/,/g)||[]).length?';':',';
 const rows=[];let line=1,start=1,cell='',current=[],quoted=false,closed=false;
 function pushRow(){
  current.push(cell);
  if(current.some(c=>c.trim()))rows.push({line:start,cells:current});
  cell='';current=[];closed=false;start=line+1;
 }
 for(let i=0;i<csv.length;i++){
  const ch=csv[i];
  if(ch==='"'){
   if(quoted&&csv[i+1]==='"'){cell+='"';i++;}
   else if(quoted){quoted=false;closed=true;}
   else if(!cell&&!closed){quoted=true;}
   else fail('Guillemets invalides en ligne '+line);
  }else if(!quoted&&(ch===separator||ch==='\n'||ch==='\r')){
   if(ch===separator){current.push(cell);cell='';closed=false;}
   else{
    if(ch==='\r'&&csv[i+1]==='\n')i++;
    pushRow();line++;
   }
  }else{
   if(!quoted&&closed&&!/\s/.test(ch))fail('Contenu après guillemets en ligne '+line);
   cell+=ch;if(ch==='\n')line++;
  }
  if(cell.length>2048)fail('Cellule trop longue.');
 }
 if(quoted)fail('Champ entre guillemets non terminé.');
 if(cell||current.length)pushRow();
 return rows;
}
export function parseWineCsv(csv){
 const rows=parseCsv(csv);
 if(!rows.length)fail('CSV vide.');
 const header=rows.shift().cells.map(x=>x.trim().toLowerCase());
 if(new Set(header).size!==header.length)fail('En-têtes répétés.');
 for(const key of required)if(!header.includes(key))fail('Colonne obligatoire absente : '+key);
 if(rows.length>500)fail('500 références maximum par import.');
 const result=[],errors=[];
 for(const row of rows){
  try{
   if(row.cells.length!==header.length)fail('Nombre de colonnes incorrect.');
   const r=Object.fromEntries(header.map((key,i)=>[key,row.cells[i]]));
   const wine=wineInput({
    producer:textValue(r.producer),cuvee:textValue(r.cuvee),
    appellation:textValue(r.appellation),vintage:textValue(r.vintage),
    region:textValue(r.region),grapes:textValue(r.grapes),
    color:textValue(r.color).toLowerCase(),
    tags:textValue(r.tags).split('|').map(x=>x.trim().toLowerCase()).filter(Boolean),
    body:int(r.body),acidity:int(r.acidity),tannin:int(r.tannin),
    aromatic:int(r.aromatic),priceCents:decimal(r.price_eur),
    stock:int(r.stock),byGlass:flag(r.by_glass,false),active:flag(r.active,true)
   });
   result.push({line:row.line,wine});
  }catch(error){errors.push({line:row.line,error:error.message});}
 }
 return {rows:result,errors};
}
export function signature(w){
 return [w.producer,w.cuvee,w.vintage].map(s=>s.trim().toLocaleLowerCase('fr')).join('|');
}
