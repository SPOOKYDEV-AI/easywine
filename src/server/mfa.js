
import {randomBytes} from 'node:crypto';
import {transaction,record,now} from './db.js';
import {issueSession,verifyPassword} from './auth.js';
import {fail} from './validation.js';
import {
  loadMfaKey,generateMfaSecret,base32,encryptMfaSecret,decryptMfaSecret,
  verifyTotp,otpAuthUri,generateRecoveryCodes,hashRecoveryCode,tokenHash
} from './mfa-crypto.js';

const CHALLENGE_MS=5*60*1000;
const ENROLLMENT_MS=10*60*1000;
const LOCK_MS=15*60*1000;
const expires=ms=>new Date(Date.now()+ms).toISOString();
const credential=(db,userId)=>db.prepare('SELECT * FROM mfa_credentials WHERE user_id=?').get(userId);
function ensureUnlocked(row){
  if(row?.locked_until&&row.locked_until>now())
    fail('Trop de tentatives MFA. Réessayez dans quelques minutes.',429);
}
function countFailure(db,row){
  const current=row.locked_until&&row.locked_until<=now()?0:row.failed_attempts;
  const attempts=Math.min(current+1,5);
  db.prepare('UPDATE mfa_credentials SET failed_attempts=?,locked_until=? WHERE user_id=?')
    .run(attempts,attempts>=5?expires(LOCK_MS):null,row.user_id);
}
function clearFailures(db,userId){
  db.prepare('UPDATE mfa_credentials SET failed_attempts=0,locked_until=NULL WHERE user_id=?').run(userId);
}
function validFactor(db,row,code,key,{allowRecovery=true}={}){
  const secret=decryptMfaSecret(row.encrypted_secret,row.user_id,key);
  try{
    const step=verifyTotp(secret,code,row.last_step);
    if(step!==null)return {type:'totp',step};
    if(allowRecovery&&row.enabled){
      const hashed=hashRecoveryCode(code);
      if(hashed&&db.prepare('SELECT 1 FROM mfa_recovery_codes WHERE user_id=? AND code_hash=?')
        .get(row.user_id,hashed))return {type:'recovery',hash:hashed};
    }
    return null;
  }finally{secret.fill(0);}
}
export function mfaStatus(db,user){
  const row=credential(db,user.id);
  const recovery=db.prepare('SELECT COUNT(*) AS n FROM mfa_recovery_codes WHERE user_id=?').get(user.id).n;
  return {enabled:!!row?.enabled,pending:!!(row&&!row.enabled&&row.pending_expires_at>now()),
    recoveryCodesRemaining:recovery};
}
export function startEnrollment(db,user,password){
  if(!verifyPassword(user,password))fail('Mot de passe actuel incorrect.',403);
  const current=credential(db,user.id);
  if(current?.enabled)fail('Second facteur déjà configuré.',409);
  const key=loadMfaKey();
  const secret=generateMfaSecret();
  let encrypted;
  try{encrypted=encryptMfaSecret(secret,user.id,key);}
  finally{key.fill(0);}
  const pending=expires(ENROLLMENT_MS);
  transaction(db,()=>{
    db.prepare(
      'INSERT INTO mfa_credentials(user_id,encrypted_secret,enabled,pending_expires_at,last_step,created_at)'+
      ' VALUES(?,?,0,?,-1,?) ON CONFLICT(user_id) DO UPDATE SET '+
      'encrypted_secret=excluded.encrypted_secret,enabled=0,pending_expires_at=excluded.pending_expires_at,'+
      'last_step=-1,failed_attempts=0,locked_until=NULL'
    ).run(user.id,encrypted,pending,now());
    db.prepare('DELETE FROM mfa_recovery_codes WHERE user_id=?').run(user.id);
    record(db,user,'mfa-start','user',user.id,undefined,{pending:true});
  });
  try{return {secret:base32(secret),uri:otpAuthUri(secret,{email:user.email,restaurant:user.restaurant_name}),expiresAt:pending};}
  finally{secret.fill(0);}
}
export function confirmEnrollment(db,user,code){
  const row=credential(db,user.id);
  if(!row||row.enabled||!row.pending_expires_at||row.pending_expires_at<=now())
    fail('Configuration MFA absente ou expirée.',409);
  ensureUnlocked(row);
  const key=loadMfaKey();
  let valid;
  try{valid=validFactor(db,row,code,key,{allowRecovery:false});}
  finally{key.fill(0);}
  if(!valid){
    transaction(db,()=>countFailure(db,row));
    fail('Code incorrect.',401);
  }
  const codes=generateRecoveryCodes();
  transaction(db,()=>{
    const updated=db.prepare(
      'UPDATE mfa_credentials SET enabled=1,pending_expires_at=NULL,last_step=?,'+
      'failed_attempts=0,locked_until=NULL WHERE user_id=? AND enabled=0 AND pending_expires_at>?'
    ).run(valid.step,user.id,now());
    if(updated.changes!==1)fail('Configuration MFA expirée ou modifiée.',409);
    db.prepare('DELETE FROM mfa_recovery_codes WHERE user_id=?').run(user.id);
    const insert=db.prepare('INSERT INTO mfa_recovery_codes(user_id,code_hash) VALUES(?,?)');
    for(const recovery of codes)insert.run(user.id,hashRecoveryCode(recovery));
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    db.prepare('DELETE FROM mfa_challenges WHERE user_id=?').run(user.id);
    record(db,user,'mfa-enabled','user',user.id,undefined,{recoveryCodesIssued:codes.length});
  });
  return {codes,sessionRevoked:true};
}
export function startMfaChallenge(db,user){
  const row=credential(db,user.id);
  if(!row?.enabled)throw Error('MFA expected for enabled user.');
  ensureUnlocked(row);
  const token=randomBytes(32).toString('base64url');
  const expiry=expires(CHALLENGE_MS);
  transaction(db,()=>{
    db.prepare('DELETE FROM mfa_challenges WHERE expires_at<=?').run(now());
    db.prepare('DELETE FROM mfa_challenges WHERE user_id=?').run(user.id);
    db.prepare('INSERT INTO mfa_challenges(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)')
      .run(tokenHash(token),user.id,expiry,now());
  });
  return {mfaRequired:true,challenge:token,expiresAt:expiry};
}
export function verifyMfaChallenge(db,token,code){
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token)||
     typeof code!=='string'||code.length>64)
    fail('Code ou défi invalide.',401);
  const outcome=transaction(db,()=>{
    const user=db.prepare(
      'SELECT u.*,r.slug,r.name AS restaurant_name,c.attempts,c.expires_at '+
      'FROM mfa_challenges c JOIN users u ON u.id=c.user_id '+
      'JOIN restaurants r ON r.id=u.restaurant_id '+
      'WHERE c.token_hash=? AND c.expires_at>? AND u.active=1'
    ).get(tokenHash(token),now());
    if(!user||user.attempts>=5)return {invalid:true};
    const row=credential(db,user.id);
    if(!row?.enabled)return {invalid:true};
    ensureUnlocked(row);
    const key=loadMfaKey();
    let factor;
    try{factor=validFactor(db,row,code,key);}
    finally{key.fill(0);}
    if(!factor){
      db.prepare('UPDATE mfa_challenges SET attempts=attempts+1 WHERE token_hash=?').run(tokenHash(token));
      countFailure(db,row);
      return {invalid:true};
    }
    if(factor.type==='recovery'){
      const deleted=db.prepare('DELETE FROM mfa_recovery_codes WHERE user_id=? AND code_hash=?')
        .run(user.id,factor.hash);
      if(deleted.changes!==1)return {invalid:true};
    }else{
      const updated=db.prepare(
        'UPDATE mfa_credentials SET last_step=? WHERE user_id=? AND last_step<?'
      ).run(factor.step,user.id,factor.step);
      if(updated.changes!==1)return {invalid:true};
    }
    clearFailures(db,user.id);
    db.prepare('DELETE FROM mfa_challenges WHERE user_id=?').run(user.id);
    return {session:issueSession(db,user,{insideTransaction:true})};
  });
  if(outcome.invalid)fail('Code ou défi MFA incorrect ou expiré.',401);
  return outcome.session;
}
export function disableMfa(db,user,password,code){
  if(!verifyPassword(user,password))fail('Mot de passe actuel incorrect.',403);
  const row=credential(db,user.id);
  if(!row?.enabled)fail('Aucun second facteur actif.',409);
  ensureUnlocked(row);
  const key=loadMfaKey();
  let factor;
  try{factor=validFactor(db,row,code,key);}
  finally{key.fill(0);}
  if(!factor){
    transaction(db,()=>countFailure(db,row));
    fail('Code incorrect.',401);
  }
  transaction(db,()=>{
    db.prepare('DELETE FROM mfa_challenges WHERE user_id=?').run(user.id);
    db.prepare('DELETE FROM mfa_recovery_codes WHERE user_id=?').run(user.id);
    db.prepare('DELETE FROM mfa_credentials WHERE user_id=?').run(user.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
    record(db,user,'mfa-disabled','user',user.id,undefined,{sessionRevoked:true});
  });
  return {disabled:true};
}
