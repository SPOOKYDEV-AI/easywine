
import {backup} from 'node:sqlite';
import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {createReadStream,createWriteStream,mkdirSync,mkdtempSync,
  readSync,openSync,closeSync,statSync,writeFileSync,appendFileSync,
  fsyncSync,renameSync,unlinkSync,rmSync} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {verifySnapshot,restoreToNewPath} from './maintenance.js';
import {parseHexKey,readSecretKey} from './secret-key.js';

const MAGIC=Buffer.from('EWBACK01','ascii');
const HEADER_BYTES=MAGIC.length+12;
const TAG_BYTES=16;
const MAX_CIPHERTEXT=10*1024*1024*1024;
const tempDir=()=>mkdtempSync(join(tmpdir(),'easywine-private-'));
const cleanup=file=>{try{unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}};
function syncFile(path){
  // Windows fsyncSync requires a write-capable file handle (FlushFileBuffers).
  const fd=openSync(path,process.platform==='win32'?'r+':'r');
  try{fsyncSync(fd);}finally{closeSync(fd);}
}
function syncDir(dir){
  try{const fd=openSync(dir,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
  catch(error){if(!['EINVAL','EPERM','EACCES','EISDIR','ENOTSUP'].includes(error.code))throw error;}
}
export const loadBackupKey=()=>readSecretKey('EASYWINE_BACKUP_KEY','EASYWINE_BACKUP_KEY_FILE');
export const backupKey=(value=process.env.EASYWINE_BACKUP_KEY)=>parseHexKey(value,'EASYWINE_BACKUP_KEY');
/**
 * EWB 01 wire format: 8 byte ASCII version, 12 byte random GCM IV,
 * ciphertext, 16 byte GCM tag. One independent authenticated key per backup.
 * Files are always completed under an exclusive staging name before publishing.
 */
export async function createEncryptedBackup(db,destinationDirectory,key){
  if(!Buffer.isBuffer(key)||key.length!==32)throw Error('Clé AES-256 invalide.');
  const folder=resolve(destinationDirectory);
  mkdirSync(folder,{recursive:true,mode:0o700});
  const temporary=tempDir();
  const plain=join(temporary,'snapshot.sqlite');
  const name='easywine-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID()+'.ewb';
  const destination=join(folder,name),staging=destination+'.partial';
  let published=false;
  try{
    const pages=await backup(db,plain);
    if(pages<1)throw Error('Sauvegarde SQLite vide.');
    const verified=verifySnapshot(plain);
    const iv=randomBytes(12);
    const cipher=createCipheriv('aes-256-gcm',key,iv);
    writeFileSync(staging,Buffer.concat([MAGIC,iv]),{flag:'wx',mode:0o600});
    await pipeline(createReadStream(plain),cipher,createWriteStream(staging,{flags:'a'}));
    appendFileSync(staging,cipher.getAuthTag());
    syncFile(staging);
    // Verify that the finished encrypted file can be decrypted and opened.
    const inspection=join(temporary,'verified.sqlite');
    await decryptSnapshot(staging,inspection,key);
    const checked=verifySnapshot(inspection);
    if(checked.version!==verified.version||checked.restaurants!==verified.restaurants)
      throw Error('La vérification du chiffrement a échoué.');
    renameSync(staging,destination);
    published=true;
    syncDir(folder);
    return {path:destination,name,pages,...verified,encrypted:true};
  }finally{
    if(!published)cleanup(staging);
    rmSync(temporary,{recursive:true,force:true});
  }
}
export async function decryptSnapshot(source,destination,key){
  if(!Buffer.isBuffer(key)||key.length!==32)throw Error('Clé AES-256 invalide.');
  source=resolve(source);destination=resolve(destination);
  const size=statSync(source).size;
  if(size<HEADER_BYTES+TAG_BYTES+1||size>MAX_CIPHERTEXT)
    throw Error('Taille de sauvegarde chiffrée invalide.');
  const fd=openSync(source,'r');
  let header,tag;
  try{
    header=Buffer.alloc(HEADER_BYTES);tag=Buffer.alloc(TAG_BYTES);
    if(readSync(fd,header,0,HEADER_BYTES,0)!==HEADER_BYTES ||
       readSync(fd,tag,0,TAG_BYTES,size-TAG_BYTES)!==TAG_BYTES)
      throw Error('Sauvegarde chiffrée tronquée.');
  }finally{closeSync(fd);}
  if(!header.subarray(0,MAGIC.length).equals(MAGIC))
    throw Error('Format de sauvegarde non reconnu.');
  const iv=header.subarray(MAGIC.length);
  const decipher=createDecipheriv('aes-256-gcm',key,iv);
  decipher.setAuthTag(tag);
  const target=createWriteStream(destination,{flags:'wx',mode:0o600});
  try{
    await pipeline(createReadStream(source,{start:HEADER_BYTES,end:size-TAG_BYTES-1}),decipher,target);
    syncFile(destination);
  }catch(error){
    cleanup(destination);
    if(error.code==='ERR_OSSL_EVP_BAD_DECRYPT'||/auth|authenticate/i.test(error.message))
      throw Error('Clé incorrecte ou sauvegarde altérée.');
    throw error;
  }
}
/** A complete authenticated decryption is mandatory BEFORE publication. */
export async function restoreEncryptedBackup(source,target,key){
  source=resolve(source);target=resolve(target);
  if(source===target)throw Error('Source et destination identiques.');
  const temporary=tempDir();
  try{
    const plain=join(temporary,'snapshot.sqlite');
    await decryptSnapshot(source,plain,key);
    return restoreToNewPath(plain,target);
  }finally{
    rmSync(temporary,{recursive:true,force:true});
  }
}
