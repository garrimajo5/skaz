import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const pack=read('srd51-level-six.json'),manifest=read('srd51-level-six.coverage.json');
test('sixth-level package matches all 31 pinned SRD headings and records precise provenance',()=>{
 const entries=validateCatalog(pack),index=read('srd51-spells.index.json').entries.filter(e=>e.level===6);
 assert.equal(entries.length,31);assert.equal(manifest.expectedSubsetCount,31);assert.equal(manifest.completeGameCatalog,false);
 assert.deepEqual(entries.map(e=>e.id).sort(),index.map(e=>e.id).sort());assert.deepEqual(entries.map(e=>e.id).sort(),manifest.entries.map(e=>e.id).sort());
 for(const e of entries){const ref=index.find(x=>x.id===e.id),audit=manifest.entries.find(x=>x.id===e.id);assert.equal(e.name.en,ref.nameEn);assert.equal(e.spell.level,6);assert.equal(e.spell.school,ref.school);assert.equal(audit.pages[0],ref.page);assert.ok(audit.pages.every(Number.isInteger));assert.equal(e.source.url,manifest.sourceUrl+'#page='+ref.page);assert.equal(e.source.usage,'cc-by-4.0');assert.match(e.source.attribution,/Wizards of the Coast/);assert.ok(e.source.changes);}
});
test('sixth-level edition-sensitive triggers and costs stay explicit without automatic effects',()=>{
 const get=en=>pack.entries.find(e=>e.name.en===en);
 assert.match(get('Disintegrate').text,/10d6\+40/);assert.match(get('Disintegrate').text,/при успехе урона нет/);assert.match(get('Disintegrate').text,/закреплённого PDF/);
 assert.match(get('Harm').text,/не снижает хиты ниже 1/);assert.match(get('Harm').text,/Только при провале/);
 assert.match(get('Heal').text,/70 хитов/);assert.equal(get('Mass Suggestion').spell.concentration,false);
 assert.match(get('Irresistible Dance').text,/без начального спасброска/);assert.match(get('Irresistible Dance').text,/действием сделать/);
 assert.match(get('Wall of Thorns').text,/7d8 колющим/);assert.match(get('Wall of Thorns').text,/7d8 рубящим/);assert.match(get('Wall of Thorns').text,/4 фута движения/);
 assert.match(get('Sunbeam').text,/это солнечный свет/);assert.match(get('Conjure Fey').text,/Потеря концентрации вместо исчезновения/);
 assert.match(get('Contingency').text,/расходуя обе ячейки/);assert.match(get('Forbiddance').text,/только при последнем наложении/);assert.equal(get('Forbiddance').spell.ritual,true);
 assert.match(get('Instant Summons').text,/уничтожается при вызове/);assert.match(get('Heroes’ Feast').text,/двенадцати других/);
 assert.match(get('Magic Jar').text,/100 футов/);assert.match(get('Magic Jar').text,/сосуд уничтожается/);
});
test('sixth-level installation resolves all prepared links and reports missing higher levels honestly',()=>{
 const s=openStore(':memory:');try{const before=s.read();assert.throws(()=>s.catalog.importEntries(pack,{apply:true}),{status:422});assert.equal(s.catalog.coverage().total,0);
 const p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});assert.equal(s.catalog.importEntries({...pack,entries:[...pack.entries].reverse()},{apply:true}).unchanged,31);
 assert.deepEqual(s.catalog.coverage().scopes.srd51Spells.byLevel[6],{level:6,expected:31,prepared:31,installed:31});
 assert.equal(s.catalog.spellInventory().entries.filter(e=>e.level>=7&&e.status==='missing').length,0);assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),[]);
 }finally{s.close();}
});
