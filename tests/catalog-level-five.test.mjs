import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const pack=read('srd51-level-five.json'),manifest=read('srd51-level-five.coverage.json');

test('fifth-level source packages cover exactly the 37 indexed headings with provenance and no overlap',()=>{
 const entries=validateCatalog(pack),support=read('srd51-level-five-support.json').entries,index=read('srd51-spells.index.json').entries.filter(e=>e.level===5);
 assert.equal(entries.length,31);assert.equal(manifest.expectedSubsetCount,31);assert.equal(manifest.completeGameCatalog,false);
 assert.deepEqual([...entries,...support].map(e=>e.id).sort(),index.map(e=>e.id).sort());
 assert.deepEqual(entries.map(e=>e.id).sort(),manifest.entries.map(e=>e.id).sort());
 for(const e of entries){const ref=index.find(x=>x.id===e.id),audit=manifest.entries.find(x=>x.id===e.id);assert.equal(e.name.en,ref.nameEn);assert.equal(e.spell.level,5);assert.equal(e.spell.school,ref.school);assert.equal(audit.pages[0],ref.page);assert.ok(audit.pages.every(Number.isInteger));assert.equal(e.source.url,manifest.sourceUrl+'#page='+ref.page);assert.equal(e.source.usage,'cc-by-4.0');assert.match(e.source.attribution,/Wizards of the Coast/);assert.ok(e.source.changes);}
});

test('2014 fifth-level limits preserve triggers, contested checks, components and pinned Contagion wording',()=>{
 const get=en=>pack.entries.find(e=>e.name.en===en);
 assert.match(get('Animate Objects').text,/Крошечный — 20;18;\+8;1d4\+4;4\/18/);
 assert.match(get('Animate Objects').text,/Огромный за 8/);assert.match(get('Animate Objects').text,/500 футов/);
 assert.match(get('Cloudkill').text,/начале своего хода/);assert.match(get('Insect Plague').text,/в конце своего хода/);
 assert.match(get('Telekinesis').text,/состязание проверок, не спасбросок/);
 assert.match(get('Contagion').text,/сразу получает выбранную болезнь/);assert.match(get('Contagion').text,/именно этого PDF/);
 assert.match(get('Conjure Elemental').text,/Потеря концентрации не убирает/);
 assert.match(get('Flame Strike').text,/один выбранный вид урона/);
 assert.match(get('Wall of Stone').text,/30 хитов на дюйм/);assert.match(get('Wall of Stone').text,/все 10 минут/);
 assert.match(get('Wall of Force').text,/не снимается Рассеиванием магии/);
 assert.match(get('Legend Lore').text,/250 зм расходуются/);assert.match(get('Legend Lore').text,/50 зм каждая — расход не указан/);
 assert.equal(get('Awaken').spell.castingTime,'8 часов');assert.equal(get('Hallow').spell.castingTime,'24 часа');assert.equal(get('Creation').spell.duration,'Особая');
 assert.match(get('Scrying').text,/−10/);assert.match(get('Scrying').text,/24 часа/);assert.equal(get('Mislead').spell.components.join(''),'S');
});

test('full fifth-level bundle resolves dependencies, imports repeatably and never applies effects to play',()=>{
 const s=openStore(':memory:');try{const before=s.read();assert.throws(()=>s.catalog.importEntries(pack,{apply:true}),{status:422});assert.equal(s.catalog.coverage().total,0);
 const p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});const repeated=s.catalog.importEntries({...pack,entries:[...pack.entries].reverse()},{apply:true});assert.equal(repeated.unchanged,31);
 assert.deepEqual(s.catalog.coverage().scopes.srd51Spells.byLevel[5],{level:5,expected:37,prepared:37,installed:37});
 assert.equal(s.catalog.spellInventory().entries.filter(e=>e.level===5&&e.status==='missing').length,0);
 const search=s.catalog.search(new URLSearchParams({kind:'spell',level:'5',concentration:'true',school:'evocation'}));assert.ok(search.entries.some(e=>e.name.en==='Wall of Force'));assert.ok(search.entries.every(e=>e.spell.level===5&&e.spell.concentration&&e.spell.school==='evocation'));
 assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),[]);
 }finally{s.close();}
});
