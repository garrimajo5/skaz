import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const pack=read('srd51-level-three.json'),audit=read('srd51-level-three.coverage.json');
const entries=validateCatalog(pack),get=name=>entries.find(e=>e.name.en===name);

test('third-level source identities and page provenance match the pinned SRD index',()=>{
 const expected=read('srd51-spells.index.json').entries.filter(e=>e.level===3);
 assert.equal(entries.length,42);assert.equal(audit.expectedSubsetCount,42);assert.equal(audit.completeGameCatalog,false);
 assert.deepEqual(entries.map(e=>e.id).sort(),expected.map(e=>e.id).sort());
 assert.deepEqual(audit.entries.map(e=>e.id).sort(),entries.map(e=>e.id).sort());
 for(const e of entries){const ref=expected.find(x=>x.id===e.id),a=audit.entries.find(x=>x.id===e.id);
  assert.equal(e.name.en,ref.nameEn);assert.equal(e.spell.level,3);assert.equal(e.spell.school,ref.school);assert.ok(e.name.ru);
  assert.equal(a.pages[0],ref.page);assert.ok(a.pages.every(p=>Number.isInteger(p)&&p>=114&&p<=194));
  assert.equal(e.source.url,audit.sourceUrl+'#page='+ref.page);assert.equal(e.source.usage,'cc-by-4.0');assert.match(e.source.attribution,/Wizards of the Coast/);assert.ok(e.source.changes);
 }
 assert.deepEqual(audit.entries.find(e=>e.nameEn==='Glyph of Warding').pages,[149,150]);
});

test('2014 third-level rules retain timing, material costs and higher-slot exceptions',()=>{
 assert.match(get('Counterspell').spell.castingTime,/1 реакция,.*60 футах/);assert.deepEqual(get('Counterspell').spell.components,['S']);assert.match(get('Counterspell').text,/проверку базовой характеристики/);
 assert.match(get('Spirit Guardians').text,/первом входе за ход или начале своего хода/);assert.match(get('Haste').text,/одна атака оружием/);assert.match(get('Haste').text,/конца своего следующего хода/);
 assert.equal(get('Blink').spell.concentration,false);assert.equal(get('Daylight').spell.concentration,false);assert.match(get('Daylight').text,/не объявлен солнечным/);
 assert.equal(get('Clairvoyance').spell.range.feet,5280);assert.match(get('Clairvoyance').text,/100 зм.*расход не указан/);
 assert.equal(get('Plant Growth').spell.castingTime,'1 действие или 8 часов');assert.match(get('Plant Growth').text,/4 фута/);
 assert.equal(get('Glyph of Warding').spell.duration,'Пока не рассеяно или не сработает');assert.match(get('Glyph of Warding').text,/200 зм, расходуются/);
 assert.match(get('Revivify').text,/300 зм, расходуются/);assert.match(get('Revivify').text,/не более минуты/);
 assert.match(get('Bestow Curse').text,/С 5-го уровня ячейки концентрация не требуется/);assert.match(get('Remove Curse').text,/сохраняет само проклятие/);
 assert.deepEqual(get('Tongues').spell.components,['M','V']);assert.deepEqual(get('Hypnotic Pattern').spell.components,['M','S']);
 assert.match(get('Tiny Hut').text,/согласуй с мастером/);assert.ok(audit.limitations.some(x=>x.includes('ambiguous')));
});

test('third-level installation preserves progress, resolves dependencies and replays without duplicates',()=>{
 const s=openStore(':memory:');try{const before=s.read();assert.throws(()=>s.catalog.importEntries(pack,{apply:true}),{status:422});assert.equal(s.catalog.coverage().total,0);
 const p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});const total=s.catalog.coverage().total;
 assert.equal(s.catalog.importEntries({...pack,entries:[...pack.entries].reverse()},{apply:true}).unchanged,42);
 const conflict=structuredClone(pack);conflict.entries[0].text+=' altered';conflict.entries.push({...conflict.entries[0],id:'test:third-level:new'});
 assert.throws(()=>s.catalog.importEntries(conflict,{apply:true}),{status:409});assert.equal(s.catalog.coverage().total,total);
 assert.deepEqual(s.catalog.coverage().scopes.srd51Spells.byLevel[3],{level:3,expected:42,prepared:42,installed:42});
 assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),[]);
 }finally{s.close();}
});

test('third-level filters and pagination include all rituals and Russian/English search',()=>{
 const s=openStore(':memory:');try{const p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});
 const query=q=>s.catalog.search(new URLSearchParams('kind=spell&level=3&'+q));
 assert.equal(query('ritual=true&concentration=false').total,5);assert.equal(query('ritual=true&concentration=true').total,0);
 assert.equal(query('q=Контрзаклинание').entries[0].name.en,'Counterspell');assert.equal(query('q=Spirit Guardians').entries[0].name.ru,'Духовные стражи');
 const all=[];for(let offset=0;offset<42;offset+=9)all.push(...query('limit=9&offset='+offset).entries);
 assert.equal(all.length,42);assert.equal(new Set(all.map(e=>e.id)).size,42);
 }finally{s.close();}
});
