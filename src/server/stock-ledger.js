
import {randomUUID} from 'node:crypto';
import {now} from './db.js';

export const STOCK_REASONS=Object.freeze(['restock','consumption','loss','correction']);
export function stockMovement(db,actor,wineId,before,after,reason,note='',requestKey=null){
  const id=randomUUID();
  db.prepare(
    'INSERT INTO stock_movements(id,restaurant_id,wine_id,actor_id,delta,before_stock,after_stock,reason,note,request_key,created_at)'+
    ' VALUES(?,?,?,?,?,?,?,?,?,?,?)'
  ).run(id,actor.restaurant_id,wineId,actor.id,after-before,before,after,reason,note,requestKey,now());
  return id;
}
export function previousStockRequest(db,tenant,requestKey){
  return db.prepare(
    'SELECT id,wine_id,delta,before_stock,after_stock,reason,note FROM stock_movements WHERE restaurant_id=? AND request_key=?'
  ).get(tenant,requestKey);
}
export function stockHistory(db,tenant,wineId,limit=100){
  return db.prepare(
    'SELECT m.id,m.delta,m.before_stock AS beforeStock,m.after_stock AS afterStock,m.reason,m.note,m.created_at AS at,'+
    'u.name AS actor FROM stock_movements m LEFT JOIN users u ON u.id=m.actor_id '+
    'WHERE m.restaurant_id=? AND m.wine_id=? ORDER BY m.created_at DESC,m.rowid DESC LIMIT ?'
  ).all(tenant,wineId,limit);
}
