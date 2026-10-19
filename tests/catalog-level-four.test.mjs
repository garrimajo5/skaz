import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const pack=read('srd51-level-four.json'),audit=read('srd51-level-four.coverage.json'),entries=validateCatalog(pack),get=en=>entries.find(e=>e.name.en===en);
test('fourth-level cards cover exactly the pinned source identities and preserve 2014 exceptions',()=>{
 const expected=read('srd51-spells.index.json').entries.filter(e=>e.level===4);
 assert.equal(entries.length,31);assert.equal(audit.expectedSubsetCount,31);assert.equal(audit.completeGameCatalog,false);
 assert.deepEqual(entries.map(e=>e.id).sort(),expected.map(e=>e.id).sort());
 assert.deepEqual(audit.entries.map(e=>e.id).sort(),entries.map(e=>e.id).sort());
 for(const e of entries){const ref=expected.find(x=>x.id===e.id),a=audit.entries.find(x=>x.id===e.id);assert.equal(e.spell.level,4);assert.equal(e.spell.school,ref.school);assert.equal(e.name.en,ref.nameEn);assert.equal(a.pages[0],ref.page);assert.equal(e.source.url,audit.sourceUrl+'#page='+ref.page);assert.equal(e.source.usage,'cc-by-4.0');assert.match(e.source.attribution,/Wizards of the Coast/);assert.ok(e.source.changes);}
 assert.equal(get('Fire Shield').spell.concentration,false);assert.equal(get('Death Ward').spell.concentration,false);assert.equal(get('Guardian of Faith').spell.concentration,false);
 assert.deepEqual(get('Dimension Door').spell.components,['V']);assert.equal(get('Divination').spell.ritual,true);assert.match(get('Divination').text,/25 зм, расходуются/);
 assert.match(get('Ice Storm').text,/2d8 дробящего \+ 4d6/);assert.match(get('Ice Storm').text,/только дробящий урон/);
 assert.match(get('Guardian of Faith').text,/20 урона.*10 при успехе/);assert.match(get('Guardian of Faith').text,/суммарных 60/);
 assert.match(get('Polymorph').text,/включая умственные/);assert.match(get('Polymorph').text,/лишний урон/);assert.doesNotMatch(get('Polymorph').text,/временные хиты/);
 assert.match(get('Confusion').text,/2–6/);assert.match(get('Confusion').text,/7–8/);assert.match(get('Confusion').text,/9–10/);
 assert.match(get('Stoneskin').text,/100 зм, расходуется/);assert.match(get('Secret Chest').text,/5000 зм/);assert.match(get('Secret Chest').text,/50 зм; расход не указан/);
 assert.match(get('Phantasmal Killer').text,/не наносится сразу/);assert.match(get('Compulsion').text,/движение провоцирует атаки/);
});
test('fourth-level install resolves links, replays unchanged, rejects mixed conflicts and preserves progress',()=>{
 const s=openStore(':memory:');try{const before=s.read();assert.throws(()=>s.catalog.importEntries(pack,{apply:true}),{status:422});assert.equal(s.catalog.coverage().total,0);
 const p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});assert.equal(s.catalog.importEntries(pack,{apply:true}).unchanged,31);
 const bad=structuredClone(pack);bad.entries[0].text+=' edited';bad.entries.push({...bad.entries[1],id:'test:fourth:new'});const total=s.catalog.coverage().total;assert.throws(()=>s.catalog.importEntries(bad,{apply:true}),{status:409});assert.equal(s.catalog.coverage().total,total);
 assert.deepEqual(s.catalog.coverage().scopes.srd51Spells.byLevel[4],{level:4,expected:31,prepared:31,installed:31});assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),[]);
 const query=q=>s.catalog.search(new URLSearchParams('kind=spell&level=4&'+q));assert.equal(query('ritual=true').total,1);assert.equal(query('ritual=true').entries[0].name.en,'Divination');
 const all=[];for(let offset=0;offset<31;offset+=8)all.push(...query('limit=8&offset='+offset).entries);assert.equal(all.length,31);assert.equal(new Set(all.map(e=>e.id)).size,31);
 assert.equal(query('q=Превращение').entries[0].name.en,'Polymorph');
 }finally{s.close();}
});
