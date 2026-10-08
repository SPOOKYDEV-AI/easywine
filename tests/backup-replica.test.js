
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync,mkdirSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {createEncryptedBackup,restoreEncryptedBackup} from '../src/server/encrypted-backup.js';
import {replicateEncryptedBackup} from '../src/server/backup-replica.js';

test('backup replication is byte-for-byte correct, atomic and recoverable',async t=>{
 const folder=mkdtempSync(join(tmpdir(),'easywine-replica-'));
 t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const primary=join(folder,'primary'),secondary=join(folder,'secondary');
 const db=openDatabase(':memory:');
 bootstrap(db,{slug:'replica',name:'Maison de sauvegarde',email:'owner@example.fr',
   owner:'Owner',password:'Replica-Strong-Password-2026!'});
 const key=randomBytes(32);
 try{
  const saved=await createEncryptedBackup(db,primary,key);
  const replica=await replicateEncryptedBackup(saved.path,secondary);
  assert.equal(replica.bytes,readFileSync(saved.path).length);
  assert.ok(replica.sha256.length===64);
  assert.deepEqual(readFileSync(saved.path),readFileSync(replica.path));
  const recovered=join(folder,'recovered.sqlite');
  assert.equal((await restoreEncryptedBackup(replica.path,recovered,key)).restaurants,1);
  const opened=openDatabase(recovered);
  try{
    assert.equal(opened.prepare('SELECT name FROM restaurants WHERE slug=?')
      .get('replica').name,'Maison de sauvegarde');
  }finally{opened.close();}
  await assert.rejects(()=>replicateEncryptedBackup(saved.path,secondary),/EEXIST/);
  assert.deepEqual(readdirSync(secondary),[saved.name]);
  await assert.rejects(()=>replicateEncryptedBackup(saved.path,primary),/différente/);
  assert.deepEqual(readFileSync(saved.path),readFileSync(replica.path));
 }finally{db.close();key.fill(0);}
});
test('replica publication refuses preexisting destination and preserves unrelated bytes',async t=>{
 const folder=mkdtempSync(join(tmpdir(),'easywine-replica-existing-'));
 t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const first=join(folder,'first'),second=join(folder,'second');
 const db=openDatabase(':memory:'),key=randomBytes(32);
 try{
  const saved=await createEncryptedBackup(db,first,key);
  mkdirSync(second);
  const existing=join(second,saved.name);
  writeFileSync(existing,'critical archive to preserve');
  await assert.rejects(()=>replicateEncryptedBackup(saved.path,second),/EEXIST/);
  assert.equal(readFileSync(existing,'utf8'),'critical archive to preserve');
  assert.deepEqual(readdirSync(second),[saved.name]);
 }finally{db.close();key.fill(0);}
});
