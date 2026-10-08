
import test from 'node:test';
import assert from 'node:assert/strict';
import {compatibility,recommend} from '../src/core/pairing.js';

const dish={id:'d',name:'Canard rôti',intensity:4,richness:4,acidity:3,aromatic:3,spice:1};
const makeWine=(id,priceCents,other={})=>({
 id,producer:'Domaine',cuvee:id,vintage:'2023',body:4,acidity:4,tannin:3,
 aromatic:3,color:'rouge',tags:[],stock:2,active:true,priceCents,...other
});
test('price and prestige do not affect compatibility',()=>{
 const cheap=makeWine('c',4200),expensive=makeWine('e',99000);
 assert.equal(compatibility(dish,cheap),compatibility(dish,expensive));
});
test('stock, active status, forbidden pairings and color are hard filters',()=>{
 const wines=[makeWine('a',4200,{stock:0}),makeWine('b',7500,{active:false}),
  makeWine('c',8200),makeWine('d',9000,{color:'blanc'})];
 const result=recommend({dish,wines,color:'rouge',blockedWineIds:['c']});
 assert.equal(result.length,0);
 assert.deepEqual(recommend({dish,wines,color:'blanc'}).map(x=>x.wine.id),['d']);
});
test('a customer preference can override the house style',()=>{
 const strong=makeWine('strong',8500),light=makeWine('light',6500,{body:1,acidity:5,tannin:1});
 const noPreference=recommend({dish,wines:[strong,light],limit:1});
 const freshLight=recommend({dish,wines:[strong,light],styles:['leger','frais'],limit:2});
 assert.equal(noPreference[0].wine.id,'strong');
 assert.ok(freshLight.some(x=>x.wine.id==='light'));
 assert.ok(freshLight.find(x=>x.wine.id==='light').score>0);
});
test('unbounded prices offer distinct price levels where compatible',()=>{
 const wines=[makeWine('a',4500),makeWine('b',6900),makeWine('c',10500),
  makeWine('d',15500),makeWine('e',25000)];
 const result=recommend({dish,wines,diversifyPrices:true});
 assert.equal(result.length,3);
 assert.ok(result[0].wine.priceCents<result[1].wine.priceCents);
 assert.ok(result[1].wine.priceCents<result[2].wine.priceCents);
});
test('budget constraints filter only and never change a wine score',()=>{
 const wine=makeWine('a',8500);
 const a=recommend({dish,wines:[wine]});
 const b=recommend({dish,wines:[wine],minPriceCents:8000,maxPriceCents:10000});
 assert.equal(a[0].score,b[0].score);
 assert.deepEqual(recommend({dish,wines:[wine],maxPriceCents:7000}),[]);
});
