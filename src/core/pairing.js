
export const STYLES = Object.freeze(['leger','frais','mineral','aromatique','gourmand','puissant','structure','original','classique','decouverte']);
export const COLORS = Object.freeze(['rouge','blanc','rose','bulles','doux']);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const level=(n,f=3)=>Number.isFinite(Number(n))?clamp(Number(n),1,5):f;
const similarity=(a,b)=>1-Math.abs(level(a)-level(b))/4;
const mean=a=>a.reduce((s,n)=>s+n,0)/a.length;
// All profiles originate from restaurant-supplied data. Prices are never used in scoring.
export function compatibility(d,w,styles=[]){
  const body=level(w.body),tannin=level(w.tannin),acidity=level(w.acidity);
  let score=100*(.36*similarity(body,d.intensity)+.25*similarity(acidity,clamp((d.richness+d.acidity)/2+.5,1,5))+
    .19*similarity(w.aromatic,d.aromatic)+.20*similarity(body,d.richness));
  score-=Math.max(0,tannin-2)*Math.max(0,level(d.spice)-2)*3;
  if(level(d.intensity)<=2)score-=Math.max(0,tannin-3)*5;
  const tagged=s=>Array.isArray(w.tags)&&w.tags.includes(s);
  const taste={leger:6-body,frais:acidity,mineral:tagged('mineral')?5:1,
    aromatique:level(w.aromatic),gourmand:tagged('gourmand')?5:Math.min(5,body+1),
    puissant:body,structure:(body+tannin)/2,original:tagged('original')?5:1,
    classique:tagged('classique')?5:1,decouverte:tagged('decouverte')?5:1};
  if(styles.length)score=.72*score+28*mean(styles.map(s=>(taste[s]??1)/5));
  return Math.round(clamp(score,0,100));
}
const order=(a,b)=>b.score-a.score||a.wine.priceCents-b.wine.priceCents||a.wine.id.localeCompare(b.wine.id);
function diverse(items,max){
  if(items.length<=max)return items;
  const pool=items.filter(x=>x.score>=Math.max(48,items[0].score-22));
  if(pool.length<=max)return pool;
  const priced=[...pool].sort((a,b)=>a.wine.priceCents-b.wine.priceCents||order(a,b));
  const low=priced[0].wine.priceCents,high=priced[priced.length-1].wine.priceCents;
  if(low===high)return pool.slice(0,max);
  const bands=Array.from({length:max},()=>[]);
  for(const entry of pool){
    bands[Math.min(max-1,Math.floor((entry.wine.priceCents-low)/(high-low)*max))].push(entry);
  }
  const chosen=[];
  for(const band of bands){band.sort(order);if(band.length)chosen.push(band[0]);}
  for(const x of pool){if(chosen.length>=max)break;if(!chosen.some(y=>y.wine.id===x.wine.id))chosen.push(x);}
  return chosen.slice(0,max).sort((a,b)=>a.wine.priceCents-b.wine.priceCents);
}
function describe(d,w){
  const traits=[];
  if(level(w.acidity)>=4)traits.push('une belle fraîcheur');
  if(level(w.body)>=4)traits.push('une structure affirmée');
  if(level(w.body)<=2)traits.push('un profil léger');
  if(level(w.aromatic)>=4)traits.push('une expression aromatique marquée');
  const p=traits.slice(0,2).join(' et ')||'un profil équilibré';
  const name=[w.producer,w.cuvee,w.vintage].filter(Boolean).join(' ');
  const reason='Son profil présente '+p+', selon les caractéristiques renseignées par le restaurant.';
  return {reason,pitch:'Je vous propose '+name+' : '+p+' pour accompagner '+d.name+'.',
    detail:'Accord estimé à partir des profils saisis (corps, acidité, tanins et intensité). '+reason};
}
export function recommend({dish,wines,styles=[],color=null,minPriceCents=null,maxPriceCents=null,blockedWineIds=[],limit=3,diversifyPrices=false}){
  const blocked=new Set(blockedWineIds);
  const list=wines.filter(w=>w.active&&w.stock>0&&!blocked.has(w.id))
    .filter(w=>!color||w.color===color)
    .filter(w=>minPriceCents===null||w.priceCents>=minPriceCents)
    .filter(w=>maxPriceCents===null||w.priceCents<=maxPriceCents)
    .map(wine=>({wine,score:compatibility(dish,wine,styles),...describe(dish,wine)})).sort(order);
  if(!list.length)return [];
  const max=clamp(limit,1,3);
  return (diversifyPrices?diverse(list,max):list.slice(0,max)).map((x,i)=>({...x,rank:i+1}));
}
