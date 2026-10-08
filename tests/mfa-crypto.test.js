
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {
  totpAt,verifyTotp,base32,encryptMfaSecret,decryptMfaSecret,
  generateRecoveryCodes,hashRecoveryCode
} from '../src/server/mfa-crypto.js';

test('RFC6238 SHA1 reference, time drift and replay guard',()=>{
 const secret=Buffer.from('12345678901234567890');
 assert.equal(totpAt(secret,59000),'287082'); // 94287082 truncated to 6 digits
 assert.equal(verifyTotp(secret,'287082',-1,59000),1);
 assert.equal(verifyTotp(secret,'287082',1,59000),null);
 assert.equal(verifyTotp(secret,'287082',-1,89000),1);
 assert.equal(verifyTotp(secret,'287082',-1,119000),null);
 assert.equal(verifyTotp(secret,'sixdigits',-1,59000),null);
});
test('secrets are authenticated and bound to their owner',()=>{
 const secret=randomBytes(20),key=randomBytes(32);
 const encrypted=encryptMfaSecret(secret,'user-one',key);
 assert.notEqual(encrypted,secret.toString('base64'));
 assert.deepEqual(decryptMfaSecret(encrypted,'user-one',key),secret);
 assert.throws(()=>decryptMfaSecret(encrypted,'user-two',key));
 assert.throws(()=>decryptMfaSecret(encrypted,'user-one',randomBytes(32)));
 const damaged=Buffer.from(encrypted,'base64');damaged[damaged.length-1]^=0x01;
 assert.throws(()=>decryptMfaSecret(damaged.toString('base64'),'user-one',key));
 assert.equal(base32(secret).length,32);
 key.fill(0);secret.fill(0);
});
test('recovery codes are random high-entropy identifiers and normalized safely',()=>{
 const codes=generateRecoveryCodes();
 assert.equal(codes.length,8);
 assert.equal(new Set(codes).size,8);
 for(const code of codes){
  assert.match(code,/^[A-F0-9]{8}(?:-[A-F0-9]{8}){3}$/);
  assert.equal(hashRecoveryCode(code),hashRecoveryCode(code.toLowerCase().replaceAll('-','')));
 }
 assert.equal(hashRecoveryCode('123456'),null);
 assert.notEqual(hashRecoveryCode(codes[0]),hashRecoveryCode(codes[1]));
});
