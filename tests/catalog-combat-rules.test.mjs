import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const pack=read('srd51-combat-rules.json'),audit=read('srd51-combat-rules.coverage.json');
test('combat rule summaries retain action costs, contest rules and source provenance',()=>{
 const entries=validateCatalog(pack),get=en=>entries.find(e=>e.name.en===en);assert.equal(entries.length,10);assert.equal(audit.expectedSubsetCount,10);assert.equal(audit.completeGameCatalog,false);
 assert.deepEqual(entries.map(e=>e.id).sort(),audit.entries.map(e=>e.id).sort());
 for(const e of entries){const a=audit.entries.find(x=>x.id===e.id);assert.equal(e.name.en,a.nameEn);assert.equal(e.source.url,audit.sourceUrl+'#page='+a.pages[0]);assert.equal(e.source.usage,'cc-by-4.0');assert.match(e.source.attribution,/Wizards of the Coast/);assert.equal(e.mechanic.category,'combat');assert.ok(e.mechanic.effects.every(x=>e.text.includes(x)));}
 assert.match(get('Reactions').text,/в начале твоего следующего хода/);assert.match(get('Ready').text,/требует концентрации/);assert.match(get('Ready').text,/Когда триггер завершится/);
 assert.match(get('Grappling').text,/Силы \(Атлетика\).*Ловкости \(Акробатика\)/);assert.match(get('Grappling').text,/свободная рука/);assert.match(get('Shoving a Creature').text,/на 5 футов/);
 assert.match(get('Cover').text,/\+2 КД/);assert.match(get('Cover').text,/\+5 КД/);assert.match(get('Dodge').text,/скорости до 0/);assert.match(get('Opportunity Attacks').text,/одну ближнюю атаку/);
});
test('combat rules install atomically with cyclic references, repeat unchanged and remain read-only for the game',()=>{
 const s=openStore(':memory:');try{const before=s.read();assert.throws(()=>s.catalog.importEntries(pack,{apply:true}),{status:422});assert.equal(s.catalog.coverage().total,0);
 const p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});assert.equal(s.catalog.importEntries({...pack,entries:[...pack.entries].reverse()},{apply:true}).unchanged,10);
 const rules=s.catalog.search(new URLSearchParams('kind=mechanic&mechanicCategory=combat'));assert.equal(rules.total,11);assert.ok(rules.entries.some(e=>e.name.en==='Death Saving Throws'));
 assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),[]);
 }finally{s.close();}
});
