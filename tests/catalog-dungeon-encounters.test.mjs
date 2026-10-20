import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {openStore} from '../server/store.mjs';import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8')),pack=read('srd51-dungeon-encounters.json'),manifest=read('srd51-dungeon-encounters.coverage.json');
test('three encounter cards preserve conditional armor, grapple restrictions and exact provenance',()=>{
 const entries=validateCatalog(pack);assert.equal(entries.length,3);assert.equal(manifest.expectedSubsetCount,3);assert.equal(manifest.completeGameCatalog,false);
 assert.deepEqual(entries.map(e=>[e.name.en,e.monster.armorClass,e.monster.hitPoints,e.monster.challenge,e.monster.xp]),[['Ankheg',14,39,'2',450],['Hell Hound',15,45,'3',700],['Mimic',12,58,'2',450]]);
 for(const e of entries){const row=manifest.entries.find(r=>r.id===e.id);assert.equal(row.nameEn,e.name.en);assert.equal(e.ruleset,'5e-2014');assert.equal(e.source.url,manifest.sourceUrl+'#page='+row.pages[0]);assert.equal(e.source.usage,'cc-by-4.0');assert.match(e.source.attribution,/Wizards of the Coast/);}
 const [ankheg,hound,mimic]=entries;assert.equal(ankheg.monster.speed.burrow,10);assert.match(ankheg.text,/11, когда сбит с ног/);assert.match(ankheg.text,/10 \(2d6 \+ 3\) рубящего/);assert.match(ankheg.text,/только если никого не держит/);assert.match(hound.text,/союзник.*не недееспособен/);assert.match(hound.text,/21 \(6d6\).*успех — половина/);assert.match(mimic.text,/только в форме предмета/);assert.match(mimic.text,/Огромного или меньшего размера/);assert.match(mimic.text,/для освобождения.*с помехой/);
});
test('dungeon pack repeats, preserves progress and resolves every referenced condition',()=>{
 const s=openStore(':memory:');try{const before=s.read(),p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});assert.equal(s.catalog.importEntries(pack,{apply:true}).unchanged,3);
 for(const entry of pack.entries){const found=s.catalog.lookup(new URLSearchParams({id:entry.id}));assert.deepEqual(found.related.map(e=>e.id).sort(),entry.links.toSorted());}
 const result=s.catalog.search(new URLSearchParams({q:'Mimic',kind:'monster',challenge:'2'}));assert.equal(result.total,1);assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),[]);
 }finally{s.close();}
});
