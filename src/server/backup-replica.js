
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,createWriteStream,mkdirSync,lstatSync,realpathSync,
  openSync,closeSync,fsyncSync,linkSync,unlinkSync,statSync} from 'node:fs';
import {basename,dirname,join,resolve} from 'node:path';
import {pipeline} from 'node:stream/promises';

const remove=file=>{
 try{unlinkSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}
};
function syncPath(file){
 // Windows FlushFileBuffers requires a write-capable file handle.
 const fd=openSync(file,process.platform==='win32'?'r+':'r');
 try{fsyncSync(fd);}finally{closeSync(fd);}
}
function syncDirectory(folder){
 try{syncPath(folder);}
 catch(error){if(!['EINVAL','EPERM','EISDIR','ENOTSUP','EACCES'].includes(error.code))throw error;}
}
async function checksum(file){
 const sha=createHash('sha256');
 for await(const chunk of createReadStream(file))sha.update(chunk);
 return sha.digest('hex');
}
/**
 * Copy an already verified encrypted backup to an independently configured
 * directory. Publish by exclusive hardlink only after integrity validation.
 * A replica failure never deletes or modifies the source archive.
 */
export async function replicateEncryptedBackup(source,destinationDirectory){
 source=resolve(source);
 const sourceInfo=lstatSync(source);
 if(!sourceInfo.isFile()||sourceInfo.size===0)throw Error('Archive source invalide.');
 const name=basename(source);
 if(!/^easywine-[0-9A-Za-z-]+\.ewb$/.test(name))
  throw Error('Nom de sauvegarde non reconnu.');
 const dir=resolve(destinationDirectory);
 mkdirSync(dir,{recursive:true,mode:0o700});
 if(realpathSync(dirname(source))===realpathSync(dir))
  throw Error('La destination doit être différente du dossier de sauvegarde initial.');
 const destination=join(dir,name);
 const partial=join(dir,'.'+name+'.copy-'+randomUUID());
 try{
  await pipeline(createReadStream(source),createWriteStream(partial,{flags:'wx',mode:0o600}));
  const copied=statSync(partial);
  if(copied.size!==sourceInfo.size)throw Error('Copie incomplète.');
  const sourceSha=await checksum(source),copySha=await checksum(partial);
  if(sourceSha!==copySha)throw Error('Empreintes de sauvegarde différentes.');
  syncPath(partial);
  // Exclusive atomic publication. Even a competing scheduler cannot overwrite.
  linkSync(partial,destination);
  syncDirectory(dir);
  return {path:destination,sha256:copySha,bytes:copied.size};
 }finally{remove(partial);}
}
