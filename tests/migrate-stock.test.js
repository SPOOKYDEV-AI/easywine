
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openDatabase} from '../src/server/db.js';
import {restoreToNewPath} from '../src/server/maintenance.js';

test('migration v2->v3 creates an explicit stock baseline, not fictional sale history',t=>{
 const folder=mkdtempSync(join(tmpdir(),'ew-stock-migrate-'));
 t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const file=join(folder,'legacy.sqlite');
 const id='11111111-1111-4111-8111-111111111111';
 const tenant='22222222-2222-4222-8222-222222222222';
 const old=new DatabaseSync(file);
 old.exec('PRAGMA foreign_keys=ON;');
 old.exec(readFileSync(new URL('../src/server/schema.sql',import.meta.url),'utf8'));
 old.exec(readFileSync(new URL('../src/server/migrations/002-service-events.sql',import.meta.url),'utf8'));
 old.exec('DELETE FROM schema_version; INSERT INTO schema_version(version) VALUES(2)');
 old.prepare('INSERT INTO restaurants(id,slug,name,created_at) VALUES(?,?,?,?)')
  .run(tenant,'legacy','Maison historique','2026-01-01T00:00:00.000Z');
 old.prepare(
  'INSERT INTO wines(id,restaurant_id,producer,cuvee,color,body,acidity,tannin,aromatic,price_cents,stock,updated_at)'+
  ' VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'
 ).run(id,tenant,'Producteur','Millésime','rouge',3,3,2,4,8000,17,'2026-09-01T00:00:00.000Z');
 old.close();
 const historical=join(folder,'recovered-v2.sqlite');
 assert.equal(restoreToNewPath(file,historical).version,2);
 const openedRecovered=openDatabase(historical);
 try{
  assert.equal(openedRecovered.prepare('SELECT MAX(version) AS v FROM schema_version').get().v,4);
  assert.equal(openedRecovered.prepare('SELECT COUNT(*) AS n FROM stock_movements').get().n,1);
 }finally{openedRecovered.close();}
 const db=openDatabase(file);
 try{
  assert.equal(db.prepare('SELECT MAX(version) AS v FROM schema_version').get().v,4);
  const row=db.prepare('SELECT * FROM stock_movements WHERE restaurant_id=? AND wine_id=?').get(tenant,id);
  assert.equal(row.reason,'baseline');
  assert.equal(row.delta,17);
  assert.equal(row.before_stock,0);
  assert.equal(row.after_stock,17);
  assert.equal(row.actor_id,null);
  assert.match(row.note,/antérieurs non disponibles/);
  assert.equal(db.prepare('SELECT stock FROM wines WHERE id=?').get(id).stock,17);
 }finally{db.close();}
 const reopened=openDatabase(file);
 try{assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM stock_movements').get().n,1);}
 finally{reopened.close();}
});
