
import {COLORS,STYLES} from '../core/pairing.js';
export class HttpError extends Error {
  constructor(status,message){super(message);this.status=status;}
}
export function fail(message,status=400){throw new HttpError(status,message);}
export function object(x){
  if(!x||typeof x!=='object'||Array.isArray(x))fail('Objet JSON attendu.');
  return x;
}
export function text(x,name,max=160,{empty=false}={}){
  if(typeof x!=='string')fail(name+' : texte requis.');
  const clean=x.trim();
  if((!empty&&!clean)||clean.length>max)fail(name+' : longueur invalide.');
  return clean;
}
export function number(x,name,min,max){
  if(typeof x!=='number'||!Number.isSafeInteger(x)||x<min||x>max)
    fail(name+' : entier entre '+min+' et '+max+' attendu.');
  return x;
}
export function bool(x,name){
  if(typeof x!=='boolean')fail(name+' : booléen attendu.');
  return x;
}
export function wineInput(input,existing={}){
  object(input);
  const d={...existing,...input};
  if(input.id!==undefined||input.restaurantId!==undefined)fail('Identifiants non modifiables.');
  if(!COLORS.includes(d.color))fail('Couleur invalide.');
  if(!Array.isArray(d.tags)||d.tags.length>10||d.tags.some(x=>!STYLES.includes(x)))
    fail('Tags inconnus.');
  return {
    producer:text(d.producer,'Producteur'),cuvee:text(d.cuvee,'Cuvée'),
    appellation:text(d.appellation??'','Appellation',160,{empty:true}),
    vintage:text(d.vintage??'','Millésime',12,{empty:true}),
    region:text(d.region??'','Région',100,{empty:true}),
    grapes:text(d.grapes??'','Cépages',160,{empty:true}),
    color:d.color,tags:[...new Set(d.tags)],
    body:number(d.body,'Corps',1,5),acidity:number(d.acidity,'Acidité',1,5),
    tannin:number(d.tannin,'Tanins',1,5),aromatic:number(d.aromatic,'Arômes',1,5),
    priceCents:number(d.priceCents,'Prix',0,100000000),
    stock:number(d.stock,'Stock',0,1000000),
    byGlass:bool(d.byGlass,'Au verre'),active:bool(d.active,'Actif')
  };
}
export function dishInput(input,existing={}){
  object(input);const d={...existing,...input};
  if(input.id!==undefined||input.restaurantId!==undefined||input.classicWineId!==undefined)
    fail('Identifiants et accord classique non modifiables ici.');
  return {
    name:text(d.name,'Plat'),description:text(d.description??'','Description',2000,{empty:true}),
    intensity:number(d.intensity,'Intensité',1,5),
    richness:number(d.richness,'Richesse',1,5),
    acidity:number(d.acidity,'Acidité',1,5),
    aromatic:number(d.aromatic,'Aromatique',1,5),
    spice:number(d.spice,'Épices',1,5),
    active:bool(d.active,'Actif')
  };
}
export function preferences(input){
  object(input);
  const dishId=text(input.dishId,'Plat',80);
  const styles=input.styles??[];
  if(!Array.isArray(styles)||styles.length>STYLES.length||styles.some(x=>!STYLES.includes(x)))
    fail('Préférences invalides.');
  const color=input.color??null;
  if(color!==null&&!COLORS.includes(color))fail('Couleur invalide.');
  let minPriceCents=input.minPriceCents??null,maxPriceCents=input.maxPriceCents??null;
  if(minPriceCents!==null)minPriceCents=number(minPriceCents,'Minimum',0,100000000);
  if(maxPriceCents!==null)maxPriceCents=number(maxPriceCents,'Maximum',0,100000000);
  if(minPriceCents!==null&&maxPriceCents!==null&&minPriceCents>maxPriceCents)
    fail('Fourchette inversée.');
  return {dishId,styles:[...new Set(styles)],color,minPriceCents,maxPriceCents};
}
