
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {backupKey,createEncryptedBackup,restoreEncryptedBackup} from '../src/server/encrypted-backup.js';

const pw='Backup-Test-Only-Passphrase-2026!';
test('encrypted backup preserves committed WAL data and restores into a NEW database',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'ew-encrypted-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const live=join(dir,'live.sqlite'),db=openDatabase(live);
 const house=bootstrap(db,{slug:'encrypted',name:'Maison cryptée',email:'owner@example.fr',
   owner:'Responsable',password:pw});
 db.prepare('UPDATE restaurants SET name=? WHERE id=?').run('Maison chiffrée',house.restaurantId);
 const key=randomBytes(32);
 let snapshot;
 try{
  snapshot=await createEncryptedBackup(db,join(dir,'private'),key);
  assert.equal(snapshot.encrypted,true);
  assert.match(snapshot.name,/\.ewb$/);
  assert.ok(readFileSync(snapshot.path).subarray(0,8).equals(Buffer.from('EWBACK01')));
  assert.equal(readFileSync(snapshot.path).includes(Buffer.from('Maison chiffrée')),false);
  assert.equal(readdirSync(join(dir,'private')).length,1);
  const recovered=join(dir,'restored.sqlite');
  assert.equal((await restoreEncryptedBackup(snapshot.path,recovered,key)).version,3);
  const restored=openDatabase(recovered);
  assert.equal(restored.prepare('SELECT name FROM restaurants WHERE id=?').get(house.restaurantId).name,'Maison chiffrée');
  restored.close();
  await assert.rejects(()=>restoreEncryptedBackup(snapshot.path,recovered,key),/EEXIST/);
  const wrong=randomBytes(32);
  const absent=join(dir,'wrong.sqlite');
  await assert.rejects(()=>restoreEncryptedBackup(snapshot.path,absent,wrong));
  assert.equal(existsSync(absent),false);
  wrong.fill(0);
 }finally{key.fill(0);db.close();}
});
test('authenticated encryption rejects byte tampering, truncation, foreign files and malformed key',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'ew-corrupt-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const db=openDatabase(':memory:');
 bootstrap(db,{slug:'test-corrupt',name:'Corruption',email:'a@example.fr',owner:'Alice',password:pw});
 const key=randomBytes(32);
 try{
  const snapshot=await createEncryptedBackup(db,dir,key);
  const bytes=readFileSync(snapshot.path);
  const changed=Buffer.from(bytes);
  changed[30]^=0xff;
  const tampered=join(dir,'tampered.ewb');
  writeFileSync(tampered,changed);
  await assert.rejects(()=>restoreEncryptedBackup(tampered,join(dir,'tampered.sqlite'),key));
  assert.equal(existsSync(join(dir,'tampered.sqlite')),false);
  const truncated=join(dir,'short.ewb');
  writeFileSync(truncated,bytes.subarray(0,16));
  await assert.rejects(()=>restoreEncryptedBackup(truncated,join(dir,'short.sqlite'),key));
  const unknown=join(dir,'unknown.ewb');
  const invalid=Buffer.from(bytes);invalid[0]^=0xff;writeFileSync(unknown,invalid);
  await assert.rejects(()=>restoreEncryptedBackup(unknown,join(dir,'unknown.sqlite'),key),/Format/);
  assert.throws(()=>backupKey('weak'),/64 caractères/);
  assert.deepEqual(backupKey(key.toString('hex')),key);
 }finally{db.close();key.fill(0);}
});
test('encrypted backup does not overwrite an existing unrelated target',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'ew-overwrite-'));
 t.after(()=>rmSync(dir,{force:true,recursive:true}));
 const db=openDatabase(':memory:');
 const key=randomBytes(32);
 try{
  const snapshot=await createEncryptedBackup(db,dir,key);
  const existing=join(dir,'existing.sqlite');
  writeFileSync(existing,'DO NOT TOUCH');
  await assert.rejects(()=>restoreEncryptedBackup(snapshot.path,existing,key),/EEXIST/);
  assert.equal(readFileSync(existing,'utf8'),'DO NOT TOUCH');
 }finally{db.close();key.fill(0);}
});
