
import {randomUUID} from 'node:crypto';
import {signIn,logout,publicUser,createUser,cookieFor,expiredCookie,passwordRecord,verifyPassword} from './auth.js';
import {now,transaction,record,encode,wineFrom,dishFrom} from './db.js';
import {recommend} from '../core/pairing.js';
import {HttpError,fail,object,text,number,wineInput,dishInput,preferences} from './validation.js';
import {parseWineCsv,signature} from './import-csv.js';
import {recordSuggestions,selectWine,wineStatistics} from './service-history.js';
import {STOCK_REASONS,stockMovement,stockHistory,previousStockRequest} from './stock-ledger.js';


const loginAttempts=new Map();
let concurrentLogins=0;
const MAX_CONCURRENT_LOGINS=8;
const accountKey=(slug,email)=>'account:'+slug+':'+email;
const ipKey=ip=>'source:'+ip;
function checkRate(ip,slug,email){
  const time=Date.now();
  for(const [key,value] of loginAttempts)if(value.until<time)loginAttempts.delete(key);
  const account=loginAttempts.get(accountKey(slug,email));
  const source=loginAttempts.get(ipKey(ip));
  if((account&&account.count>=10)||(source&&source.count>=200))
    fail('Trop de tentatives. Réessayez plus tard.',429);
  if(concurrentLogins>=MAX_CONCURRENT_LOGINS)
    fail('Trop de connexions simultanées. Réessayez.',429);
}
function countFailed(ip,slug,email){
  const time=Date.now();
  for(const key of [accountKey(slug,email),ipKey(ip)]){
    const v=loginAttempts.get(key);
    loginAttempts.set(key,{count:(v&&v.until>time?v.count:0)+1,until:time+15*60*1000});
  }
}
function assertRole(user,...roles){
  if(!roles.includes(user.role))fail('Accès réservé au responsable.',403);
}
function getWine(db,tenant,wineId){
  const row=db.prepare('SELECT * FROM wines WHERE restaurant_id=? AND id=?').get(tenant,wineId);
  if(!row)fail('Vin introuvable.',404);
  return wineFrom(row);
}
function getDish(db,tenant,dishId){
  const row=db.prepare('SELECT * FROM dishes WHERE restaurant_id=? AND id=?').get(tenant,dishId);
  if(!row)fail('Plat introuvable.',404);
  return dishFrom(row);
}
const wineColumns='(id,restaurant_id,producer,cuvee,appellation,vintage,region,grapes,color,tags,body,acidity,tannin,aromatic,price_cents,stock,by_glass,active,version,updated_at)';
const wineValues=(key,tenant,w)=>[key,tenant,w.producer,w.cuvee,w.appellation,w.vintage,w.region,w.grapes,
  w.color,encode(w.tags),w.body,w.acidity,w.tannin,w.aromatic,w.priceCents,w.stock,
  Number(w.byGlass),Number(w.active),1,now()];
