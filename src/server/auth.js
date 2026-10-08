
import {randomBytes,scrypt,scryptSync,createHash,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {id,now,transaction} from './db.js';

const SESSION_MS=12*60*60*1000;
const hashToken=token=>createHash('sha256').update(token).digest('hex');
const makeHash=(password,salt)=>scryptSync(password,Buffer.from(salt,'hex'),64).toString('hex');
const scryptAsync=promisify(scrypt);
const makeHashAsync=async(password,salt)=>(await scryptAsync(password,Buffer.from(salt,'hex'),64)).toString('hex');
const dummySalt='00112233445566778899aabbccddeeff';
const dummyHash=makeHash('unknown-password',dummySalt);

export function passwordRecord(password){
  if(typeof password!=='string'||password.length<12||Buffer.byteLength(password)>1024)
    throw new Error('Le mot de passe doit comporter entre 12 et 1024 octets.');
  const salt=randomBytes(16).toString('hex');
  return {salt,passwordHash:makeHash(password,salt)};
}
export function verifyPassword(user,password){
  if(typeof password!=='string'||Buffer.byteLength(password)>1024)return false;
  const actual=makeHash(password,user?.salt??dummySalt);
  const expected=user?.password_hash??dummyHash;
  return timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex'))&&!!user;
}
export function createUser(db,{restaurantId,name,email,role,password}){
  if(!['owner','manager','staff'].includes(role))throw new Error('Rôle invalide');
  const secret=passwordRecord(password),userId=id();
  db.prepare('INSERT INTO users(id,restaurant_id,email,name,role,salt,password_hash,created_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(userId,restaurantId,email.trim().toLowerCase(),name,role,secret.salt,secret.passwordHash,now());
  return userId;
}
export async function signIn(db,{slug,email,password}){
  const user=db.prepare(
    'SELECT u.*,r.slug,r.name AS restaurant_name FROM users u JOIN restaurants r ON r.id=u.restaurant_id WHERE r.slug=? AND u.email=? AND u.active=1'
  ).get(slug,email.trim());
  // Unknown accounts take the same expensive derivation path as real accounts.
  // Async scrypt prevents login attempts from blocking all service requests.
  if(typeof password!=='string'||Buffer.byteLength(password)>1024)return null;
  const actual=await makeHashAsync(password,user?.salt??dummySalt);
  const expected=user?.password_hash??dummyHash;
  if(!timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex'))||!user)return null;
  const mfa=db.prepare('SELECT enabled FROM mfa_credentials WHERE user_id=?').get(user.id);
  if(mfa?.enabled)return {mfaUser:user}; // No authenticated session until second factor
  return issueSession(db,user);
}
export function issueSession(db,user,{insideTransaction=false}={}){
  const token=randomBytes(32).toString('base64url');
  const expiresAt=new Date(Date.now()+SESSION_MS).toISOString();
  const save=()=>{
    db.prepare('DELETE FROM sessions WHERE expires_at<?').run(now());
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
      .run(hashToken(token),user.id,expiresAt);
  };
  if(insideTransaction)save();
  else transaction(db,save);
  return {token,expiresAt,user:publicUser(user)};
}
export function publicUser(user){
  return {id:user.id,restaurantId:user.restaurant_id,restaurantName:user.restaurant_name,
    slug:user.slug,name:user.name,email:user.email,role:user.role};
}
export function getUser(db,cookie){
  const raw=(cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('ew_session='));
  if(!raw)return null;
  const token=raw.slice('ew_session='.length);
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
  return db.prepare(
    'SELECT u.*,r.slug,r.name AS restaurant_name FROM sessions s JOIN users u ON u.id=s.user_id JOIN restaurants r ON r.id=u.restaurant_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1'
  ).get(hashToken(token),now())||null;
}
export function logout(db,cookie){
  const raw=(cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('ew_session='));
  if(raw)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(raw.slice(11)));
}
export function cookieFor(token,secure=false){
  return 'ew_session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200'+(secure?'; Secure':'');
}
export function expiredCookie(secure=false){
  return 'ew_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'+(secure?'; Secure':'');
}
