import test from 'node:test';import assert from 'node:assert/strict';
import {rangerEnemySelection,advanceRangerHistory,validateRangerHistory} from '../server/class-ranger-history.mjs';
const enemy=(id,language={mode:'none'})=>({enemy:{kind:'type',id},language,rulesConfirmed:true});
const pair=(a,b)=>({enemy:{kind:'humanoids',races:[a,b]},language:{mode:'spoken',name:'Орочий'},rulesConfirmed:true});
const initial=()=>advanceRangerHistory(6,{terrain:{previousId:'forest',id:'swamp'},enemy:{previous:enemy('beasts'),current:pair('Орки','Гноллы')}});
test('ranger explicitly confirms prior choices and records new grants at6/10/14 without backdating',()=>{
 const six=initial();assert.equal(six.enemies[0].acquiredLevel,null);assert.equal(six.enemies[0].confirmedAt,6);assert.equal(six.enemies[1].acquiredLevel,6);assert.deepEqual(six.enemies[1].enemy.races,['Гноллы','Орки']);
 const saved=structuredClone(six),ten=advanceRangerHistory(10,{terrain:{id:'coast'}},six);assert.deepEqual(six,saved);const fourteen=advanceRangerHistory(14,{enemy:{current:enemy('dragons',{mode:'spoken',name:'Драконий'})}},ten);assert.deepEqual(validateRangerHistory(fourteen,20),fourteen);assert.equal(fourteen.terrains.length,3);assert.equal(fourteen.enemies.length,3);
});
test('enemy language is explicit and manual rules confirmation is mandatory',()=>{
 for(const selection of [enemy('humanoids'),{...enemy('beasts'),rulesConfirmed:false},{...enemy('beasts'),language:null},pair('Орки',' орки '),pair('<эльф>','Орк'),{...enemy('beasts'),extra:1},{...enemy('beasts'),language:{mode:'none',name:'Общий'}}])assert.throws(()=>rangerEnemySelection(selection));
 assert.equal(rangerEnemySelection(enemy('beasts')).language.mode,'none');assert.equal(rangerEnemySelection(enemy('dragons',{mode:'spoken',name:' Драконий '})).language.name,'Драконий');
});
test('duplicate enemies, duplicate terrains, missing history and wrong dates cannot pass',()=>{
 const six=initial();assert.throws(()=>advanceRangerHistory(10,{terrain:{id:'forest'}},six));assert.throws(()=>advanceRangerHistory(14,{enemy:{current:enemy('beasts')}},six));const ten=advanceRangerHistory(10,{terrain:{id:'coast'}},six);assert.throws(()=>advanceRangerHistory(14,{enemy:{current:pair('Орки','Эльфы')}},ten));
 for(const change of [v=>v.enemies[0].acquiredLevel=1,v=>v.enemies[1].sourcePage=36,v=>v.enemies[0].rulesConfirmed=false,v=>v.terrains.pop(),v=>v.extra=true]){const bad=structuredClone(six);change(bad);assert.throws(()=>validateRangerHistory(bad,6));}
 assert.throws(()=>advanceRangerHistory(10,{terrain:{id:'coast'}},null));assert.throws(()=>advanceRangerHistory(7,{terrain:{id:'coast'}},six));
});
