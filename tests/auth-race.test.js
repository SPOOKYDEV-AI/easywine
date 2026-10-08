
import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../src/server/db.js';
import {bootstrap} from '../src/server/bootstrap.js';
import {signIn,passwordRecord} from '../src/server/auth.js';

test('a password reset while asynchronous scrypt runs must not create a session',async()=>{
 const db=openDatabase(':memory:');
 try{
  const owner=bootstrap(db,{slug:'race-password',name:'Test',email:'owner@example.fr',owner:'Owner',
   password:'Strong-Initial-Password-2026!'});
  const pending=signIn(db,{slug:'race-password',email:'owner@example.fr',
   password:'Strong-Initial-Password-2026!'});
  const reset=passwordRecord('Changed-Password-2026!');
  db.prepare('UPDATE users SET salt=?,password_hash=? WHERE id=?')
   .run(reset.salt,reset.passwordHash,owner.userId);
  const session=await pending;
  assert.equal(session,null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,0);
 }finally{db.close();}
});
test('an account disabled while its password is checking cannot obtain a session',async()=>{
 const db=openDatabase(':memory:');
 try{
  const owner=bootstrap(db,{slug:'race-active',name:'Test',email:'owner@example.fr',owner:'Owner',
   password:'Strong-Initial-Password-2026!'});
  const pending=signIn(db,{slug:'race-active',email:'owner@example.fr',
   password:'Strong-Initial-Password-2026!'});
  db.prepare('UPDATE users SET active=0 WHERE id=?').run(owner.userId);
  assert.equal(await pending,null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n,0);
 }finally{db.close();}
});
