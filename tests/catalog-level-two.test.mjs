import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const bundle=read('srd51-level-two.json'),audit=read('srd51-level-two.coverage.json');
const entries=validateCatalog(bundle),get=en=>entries.find(e=>e.name.en===en);

test('second-level SRD set matches all source identities with source pages and attribution',()=>{
 const expected=read('srd51-spells.index.json').entries.filter(e=>e.level===2);
 assert.equal(entries.length,54);assert.equal(audit.expectedSubsetCount,54);assert.equal(audit.completeGameCatalog,false);
 assert.deepEqual(entries.map(e=>e.id).sort(),expected.map(e=>e.id).sort());
 assert.deepEqual(audit.entries.map(e=>e.id).sort(),entries.map(e=>e.id).sort());
 for(const e of entries){const ref=expected.find(x=>x.id===e.id),pages=audit.entries.find(x=>x.id===e.id).pages;
  assert.equal(e.name.en,ref.nameEn);assert.equal(e.spell.school,ref.school);assert.equal(e.spell.level,2);assert.ok(e.name.ru);
  assert.equal(pages[0],ref.page);assert.ok(pages.every(p=>Number.isInteger(p)&&p>=114&&p<=194));
  assert.equal(e.source.url,audit.sourceUrl+'#page='+ref.page);assert.equal(e.source.usage,'cc-by-4.0');assert.match(e.source.attribution,/Wizards of the Coast/);assert.ok(e.source.changes);
 }
 assert.deepEqual(audit.entries.find(e=>e.nameEn==='Zone of Truth').pages,[193,194]);
});

test('2014 second-level distinctions retain action economy, concentration and material costs',()=>{
 assert.equal(get('Spiritual Weapon').spell.concentration,false);assert.equal(get('Spiritual Weapon').spell.castingTime,'1 бонусное действие');assert.match(get('Spiritual Weapon').text,/каждые два уровня/);
 assert.equal(get('Barkskin').spell.concentration,true);assert.match(get('Barkskin').text,/КД не может быть ниже 16/);
 assert.equal(get('Blindness/Deafness').spell.concentration,false);assert.equal(get('Mirror Image').spell.concentration,false);assert.equal(get('Enthrall').spell.concentration,false);
 assert.equal(get('Prayer of Healing').spell.castingTime,'10 минут');assert.match(get('Prayer of Healing').text,/До шести/);
 assert.match(get('Aid').text,/максимум и текущие хиты/);assert.equal(get('Aid').spell.concentration,false);
 assert.match(get('Arcane Lock').text,/25 зм, расходуется/);assert.match(get('Warding Bond').text,/50 зм каждое/);assert.match(get('Warding Bond').text,/расход не указан/);
 assert.deepEqual(get('Darkness').spell.components,['M','V']);assert.deepEqual(get('Suggestion').spell.components,['M','V']);
 assert.equal(get('Silence').spell.ritual,true);assert.equal(get('Silence').spell.concentration,true);
 assert.equal(get('Zone of Truth').spell.concentration,false);assert.match(get('Zone of Truth').text,/спасбросок Харизмы/);
 assert.match(get('Heat Metal').text,/начала твоего следующего хода/);assert.match(get('Moonbeam').text,/впервые за ход/);assert.match(get('Web').text,/в свой ход/);
});

test('second-level install resolves links atomically, handles replay, rejects conflicts and does not alter play',()=>{
 const s=openStore(':memory:');try{const before=s.read();assert.throws(()=>s.catalog.importEntries(bundle,{apply:true}),{status:422});assert.equal(s.catalog.coverage().total,0);
 const p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});const count=s.catalog.coverage().total;
 assert.equal(s.catalog.importEntries({...bundle,entries:[...bundle.entries].reverse()},{apply:true}).unchanged,54);
 const changed=structuredClone(bundle);changed.entries[0].text+=' changed';changed.entries.push({...changed.entries[0],id:'test:second-level:new'});
 assert.throws(()=>s.catalog.importEntries(changed,{apply:true}),{status:409});assert.equal(s.catalog.coverage().total,count);
 assert.ok(s.catalog.spellInventory().entries.filter(e=>e.level===2).every(e=>e.status==='installed'));
 assert.deepEqual(s.catalog.coverage().scopes.srd51Spells.byLevel[2],{level:2,expected:54,prepared:54,installed:54});
 assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),[]);
 }finally{s.close();}
});

test('second-level search combines exact false, ritual and school filters and paginates without omissions',()=>{
 const s=openStore(':memory:');try{const p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});
 const query=q=>s.catalog.search(new URLSearchParams('kind=spell&level=2&'+q));
 assert.deepEqual(query('ritual=true&concentration=true').entries.map(e=>e.name.en),['Silence']);
 const noCon=query('school=evocation&concentration=false&limit=100');assert.ok(noCon.entries.some(e=>e.name.en==='Spiritual Weapon'));assert.ok(!noCon.entries.some(e=>e.name.en==='Moonbeam'));
 const all=[];for(let offset=0;offset<54;offset+=7)all.push(...query('limit=7&offset='+offset).entries);
 assert.equal(all.length,54);assert.equal(new Set(all.map(e=>e.id)).size,54);
 assert.equal(query('q=малое восстановление').entries[0].name.en,'Lesser Restoration');assert.equal(query('q=Misty Step').entries[0].name.ru,'Туманный шаг');
 }finally{s.close();}
});
