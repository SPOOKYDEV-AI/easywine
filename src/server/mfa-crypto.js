
import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {readSecretKey} from './secret-key.js';

const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const loadMfaKey=()=>readSecretKey('EASYWINE_MFA_KEY','EASYWINE_MFA_KEY_FILE');
export const generateMfaSecret=()=>randomBytes(20);
export function base32(bytes){
  let value=0,bits=0,out='';
  for(const byte of bytes){
    value=(value<<8)|byte;
    bits+=8;
    while(bits>=5){out+=ALPHABET[(value>>(bits-=5))&31];}
  }
  if(bits>0)out+=ALPHABET[(value<<(5-bits))&31];
  return out;
}
export function totpAt(secret,time=Date.now()){
  if(!Buffer.isBuffer(secret)||secret.length<16)throw Error('Secret TOTP invalide.');
  const step=Math.floor(time/30000);
  const counter=Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hash=createHmac('sha1',secret).update(counter).digest();
  const offset=hash[hash.length-1]&0x0f;
  const value=(hash.readUInt32BE(offset)&0x7fffffff)%1000000;
  return String(value).padStart(6,'0');
}
export function verifyTotp(secret,code,lastStep=-1,time=Date.now()){
  if(typeof code!=='string'||!/^[0-9]{6}$/.test(code))return null;
  for(const offset of [0,-1,1]){
    const step=Math.floor(time/30000)+offset;
    if(step<=lastStep||step<0)continue;
    const expected=totpAt(secret,step*30000);
    if(timingSafeEqual(Buffer.from(code,'ascii'),Buffer.from(expected,'ascii')))return step;
  }
  return null;
}
export function encryptMfaSecret(secret,userId,key){
  if(!Buffer.isBuffer(key)||key.length!==32)throw Error('Clé MFA invalide.');
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from('easywine-mfa:'+userId));
  const cipherText=Buffer.concat([cipher.update(secret),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),cipherText]).toString('base64');
}
export function decryptMfaSecret(encrypted,userId,key){
  if(!Buffer.isBuffer(key)||key.length!==32)throw Error('Clé MFA invalide.');
  const payload=Buffer.from(encrypted,'base64');
  if(payload.length!==48)throw Error('Format de secret MFA non reconnu.');
  const decipher=createDecipheriv('aes-256-gcm',key,payload.subarray(0,12));
  decipher.setAAD(Buffer.from('easywine-mfa:'+userId));
  decipher.setAuthTag(payload.subarray(12,28));
  const secret=Buffer.concat([decipher.update(payload.subarray(28)),decipher.final()]);
  if(secret.length!==20)throw Error('Secret MFA corrompu.');
  return secret;
}
export const tokenHash=token=>createHash('sha256').update(token).digest('hex');
export function generateRecoveryCodes(count=8){
  return Array.from({length:count},()=>{
    const raw=randomBytes(16).toString('hex').toUpperCase();
    return raw.match(/.{1,8}/g).join('-');
  });
}
export function hashRecoveryCode(input){
  if(typeof input!=='string')return null;
  const canonical=input.toUpperCase().replaceAll('-','').replaceAll(' ','');
  if(!/^[A-F0-9]{32}$/.test(canonical))return null;
  return tokenHash('easywine-recovery:'+canonical);
}
export function otpAuthUri(secret,{email,restaurant}){
  const issuer='EasyWine';
  const label=encodeURIComponent(issuer+':'+restaurant+' / '+email);
  return 'otpauth://totp/'+label+'?secret='+base32(secret)+'&issuer='+encodeURIComponent(issuer)+
    '&algorithm=SHA1&digits=6&period=30';
}
