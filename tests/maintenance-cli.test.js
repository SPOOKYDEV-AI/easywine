
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readdirSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {main} from '../src/server/maintenance-cli.js';

test('operator CLI creates authenticated encrypted backup and recovers new database',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'ew-cli-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const dbPath=join(dir,'live.sqlite');
 const db=openDatabase(dbPath);
 const restaurant=bootstrap(db,{slug:'operator',name:'Maison Ops',email:'ops@example.fr',
   owner:'Admin',password:'Secure-Operator-Test-2026!'});
 db.close();
 const keyFile=join(dir,'secret.key');
 writeFileSync(keyFile,randomBytes(32).toString('hex')+'\n',{mode:0o600});
 const oldDb=process.env.EASYWINE_DB,oldFile=process.env.EASYWINE_BACKUP_KEY_FILE;
 const oldRaw=process.env.EASYWINE_BACKUP_KEY;
 const backups=join(dir,'backups'),restore=join(dir,'recovered.sqlite');
 try{
  process.env.EASYWINE_DB=dbPath;
  process.env.EASYWINE_BACKUP_KEY_FILE=keyFile;
  delete process.env.EASYWINE_BACKUP_KEY;
  await main(['backup-encrypted','--directory',backups]);
  const files=readdirSync(backups);
  assert.equal(files.length,1);
  assert.match(files[0],/\.ewb$/);
  await main(['restore-encrypted','--from',join(backups,files[0]),'--to',restore]);
  assert.equal(existsSync(restore),true);
  const restored=openDatabase(restore);
  try{
   assert.equal(restored.prepare('SELECT name FROM restaurants WHERE id=?')
     .get(restaurant.restaurantId).name,'Maison Ops');
  }finally{restored.close();}
  await assert.rejects(()=>main(['restore-encrypted','--from',join(backups,files[0]),
    '--to',restore]),/EEXIST/);
 }finally{
  for(const [name,value] of [['EASYWINE_DB',oldDb],['EASYWINE_BACKUP_KEY_FILE',oldFile],
    ['EASYWINE_BACKUP_KEY',oldRaw]]){
   if(value===undefined)delete process.env[name];else process.env[name]=value;
  }
 }
});
