
import {backup,DatabaseSync} from 'node:sqlite';
import {mkdirSync,openSync,closeSync,unlinkSync,renameSync,copyFileSync,linkSync,
  chmodSync,fsyncSync,statSync} from 'node:fs';
import {dirname,join,resolve,basename} from 'node:path';
import {randomUUID} from 'node:crypto';

const ensureFolder=folder=>mkdirSync(folder,{recursive:true,mode:0o700});
const randomName=()=>new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID();
function syncFile(file){const fd=openSync(file,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
function syncDirectory(path){
  try{const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
  catch(error){if(!['EINVAL','EPERM','EISDIR','ENOTSUP','EACCES'].includes(error.code))throw error;}
}
function reserve(file){
  const fd=openSync(file,'wx',0o600);
  closeSync(fd);
}
export function verifySnapshot(filename){
  const db=new DatabaseSync(filename,{readOnly:true});
  try{
    const integrity=db.prepare('PRAGMA integrity_check').all();
    if(integrity.length!==1||integrity[0].integrity_check!=='ok')
      throw Error('SQLite integrity_check failed');
    const references=db.prepare('PRAGMA foreign_key_check').all();
    if(references.length)throw Error('SQLite foreign_key_check failed: '+references.length);
    const version=db.prepare('SELECT MAX(version) AS version FROM schema_version').get()?.version;
    if(version!==2)throw Error('Unexpected database schema version: '+version);
    return {version,restaurants:db.prepare('SELECT COUNT(*) AS n FROM restaurants').get().n};
  }finally{db.close();}
}
export async function createBackup(db,directory){
  directory=resolve(directory);
  ensureFolder(directory);
  const name='easywine-'+randomName()+'.sqlite';
  const destination=join(directory,name),partial=destination+'.partial';
  reserve(partial);
  let committed=false;
  try{
    const pages=await backup(db,partial);
    if(pages<1)throw Error('Empty backup');
    const verification=verifySnapshot(partial);
    chmodSync(partial,0o600);
    syncFile(partial);
    renameSync(partial,destination);
    committed=true;
    syncDirectory(directory);
    return {path:destination,name,pages,...verification};
  }finally{
    if(!committed){try{unlinkSync(partial);}catch(error){if(error.code!=='ENOENT')throw error;}}
  }
}
/** Offline restoration to a NEW DB path. Never overwrite a live WAL database. */
export function restoreToNewPath(source,target){
  source=resolve(source);target=resolve(target);
  if(source===target)throw Error('La source et la destination doivent être différentes.');
  if(statSync(source).size===0)throw Error('Sauvegarde vide.');
  const verification=verifySnapshot(source);
  const folder=dirname(target);
  ensureFolder(folder);
  const partial=join(folder,'.'+basename(target)+'.restore-'+randomUUID());
  let linked=false;
  try{
    // The temporary copy stays in the destination directory for atomic linking.
    copyFileSync(source,partial);
    chmodSync(partial,0o600);
    if(statSync(partial).size!==statSync(source).size)throw Error('Copie incomplète.');
    verifySnapshot(partial);
    syncFile(partial);
    // Hard link is atomic and fails if target already exists (no destructive overwrite).
    linkSync(partial,target);
    linked=true;
    syncDirectory(folder);
    return {path:target,...verification};
  }finally{
    try{unlinkSync(partial);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(linked)syncDirectory(folder);
  }
}
