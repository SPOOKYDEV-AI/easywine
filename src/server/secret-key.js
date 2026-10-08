
import {readFileSync,openSync,closeSync,fstatSync,constants} from 'node:fs';
import {resolve} from 'node:path';

export function parseHexKey(value,label){
  if(typeof value!=='string'||!/^[a-fA-F0-9]{64}$/.test(value))
    throw Error(label+' doit contenir exactement 64 caractères hexadécimaux (32 octets).');
  return Buffer.from(value,'hex');
}
export function readSecretKey(envName,fileEnvName){
  const inline=process.env[envName],filename=process.env[fileEnvName];
  if(Boolean(inline)===Boolean(filename))
    throw Error('Configurez uniquement '+envName+' ou '+fileEnvName+'.');
  if(inline)return parseHexKey(inline,envName);
  const fd=openSync(resolve(filename),constants.O_RDONLY | (constants.O_NOFOLLOW||0));
  try{
    const info=fstatSync(fd);
    if(!info.isFile()||info.size===0||info.size>256)
      throw Error('Fichier de clé non valide.');
    if(process.platform!=='win32'&&(info.mode&0o077)!==0)
      throw Error('Le fichier de clé doit être privé (chmod 600).');
    return parseHexKey(readFileSync(fd,'utf8').trim(),envName);
  }finally{closeSync(fd);}
}
