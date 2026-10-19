import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const pack=read('srd51-level-five-support.json'),audit=read('srd51-level-five-support.coverage.json');
test('fifth-level support subset has six source-matched entries without claiming full level coverage',()=>{
 const entries=validateCatalog(pack),index=read('srd51-spells.index.json').entries,get=en=>entries.find(e=>e.name.en===en);
 assert.equal(entries.length,6);assert.equal(audit.expectedSubsetCount,6);assert.equal(audit.completeGameCatalog,false);
 assert.deepEqual(entries.map(e=>e.id).sort(),audit.entries.map(e=>e.id).sort());
 for(const e of entries){const ref=index.find(x=>x.id===e.id);assert.equal(e.name.en,ref.nameEn);assert.equal(e.spell.level,5);assert.equal(e.spell.school,ref.school);assert.equal(e.source.url,audit.sourceUrl+'#page='+ref.page);assert.equal(e.source.usage,'cc-by-4.0');assert.match(e.source.attribution,/Wizards of the Coast/);assert.ok(e.source.changes);}
 assert.match(get('Greater Restoration').text,/уменьшения максимума хитов/);assert.match(get('Greater Restoration').text,/на один уровень/);assert.match(get('Greater Restoration').text,/100 зм, расходуется/);
 assert.match(get('Mass Cure Wounds').text,/3d8/);assert.match(get('Raise Dead').text,/не более 10 дней/);assert.match(get('Raise Dead').text,/−4/);assert.match(get('Raise Dead').text,/500 зм, расходуется/);
 assert.equal(get('Commune').spell.ritual,true);assert.equal(get('Telepathic Bond').spell.ritual,true);assert.match(get('Commune').text,/отсутствия ответа/);
 assert.deepEqual(get('Teleportation Circle').spell.components,['M','V']);assert.equal(get('Teleportation Circle').spell.duration,'1 раунд');assert.match(get('Teleportation Circle').text,/50 зм, расходуются/);
});
test('fifth-level subset installation is repeatable and leaves missing spells visible without changing play',()=>{
 const s=openStore(':memory:');try{const before=s.read();assert.throws(()=>s.catalog.importEntries(pack,{apply:true}),{status:422});assert.equal(s.catalog.coverage().total,0);
 const p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});assert.equal(s.catalog.importEntries(pack,{apply:true}).unchanged,6);
 assert.deepEqual(s.catalog.coverage().scopes.srd51Spells.byLevel[5],{level:5,expected:37,prepared:6,installed:6});
 assert.equal(s.catalog.spellInventory().entries.filter(e=>e.level===5&&e.status==='missing').length,31);assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),[]);
 }finally{s.close();}
});