function saveWine(db,tenant,wineId,w,oldVersion){
  const values=wineValues(wineId,tenant,w);
  if(oldVersion===null){
    db.prepare('INSERT INTO wines '+wineColumns+' VALUES('+Array(20).fill('?').join(',')+')').run(...values);
  }else{
    const result=db.prepare('UPDATE wines SET producer=?,cuvee=?,appellation=?,vintage=?,region=?,grapes=?,color=?,tags=?,body=?,acidity=?,tannin=?,aromatic=?,price_cents=?,stock=?,by_glass=?,active=?,version=version+1,updated_at=? WHERE id=? AND restaurant_id=? AND version=?')
      .run(w.producer,w.cuvee,w.appellation,w.vintage,w.region,w.grapes,w.color,encode(w.tags),
        w.body,w.acidity,w.tannin,w.aromatic,w.priceCents,w.stock,Number(w.byGlass),Number(w.active),
        now(),wineId,tenant,oldVersion);
    if(result.changes!==1)fail('Ce vin a été modifié entre-temps. Rechargez la cave.',409);
  }
}
function saveDish(db,tenant,dishId,d,oldVersion){
  if(oldVersion===null){
    db.prepare('INSERT INTO dishes(id,restaurant_id,name,description,intensity,richness,acidity,aromatic,spice,active,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(dishId,tenant,d.name,d.description,d.intensity,d.richness,d.acidity,d.aromatic,d.spice,Number(d.active),now());
  }else{
    const result=db.prepare('UPDATE dishes SET name=?,description=?,intensity=?,richness=?,acidity=?,aromatic=?,spice=?,active=?,version=version+1,updated_at=? WHERE id=? AND restaurant_id=? AND version=?')
      .run(d.name,d.description,d.intensity,d.richness,d.acidity,d.aromatic,d.spice,Number(d.active),
        now(),dishId,tenant,oldVersion);
    if(result.changes!==1)fail('Ce plat a été modifié. Rechargez la carte.',409);
  }
}
export async function route({db,method,path,body,user,cookie,ip,secure=false}){
  if(method==='POST'&&path==='/api/login'){
    const o=object(body);
    const slug=text(o.slug,'Établissement',80).toLowerCase();
    const email=text(o.email,'E-mail',254).toLowerCase();
    if(!/^[a-z0-9-]+$/.test(slug)||!/^\S+@\S+\.\S+$/.test(email)||typeof o.password!=='string'||o.password.length>1024)
      fail('Identifiants invalides.');
    checkRate(ip,slug,email);
    concurrentLogins++;
    let session;
    try{session=await signIn(db,{slug,email,password:o.password});}
    finally{concurrentLogins--;}
    if(!session){countFailed(ip,slug,email);fail('Identifiants incorrects.',401);}
    loginAttempts.delete(accountKey(slug,email));
    return {body:{user:session.user},headers:{'Set-Cookie':cookieFor(session.token,secure)}};
  }
  if(!user)fail('Authentification nécessaire.',401);
  const tenant=user.restaurant_id;

  if(method==='GET'&&path==='/api/me')return {body:{user:publicUser(user)}};
  if(method==='POST'&&path==='/api/me/password'){
    const o=object(body);
    if(!verifyPassword(user,o.currentPassword))fail('Mot de passe actuel incorrect.',403);
    const credentials=passwordRecord(o.newPassword);
    if(verifyPassword(user,o.newPassword))fail('Choisissez un mot de passe différent.',400);
    transaction(db,()=>{
      db.prepare('UPDATE users SET salt=?,password_hash=? WHERE restaurant_id=? AND id=?')
        .run(credentials.salt,credentials.passwordHash,tenant,user.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
      record(db,user,'password-change','user',user.id,undefined,{sessionsRevoked:true});
    });
    return {body:{ok:true},headers:{'Set-Cookie':expiredCookie(secure)}};
  }
  const memberMatch=path.match(/^\/api\/users\/([0-9a-f-]{36})$/);
  if(method==='PATCH'&&memberMatch){
    assertRole(user,'owner');
    const target=db.prepare('SELECT id,name,email,role,active FROM users WHERE restaurant_id=? AND id=?').get(tenant,memberMatch[1]);
    if(!target)fail('Utilisateur introuvable.',404);
    if(target.id===user.id)fail('Désactivation de son propre compte interdite.',403);
    const o=object(body);
    if(typeof o.active!=='boolean'||Object.keys(o).some(k=>k!=='active'))fail('Seul le statut actif est modifiable.');
    if(target.role==='owner')fail('Le compte propriétaire doit rester actif.',403);
    transaction(db,()=>{
      db.prepare('UPDATE users SET active=? WHERE restaurant_id=? AND id=?')
        .run(Number(o.active),tenant,target.id);
      if(!o.active)db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
      record(db,user,o.active?'activate':'deactivate','user',target.id,
        {active:!!target.active},{active:o.active});
    });
    return {body:{id:target.id,active:o.active}};
  }
  const resetMatch=path.match(/^\/api\/users\/([0-9a-f-]{36})\/password$/);
  if(method==='POST'&&resetMatch){
    assertRole(user,'owner');
    const target=db.prepare('SELECT id,role FROM users WHERE restaurant_id=? AND id=?').get(tenant,resetMatch[1]);
    if(!target)fail('Utilisateur introuvable.',404);
    if(target.id===user.id)fail('Utilisez le changement de mot de passe personnel.',400);
    if(target.role==='owner')fail('Opération interdite sur un propriétaire.',403);
    const o=object(body),credentials=passwordRecord(o.password);
    transaction(db,()=>{
      db.prepare('UPDATE users SET salt=?,password_hash=? WHERE restaurant_id=? AND id=?')
        .run(credentials.salt,credentials.passwordHash,tenant,target.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
      record(db,user,'password-reset','user',target.id,undefined,{sessionsRevoked:true});
    });
    return {body:{ok:true}};
  }

  if(method==='POST'&&path==='/api/logout'){
    logout(db,cookie);
    return {body:{ok:true},headers:{'Set-Cookie':expiredCookie(secure)}};
  }
  if(method==='GET'&&path==='/api/wines'){
    return {body:{wines:db.prepare('SELECT * FROM wines WHERE restaurant_id=? ORDER BY producer,cuvee,vintage').all(tenant).map(wineFrom)}};
  }
  if(method==='GET'&&path==='/api/dishes'){
    return {body:{dishes:db.prepare('SELECT * FROM dishes WHERE restaurant_id=? ORDER BY name').all(tenant).map(dishFrom)}};
  }

  if(method==='POST'&&(path==='/api/import/wines/preview'||path==='/api/import/wines/commit')){
    assertRole(user,'owner','manager');
    const o=object(body);
    const parsed=parseWineCsv(o.csv);
    const existing=db.prepare('SELECT producer,cuvee,vintage FROM wines WHERE restaurant_id=?').all(tenant);
    const duplicateSet=new Set(existing.map(signature));
    const issues=[...parsed.errors];
    for(const row of parsed.rows){
      const sig=signature(row.wine);
      if(duplicateSet.has(sig))issues.push({line:row.line,error:'Vin déjà présent ou doublon dans le fichier.'});
      duplicateSet.add(sig);
    }
    if(path.endsWith('/preview')){
      return {body:{total:parsed.rows.length+parsed.errors.length,valid:parsed.rows.length,
        errors:issues,sample:parsed.rows.slice(0,5).map(r=>r.wine),canImport:issues.length===0&&parsed.rows.length>0}};
    }
    if(issues.length||!parsed.rows.length)fail('Import refusé : '+issues.length+' erreur(s). Corrigez le fichier et refaites la prévisualisation.',422);
    transaction(db,()=>{
      const current=new Set(db.prepare('SELECT producer,cuvee,vintage FROM wines WHERE restaurant_id=?').all(tenant).map(signature));
      for(const row of parsed.rows){
        const sig=signature(row.wine);
        if(current.has(sig))fail('Doublon détecté, import annulé.',409);
        current.add(sig);
        const key=randomUUID();
        saveWine(db,tenant,key,row.wine,null);
        stockMovement(db,user,key,0,row.wine.stock,'import','Import CSV validé');
        record(db,user,'import','wine',key,undefined,row.wine);
      }
    });
    return {status:201,body:{imported:parsed.rows.length}};
  }
  if(method==='POST'&&path==='/api/wines'){
    assertRole(user,'owner','manager');
    const w=wineInput(body),key=randomUUID();
    transaction(db,()=>{
      saveWine(db,tenant,key,w,null);
      stockMovement(db,user,key,0,w.stock,'opening','Stock initial déclaré');
      record(db,user,'create','wine',key,undefined,w);
    });
    return {status:201,body:{wine:getWine(db,tenant,key)}};
  }
  if(method==='POST'&&path==='/api/dishes'){
    assertRole(user,'owner','manager');
    const d=dishInput(body),key=randomUUID();
    transaction(db,()=>{saveDish(db,tenant,key,d,null);record(db,user,'create','dish',key,undefined,d);});
    return {status:201,body:{dish:getDish(db,tenant,key)}};
  }
  let match=path.match(/^\/api\/wines\/([0-9a-f-]{36})$/);
  if(method==='PATCH'&&match){
    assertRole(user,'owner','manager');
    const prior=getWine(db,tenant,match[1]),o=object(body);
    const version=number(o.expectedVersion,'Version',1,2147483647);
    const updated=wineInput(o,prior);
    transaction(db,()=>{
      saveWine(db,tenant,prior.id,updated,version);
      if(updated.stock!==prior.stock)
        stockMovement(db,user,prior.id,prior.stock,updated.stock,'manual','Modification de la fiche cave');
      record(db,user,'update','wine',prior.id,prior,updated);
    });
    return {body:{wine:getWine(db,tenant,prior.id)}};
  }

  match=path.match(/^\/api\/wines\/([0-9a-f-]{36})\/stock-movements$/);
  if(method==='GET'&&match){
    assertRole(user,'owner','manager');
    getWine(db,tenant,match[1]);
    return {body:{movements:stockHistory(db,tenant,match[1])}};
  }
  if(method==='POST'&&match){
    assertRole(user,'owner','manager');
    const o=object(body);
    const delta=number(o.delta,'Variation',-1000000,1000000);
    if(delta===0)fail('Variation nulle, aucun mouvement à enregistrer.');
    if(!STOCK_REASONS.includes(o.reason))fail('Motif de mouvement invalide.');
    const note=text(o.note,'Justification',240);
    const key=text(o.requestKey,'Clé de requête',36);
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(key))
      fail('Clé de requête invalide.');
    const version=number(o.expectedVersion,'Version',1,2147483647);
    return {body:transaction(db,()=>{
      const previous=previousStockRequest(db,tenant,key);
      if(previous){
        if(previous.wine_id!==match[1]||previous.delta!==delta||
           previous.reason!==o.reason||previous.note!==note)
          fail('Cette clé de requête a déjà été utilisée pour un autre mouvement.',409);
        return {wine:getWine(db,tenant,match[1]),alreadyApplied:true,movementId:previous.id};
      }
      const prior=getWine(db,tenant,match[1]);
      if(prior.version!==version)fail('Stock modifié depuis votre dernière lecture. Rechargez la cave.',409);
      const after=prior.stock+delta;
      if(!Number.isSafeInteger(after)||after<0||after>1000000)
        fail('Le mouvement produirait un stock invalide.',409);
      const updated={...prior,stock:after};
      saveWine(db,tenant,prior.id,updated,version);
      const movementId=stockMovement(db,user,prior.id,prior.stock,after,o.reason,note,key);
      record(db,user,'stock-adjust','wine',prior.id,{stock:prior.stock},
        {stock:after,delta,reason:o.reason,note,movementId});
      return {wine:getWine(db,tenant,match[1]),alreadyApplied:false,movementId};
    })};
  }
  match=path.match(/^\/api\/dishes\/([0-9a-f-]{36})$/);
  if(method==='PATCH'&&match){
    assertRole(user,'owner','manager');
    const prior=getDish(db,tenant,match[1]),o=object(body);
    const version=number(o.expectedVersion,'Version',1,2147483647);
    const updated=dishInput(o,prior);
    transaction(db,()=>{saveDish(db,tenant,prior.id,updated,version);
      record(db,user,'update','dish',prior.id,prior,updated);});
    return {body:{dish:getDish(db,tenant,prior.id)}};
  }
  match=path.match(/^\/api\/dishes\/([0-9a-f-]{36})\/classic$/);
  if(method==='PUT'&&match){
    assertRole(user,'owner','manager');
    const prior=getDish(db,tenant,match[1]),o=object(body);
    const version=number(o.expectedVersion,'Version',1,2147483647);
    const wineId=o.wineId===null?null:text(o.wineId,'Vin',80);
    if(wineId)getWine(db,tenant,wineId);
    transaction(db,()=>{
      const result=db.prepare('UPDATE dishes SET classic_wine_id=?,version=version+1,updated_at=? WHERE restaurant_id=? AND id=? AND version=?')
        .run(wineId,now(),tenant,prior.id,version);
      if(result.changes!==1)fail('Accord modifié entre-temps.',409);
      record(db,user,'set-classic','dish',prior.id,{wineId:prior.classicWineId},{wineId});
    });
    return {body:{dish:getDish(db,tenant,prior.id)}};
  }

  match=path.match(/^\/api\/dishes\/([0-9a-f-]{36})\/blocks$/);
  if(method==='GET'&&match){
    const dish=getDish(db,tenant,match[1]);
    const wineIds=db.prepare('SELECT wine_id FROM blocked_pairings WHERE restaurant_id=? AND dish_id=? ORDER BY wine_id')
      .all(tenant,dish.id).map(r=>r.wine_id);
    return {body:{wineIds,version:dish.version}};
  }
  if(method==='PUT'&&match){
    assertRole(user,'owner','manager');
    const prior=getDish(db,tenant,match[1]),o=object(body);
    const version=number(o.expectedVersion,'Version',1,2147483647);
    if(!Array.isArray(o.wineIds)||o.wineIds.length>1000)fail('Liste invalide.');
    const ids=[...new Set(o.wineIds)];
    for(const wid of ids)getWine(db,tenant,text(wid,'Vin',80));
    transaction(db,()=>{
      const result=db.prepare('UPDATE dishes SET version=version+1,updated_at=? WHERE restaurant_id=? AND id=? AND version=?')
        .run(now(),tenant,prior.id,version);
      if(result.changes!==1)fail('Les règles du plat ont changé entre-temps.',409);
      const before=db.prepare('SELECT wine_id FROM blocked_pairings WHERE restaurant_id=? AND dish_id=?')
        .all(tenant,prior.id).map(r=>r.wine_id);
      db.prepare('DELETE FROM blocked_pairings WHERE restaurant_id=? AND dish_id=?').run(tenant,prior.id);
      const add=db.prepare('INSERT INTO blocked_pairings(restaurant_id,dish_id,wine_id) VALUES(?,?,?)');
      for(const wid of ids)add.run(tenant,prior.id,wid);
      record(db,user,'set-blocks','dish',prior.id,before,ids);
    });
    return {body:{wineIds:ids,dish:getDish(db,tenant,prior.id)}};
  }

  if(method==='POST'&&path==='/api/service/choice'){
    const o=object(body);
    const sessionId=text(o.sessionId,'Session',80),wineId=text(o.wineId,'Vin',80);
    if(!/^[0-9a-f-]{36}$/.test(sessionId)||!/^[0-9a-f-]{36}$/.test(wineId))
      fail('Identifiants invalides.');
    return {body:selectWine(db,user,sessionId,wineId)};
  }
  if(method==='GET'&&path==='/api/stats'){
    assertRole(user,'owner','manager');
    const wines=wineStatistics(db,tenant);
    const totals=wines.reduce((a,w)=>({shown:a.shown+w.shown,chosen:a.chosen+w.chosen}),
      {shown:0,chosen:0});
    return {body:{wines,totals,disclaimer:'Affichages et choix explicitement confirmés dans EasyWine. Les ventes POS ne sont pas intégrées.'}};
  }
  if(method==='POST'&&path==='/api/recommend'){
    const p=preferences(body),dish=getDish(db,tenant,p.dishId);
    if(!dish.active)fail('Ce plat est désactivé.',409);
    const wines=db.prepare('SELECT * FROM wines WHERE restaurant_id=?').all(tenant).map(wineFrom);
    const blocked=db.prepare('SELECT wine_id FROM blocked_pairings WHERE restaurant_id=? AND dish_id=?').all(tenant,dish.id).map(r=>r.wine_id);
    const classic=dish.classicWineId?wines.find(w=>w.id===dish.classicWineId):null;
    const results=recommend({dish,wines:wines.filter(w=>w.id!==classic?.id),blockedWineIds:blocked,styles:p.styles,color:p.color,
      minPriceCents:p.minPriceCents,maxPriceCents:p.maxPriceCents,
      diversifyPrices:p.minPriceCents===null&&p.maxPriceCents===null});
    const classicInfo=classic?{wine:classic,available:classic.active&&classic.stock>0&&!blocked.includes(classic.id),blocked:blocked.includes(classic.id)}:null;
    const sessionId=recordSuggestions(db,user,dish,classicInfo,results);
    return {body:{sessionId,dish,classic:classicInfo,
      recommendations:results,explanation:'Compatibilité indicative calculée sur les profils renseignés par le restaurant, sans recours au prix comme critère de qualité.'}};
  }
  if(method==='GET'&&path==='/api/audit'){
    assertRole(user,'owner','manager');
    const entries=db.prepare('SELECT a.id,a.action,a.object_type,a.object_id,a.before_json,a.after_json,a.created_at,u.name AS actor FROM audit a JOIN users u ON u.id=a.actor_id WHERE a.restaurant_id=? ORDER BY a.created_at DESC LIMIT 100').all(tenant);
    return {body:{events:entries.map(e=>({id:e.id,action:e.action,objectType:e.object_type,
      objectId:e.object_id,actor:e.actor,at:e.created_at,before:e.before_json?JSON.parse(e.before_json):null,
      after:e.after_json?JSON.parse(e.after_json):null}))}};
  }
  if(method==='POST'&&path==='/api/users'){
    assertRole(user,'owner');
    const o=object(body),name=text(o.name,'Nom',120),email=text(o.email,'E-mail',254).toLowerCase();
    if(!/^\S+@\S+\.\S+$/.test(email))fail('E-mail invalide.');
    const role=o.role;
    if(!['manager','staff'].includes(role))fail('Rôle invalide.');
    if(typeof o.password!=='string')fail('Mot de passe requis.');
    let userId;
    transaction(db,()=>{
      userId=createUser(db,{restaurantId:tenant,name,email,role,password:o.password});
      record(db,user,'create','user',userId,undefined,{name,email,role});
    });
    return {status:201,body:{id:userId,name,email,role}};
  }
  if(method==='GET'&&path==='/api/users'){
    assertRole(user,'owner','manager');
    const users=db.prepare('SELECT id,name,email,role,active FROM users WHERE restaurant_id=? ORDER BY name').all(tenant);
    return {body:{users:users.map(u=>({...u,active:!!u.active}))}};
  }
  throw new HttpError(404,'Ressource inconnue.');
}
