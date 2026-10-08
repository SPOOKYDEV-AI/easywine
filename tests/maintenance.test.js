
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,statSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {createBackup,restoreToNewPath,verifySnapshot} from '../src/server/maintenance.js';

test('WAL backup, integrity verification and non-destructive restore',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'easywine-backup-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const original=join(dir,'live.sqlite'),db=openDatabase(original);
 const first=bootstrap(db,{slug:'backup-test',name:'Maison Test',email:'owner@example.fr',
   owner:'Alice',password:'TestPassword2026!Secure'});
 // Keep the database open and write into WAL, to prove raw-file copy is not used.
 db.prepare('UPDATE restaurants SET name=? WHERE id=?').run('Maison vérifiée',first.restaurantId);
 const backup=await createBackup(db,join(dir,'backups'));
 assert.ok(backup.pages>0);
 assert.equal(backup.version,4);
 assert.equal(backup.restaurants,1);
 assert.equal(verifySnapshot(backup.path).restaurants,1);
 const recovered=join(dir,'recovered.sqlite');
 const result=restoreToNewPath(backup.path,recovered);
 assert.equal(result.path,recovered);
 assert.ok(existsSync(recovered));
 const restored=openDatabase(recovered);
 assert.equal(restored.prepare('SELECT name FROM restaurants WHERE id=?').get(first.restaurantId).name,'Maison vérifiée');
 assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM users').get().n,1);
 restored.close();
 assert.throws(()=>restoreToNewPath(backup.path,recovered),/EEXIST/);
 assert.ok(statSync(recovered).size>0);
 db.close();
});
test('a corrupted backup cannot replace existing or create new data',t=>{
 const dir=mkdtempSync(join(tmpdir(),'easywine-badbackup-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const bad=join(dir,'bad.sqlite');
 writeFileSync(bad,'not a sqlite database');
 const target=join(dir,'restored.sqlite');
 assert.throws(()=>restoreToNewPath(bad,target));
 assert.equal(existsSync(target),false);
});
