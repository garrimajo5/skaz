import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore} from '../server/store.mjs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const read=n=>JSON.parse(readFileSync(new URL('../catalog/'+n+'.json',import.meta.url),'utf8'));
const pack=read('srd51-night-fiends'),manifest=read('srd51-night-fiends.coverage'),ids=new Set(pack.entries.map(e=>e.id));
test('selected Night Hag and Nightmare keep source statistics, provenance and valid spell links',()=>{
 const all=validateCatalog(bundledCatalog().bundle),cards=validateCatalog(pack);
 const expected=[['medium',17,112,{walk:30},[18,15,16,16,14,16],'5',1800],['large',13,68,{walk:60,fly:90},[18,15,16,10,13,15],'3',700]];
 assert.equal(manifest.expectedSubsetCount,2);assert.equal(manifest.completeGameCatalog,false);
 for(const [i,e]of cards.entries()){const m=e.monster;assert.equal(m.type,'fiend');assert.deepEqual([m.size,m.armorClass,m.hitPoints,m.speed,Object.values(m.abilities),m.challenge,m.xp],expected[i]);assert.equal(e.ruleset,'5e-2014');assert.equal(e.source.usage,'cc-by-4.0');assert.equal(e.source.url,manifest.sourceUrl+'#page='+manifest.entries[i].pages[0]);for(const id of e.links)assert.ok(all.some(x=>x.id===id),id);assert.equal(all.filter(x=>x.name.en===e.name.en).length,1);}
});
test('Night Hag retains silver exception, spell attack, self-only shift and conditional hour-long haunting',()=>{
 const text=pack.entries[0].text;
 for(const value of ['не совершённых посеребрённым оружием','атака заклинанием +6','2 раза в день каждое — plane shift только на себя','Когти только в форме карги','снаряжение не превращается','требует имеющегося у карги сердечного камня','отдельное действие','только после хотя бы 1 часа','максимум хитов уменьшается на 5 (1d10)','только если цель была злой','greater restoration'])assert.ok(text.includes(value),value);
 assert.equal(manifest.innateSpellcastingChecks[0].spellAttackBonus,6);
 assert.deepEqual(manifest.innateSpellcastingChecks[0].groups.map(g=>g.usesPerDay),[null,2]);
 assert.equal(manifest.innateSpellcastingChecks[0].groups[1].spells[0].target,'self');
});
test('Nightmare grants rider resistance and ethereal stride includes three willing nearby creatures',()=>{
 const text=pack.entries[1].text;for(const value of ['сопротивление, не иммунитет','до трёх согласных существ в пределах 5 футов','не заклинание plane shift','суточный лимит в данном блоке не указан','13 (2d8 + 4)','7 (2d6)'])assert.ok(text.includes(value),value);assert.equal(pack.entries[1].links.length,0);
});
test('night fiends install atomically and repeat without altering old cards, game or history',()=>{
 const s=openStore(':memory:');try{const old=bundledCatalog().bundle.entries.filter(e=>!ids.has(e.id));s.catalog.importEntries({schemaVersion:1,entries:old},{apply:true});const before=s.read(),history=s.history(),p=s.catalog.previewBundled();assert.equal(p.added,2);assert.equal(p.updated,0);s.catalog.installBundled({version:p.version});assert.equal(s.catalog.importEntries(pack,{apply:true}).unchanged,2);assert.equal(s.catalog.previewBundled().added,0);for(const e of validateCatalog({schemaVersion:1,entries:old}))assert.deepEqual(s.catalog.lookup(new URLSearchParams({id:e.id})).entry,e);assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),history);}finally{s.close();}
});
test('personal night fiend conflict preserves local text and prevents partial bundled install',()=>{
 const s=openStore(':memory:');try{const own=structuredClone(pack.entries[0]);own.text+=' Личная версия';s.catalog.importEntries({schemaVersion:1,entries:[...bundledCatalog().bundle.entries.filter(e=>!ids.has(e.id)),own]},{apply:true});const before=s.read(),count=s.catalog.coverage().total;assert.throws(()=>s.catalog.previewBundled(),{status:409});assert.throws(()=>s.catalog.installBundled({version:bundledCatalog().version}),{status:409});assert.equal(s.catalog.coverage().total,count);assert.equal(s.catalog.lookup(new URLSearchParams({id:own.id})).entry.text,own.text);assert.equal(s.catalog.search(new URLSearchParams({q:'Nightmare'})).total,0);assert.deepEqual(s.read(),before);}finally{s.close();}
});

test('fiend source headings keep canonical identity and never expose conflicting personal cards',()=>{
 const s=openStore(':memory:');try{
  const own=structuredClone(pack.entries[0]);own.id='srd51:2014:monster:balor';own.name={ru:'СЕКРЕТНОЕ ЛИЧНОЕ ИМЯ',en:'PRIVATE_BALOR'};own.text='PRIVATE_FIEND_BODY';own.links=[];
  s.catalog.importEntries({schemaVersion:1,entries:[own]},{apply:true});const c=s.read().context;s.access.apply({action:'bootstrap-owner',userId:'fiend-reader',displayName:'Тест',campaignId:c.campaignId,characterId:c.characterId});
  for(const catalog of [s.catalog,s.forUser('fiend-reader','fiend-window').catalog]){const inv=catalog.creatureInventory(),balor=inv.entries.find(e=>e.id===own.id);assert.deepEqual(balor,{id:own.id,nameEn:'Balor',page:270,monsterType:'fiend',nameRu:'Балор',status:catalog===s.catalog?'conflict':'prepared'});assert.doesNotMatch(JSON.stringify(inv),/СЕКРЕТНОЕ|PRIVATE_BALOR|PRIVATE_FIEND_BODY/);assert.deepEqual(catalog.coverage().scopes.srd51CreatureTypes.fiend,{expected:23,prepared:23,installed:0,sourceUrl:manifest.sourceUrl});}
 }finally{s.close();}
});
