import test from 'node:test';
import assert from 'node:assert/strict';
import {viewFromHash,knownViews} from '../public/navigation.js';

test('URL navigation uses fixed allowlist with no data or secret in history',()=>{
 assert.equal(knownViews.size,7);
 assert.equal(viewFromHash('#/service'),'service');
 assert.equal(viewFromHash('#/wines'),'wines');
 assert.equal(viewFromHash('#/account'),'account');
 for(const value of ['#/unknown','#/admin','/service','#/wines%0A','#/wines?secret=token','#/../stats','#/stats/']){
  assert.equal(viewFromHash(value),null,value);
 }
});
