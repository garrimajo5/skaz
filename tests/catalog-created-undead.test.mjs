import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateCatalog} from '../server/catalog.mjs';
import {openStore} from '../server/store.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const pack=read('srd51-created-undead.json'),manifest=read('srd51-created-undead.coverage.json');
test('created undead have distinct source statistics, paralysis exceptions and curse durations',()=>{
 const entries=validateCatalog(pack),get=name=>entries.find(e=>e.name.en===name);
 assert.equal(entries.length,4);assert.equal(manifest.expectedSubsetCount,4);assert.equal(manifest.completeGameCatalog,false);
 for(const e of entries){const ref=manifest.entries.find(x=>x.id===e.id);assert.equal(ref.nameEn,e.name.en);assert.equal(e.source.url,manifest.sourceUrl+'#page='+ref.pages[0]);assert.equal(e.source.usage,'cc-by-4.0');assert.match(e.source.attribution,/Wizards of the Coast/);assert.equal(e.monster.type,'undead');}
 assert.deepEqual(entries.map(e=>[e.name.en,e.monster.armorClass,e.monster.hitPoints,e.monster.challenge,e.monster.xp]),[['Ghoul',12,22,'1',200],['Ghast',13,36,'2',450],['Wight',14,45,'3',700],['Mummy',11,58,'3',700]]);
 assert.match(get('Ghoul').text,/кроме эльфа или нежити/);assert.match(get('Ghast').text,/Эльфы не исключены/);assert.match(get('Ghast').text,/до начала его следующего хода/);
 assert.match(get('Wight').text,/непосеребрённых/);assert.match(get('Wight').text,/не более 12 зомби/);assert.match(get('Wight').text,/один удар мечом можно заменить/);
 assert.match(get('Mummy').text,/10 \(3d6\) каждые 24 часа/);assert.match(get('Mummy').text,/кроме лордов мумий/);assert.match(get('Mummy').text,/до конца следующего хода мумии/);
});
test('Create Undead links all four named forms and creature import is repeatable without changing play',()=>{
 const s=openStore(':memory:');try{const before=s.read(),p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});const detail=s.catalog.lookup(new URLSearchParams({id:'srd51:2014:spell:create-undead'}));assert.deepEqual(detail.related.map(e=>e.name.en).sort(),['Ghast','Ghoul','Mummy','Wight']);assert.equal(s.catalog.importEntries(pack,{apply:true}).unchanged,4);assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),[]);}finally{s.close();}
});
