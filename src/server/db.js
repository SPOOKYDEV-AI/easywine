
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
export const now=()=>new Date().toISOString();
export const id=()=>randomUUID();
export const encode=x=>JSON.stringify(x);
export const decode=(x,def=[])=>{try{return x===null?def:JSON.parse(x);}catch{return def;}};


const SCHEMA_VERSION=2;
function migrate(db){
  const exists=db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='schema_version'").get();
  if(!exists){
    const foreignTables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    if(foreignTables.length)throw Error('Refusing to initialize EasyWine schema over an unknown nonempty database.');
    // SQLite DDL participates in this transaction. A crash cannot leave half
    // of the initial schema, and a later release must use explicit migrations.
    transaction(db,()=>{
      db.exec(readFileSync(new URL('./schema.sql',import.meta.url),'utf8'));
      const version=db.prepare('SELECT MAX(version) AS v FROM schema_version').get().v;
      if(version!==1)throw Error('Unexpected initialization schema');
    });
    // Fall through to the versioned migration below.

  }

  let version=db.prepare('SELECT MAX(version) AS v FROM schema_version').get().v;
  if(version===1){
    transaction(db,()=>{
      db.exec(readFileSync(new URL('./migrations/002-service-events.sql',import.meta.url),'utf8'));
      db.prepare('DELETE FROM schema_version').run();
      db.prepare('INSERT INTO schema_version(version) VALUES(?)').run(2);
    });
    version=2;
  }
  if(version!==SCHEMA_VERSION){
    throw Error('Unsupported database schema version '+version+
      ', expected '+SCHEMA_VERSION+'. Do not start until an explicit migration is supplied.');
  }
}
export function openDatabase(filename=process.env.EASYWINE_DB||resolve('.data/easywine.sqlite')){
  // Ensure database files created by SQLite are private from the start.
  process.umask(0o077);
  if(filename!==':memory:')mkdirSync(dirname(resolve(filename)),{recursive:true,mode:0o700});
  const db=new DatabaseSync(filename);
  try{
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    if(filename!==':memory:')db.exec('PRAGMA journal_mode=WAL;');
    migrate(db);
    return db;
  }catch(error){db.close();throw error;}
}
export function transaction(db,fn){
  db.exec('BEGIN IMMEDIATE');
  try{const result=fn();db.exec('COMMIT');return result;}
  catch(e){db.exec('ROLLBACK');throw e;}
}
export function record(db,actor,action,type,objectId,before,after){
  db.prepare('INSERT INTO audit VALUES (?,?,?,?,?,?,?,?,?)').run(id(),actor.restaurant_id,actor.id,
    action,type,objectId,before===undefined?null:encode(before),after===undefined?null:encode(after),now());
}
export function wineFrom(r){
  return {id:r.id,producer:r.producer,cuvee:r.cuvee,appellation:r.appellation,vintage:r.vintage,
    region:r.region,grapes:r.grapes,color:r.color,tags:decode(r.tags),
    body:r.body,acidity:r.acidity,tannin:r.tannin,aromatic:r.aromatic,
    priceCents:r.price_cents,stock:r.stock,byGlass:!!r.by_glass,active:!!r.active,version:r.version};
}
export function dishFrom(r){
  return {id:r.id,name:r.name,description:r.description,intensity:r.intensity,richness:r.richness,
    acidity:r.acidity,aromatic:r.aromatic,spice:r.spice,active:!!r.active,
    classicWineId:r.classic_wine_id,version:r.version};
}
