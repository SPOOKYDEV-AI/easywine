
import {randomUUID} from 'node:crypto';
import {now,transaction} from './db.js';
import {fail} from './validation.js';

export function recordSuggestions(db,actor,dish,classic,recommendations,{insideTransaction=false}={}){
  const selected=[];
  if(classic?.available)selected.push({wine:classic.wine,source:'classic',rank:null,score:null});
  for(const recommendation of recommendations){
    if(!selected.some(item=>item.wine.id===recommendation.wine.id))
      selected.push({...recommendation,source:'recommendation'});
  }
  if(!selected.length)return null;
  const sessionId=randomUUID();
  const save=()=>{
    db.prepare('INSERT INTO service_sessions(id,restaurant_id,actor_id,dish_id,created_at) VALUES(?,?,?,?,?)')
      .run(sessionId,actor.restaurant_id,actor.id,dish.id,now());
    const add=db.prepare('INSERT INTO service_options(restaurant_id,session_id,wine_id,source,rank,score) VALUES(?,?,?,?,?,?)');
    for(const item of selected)
      add.run(actor.restaurant_id,sessionId,item.wine.id,item.source,item.rank??null,item.score??null);
  };
  if(insideTransaction)save();
  else transaction(db,save);
  return sessionId;
}
export function selectWine(db,actor,sessionId,wineId){
  return transaction(db,()=>{
    const option=db.prepare(
      'SELECT w.stock,w.active FROM service_options o '+
      'JOIN service_sessions s ON s.id=o.session_id AND s.restaurant_id=o.restaurant_id '+
      'JOIN wines w ON w.id=o.wine_id AND w.restaurant_id=o.restaurant_id '+
      'WHERE o.restaurant_id=? AND o.session_id=? AND o.wine_id=? AND s.actor_id=? AND s.created_at>=?'
    ).get(actor.restaurant_id,sessionId,wineId,actor.id,
      new Date(Date.now()-12*60*60*1000).toISOString());
    if(!option)fail('Cette proposition ne fait pas partie de votre session de service.',404);
    const existing=db.prepare('SELECT wine_id FROM service_choices WHERE restaurant_id=? AND session_id=?')
      .get(actor.restaurant_id,sessionId);
    if(existing){
      if(existing.wine_id!==wineId)fail('Un vin a déjà été sélectionné pour cette recherche.',409);
      return {selected:true,alreadyRecorded:true};
    }
    if(!option.active||option.stock<=0)fail('Ce vin n’est plus disponible. Vérifiez la cave.',409);
    db.prepare('INSERT INTO service_choices(restaurant_id,session_id,wine_id,chosen_at) VALUES(?,?,?,?)')
      .run(actor.restaurant_id,sessionId,wineId,now());
    return {selected:true,alreadyRecorded:false};
  });
}
export function wineStatistics(db,restaurantId){
  return db.prepare(
    'SELECT w.id,w.producer,w.cuvee,w.vintage,w.price_cents, '+
    'COALESCE(seen.count,0) AS generated,COALESCE(chosen.count,0) AS chosen '+
    'FROM wines w '+
    'LEFT JOIN (SELECT wine_id,COUNT(*) AS count FROM service_options WHERE restaurant_id=? GROUP BY wine_id) seen ON seen.wine_id=w.id '+
    'LEFT JOIN (SELECT wine_id,COUNT(*) AS count FROM service_choices WHERE restaurant_id=? GROUP BY wine_id) chosen ON chosen.wine_id=w.id '+
    'WHERE w.restaurant_id=? ORDER BY chosen DESC,generated DESC,w.producer,w.cuvee'
  ).all(restaurantId,restaurantId,restaurantId);
}
export function pruneServiceHistory(db,olderThan){
  if(!(olderThan instanceof Date)||!Number.isFinite(olderThan.getTime()))
    throw Error('Date de purge invalide.');
  return transaction(db,()=>db.prepare('DELETE FROM service_sessions WHERE created_at<?')
    .run(olderThan.toISOString()).changes);
}
