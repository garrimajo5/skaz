import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const bundle=read('srd51-encounter-monsters.json'),audit=read('srd51-encounter-monsters.coverage.json');
test('encounter subset preserves audited numbers, provenance and repeated import',()=>{
 const entries=validateCatalog(bundle);assert.equal(entries.length,8);assert.deepEqual(entries.map(e=>e.id),audit.entries.map(e=>e.id));
 const expected={kobold:[12,5,'1/8',25],ogre:[11,59,'2',450],orc:[13,15,'1/2',100],zombie:[8,22,'1/4',50],'brown-bear':[11,34,'1',200],'dire-wolf':[14,37,'1',200],'giant-spider':[14,26,'1',200],wolf:[13,11,'1/4',50]};
 for(const e of entries){const x=e.monster;assert.deepEqual([x.armorClass,x.hitPoints,x.challenge,x.xp],expected[e.id.split(':').at(-1)]);assert.equal(Object.keys(x.abilities).length,6);assert.equal(e.source.usage,'cc-by-4.0');assert.ok(e.source.url.endsWith('#page='+audit.entries.find(a=>a.id===e.id).pages[0]));}
 const s=openStore(':memory:');try{const before=s.read();s.catalog.importEntries(read('srd51-monsters.json'),{apply:true});assert.equal(s.catalog.importEntries(bundle,{apply:true}).added,8);assert.equal(s.catalog.importEntries(bundle,{apply:true}).unchanged,8);assert.equal(s.catalog.coverage().structuredMonsters,10);assert.equal(s.catalog.search(new URLSearchParams('kind=monster&challenge=1')).total,3);assert.deepEqual(s.read(),before);}finally{s.close();}
});
