import test from 'node:test';import assert from 'node:assert/strict';
import {planPrimalChampion,primalChampionOrigin,validatePrimalChampionOrigin} from '../server/class-primal-champion.mjs';
const stats=(str=20,con=20)=>({abilities:{str,dex:14,con,int:8,wis:12,cha:10},armorClass:16,initiative:2,speed:40});
const plan=(values=stats(),extra={})=>planPrimalChampion({classId:'barbarian',fromLevel:19,toLevel:20,stats:values,...extra});
test('Primal Champion plans +4 STR/CON through24 and retroactive HP without touching manual AC, initiative or speed',()=>{
 const input=stats(),before=structuredClone(input),r=plan(input);assert.deepEqual(input,before);assert.equal(r.applied,false);assert.deepEqual(r.origin.before,{str:20,con:20});assert.deepEqual(r.origin.after,{str:24,con:24});assert.deepEqual(r.origin.maximum,{str:24,con:24});assert.deepEqual(r.characterStats,{...before,abilities:{...before.abilities,str:24,con:24}});assert.equal(r.hitPoints.fromLevel,14);assert.equal(r.hitPoints.retroactive,38);assert.equal(r.hitPoints.maximumDelta,52);assert.equal(r.unlimitedRage.unlimited,true);assert.equal(Object.hasOwn(r.unlimitedRage,'max'),false);assert.equal(Object.hasOwn(r,'state'),false);
});
test('Primal Champion respects odd/negative Constitution modifiers and the minimum-one new-level HP on rolled dice',()=>{
 assert.equal(plan(stats(8,14)).hitPoints.maximumDelta,49);assert.equal(plan(stats(19,19)).characterStats.abilities.con,23);assert.equal(plan(stats(19,19)).hitPoints.maximumDelta,51);const low=plan(stats(1,1),{hpMethod:'roll',hpRoll:1});assert.equal(low.hitPoints.fromLevel,1);assert.equal(low.hitPoints.retroactive,38);assert.equal(low.hitPoints.maximumDelta,39);assert.equal(plan(stats(),{hpMethod:'roll',hpRoll:12}).hitPoints.maximumDelta,57);
});
test('Primal Champion rejects ambiguous scores, duplicate levels and forged source/cap without mutating inputs',()=>{
 for(const extra of [{classId:'fighter'},{fromLevel:18},{toLevel:19},{fromLevel:20,toLevel:21},{hpMethod:'roll',hpRoll:13}])assert.throws(()=>plan(stats(),extra));for(const score of [0,21,24,30,14.5,'20']){assert.throws(()=>plan(stats(score,20)));assert.throws(()=>plan(stats(20,score)));}
 const o=primalChampionOrigin({str:20,con:14});assert.deepEqual(validatePrimalChampionOrigin(o),o);for(const edit of [r=>r.sourcePage=10,r=>r.after.con=24,r=>r.maximum.con=30,r=>r.acquiredLevel=19,r=>r.extra=true]){const bad=structuredClone(o);edit(bad);assert.throws(()=>validatePrimalChampionOrigin(bad));}const copy=validatePrimalChampionOrigin(o);copy.before.str=8;assert.equal(o.before.str,20);
});
