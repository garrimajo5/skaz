import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const pack=read('srd51-encounter-threats.json'),manifest=read('srd51-encounter-threats.coverage.json');
test('five encounter creatures retain 2014 statistics, conditional traits and provenance',()=>{
 const entries=validateCatalog(pack);assert.equal(entries.length,5);assert.equal(manifest.expectedSubsetCount,5);assert.equal(manifest.completeGameCatalog,false);
 assert.deepEqual(entries.map(e=>[e.name.en,e.monster.armorClass,e.monster.hitPoints,e.monster.challenge,e.monster.xp]),[['Harpy',11,38,'1',200],['Minotaur',14,76,'3',700],['Troll',15,84,'5',1800],['Treant',16,138,'9',5000],['Azer',17,39,'2',450]]);
 assert.equal(new Set(manifest.entries.map(e=>e.id)).size,5);
 for(const e of entries){const row=manifest.entries.find(r=>r.id===e.id);assert.equal(row.nameEn,e.name.en);assert.equal(e.ruleset,'5e-2014');assert.equal(e.source.usage,'cc-by-4.0');assert.equal(e.source.url,manifest.sourceUrl+'#page='+row.pages[0]);assert.match(e.source.attribution,/Wizards of the Coast/);assert.match(e.text,/не применяются автоматически/);}
 const [harpy,minotaur,troll,treant,azer]=entries;
 assert.equal(azer.monster.type,'elemental');assert.match(azer.text,/металлическим рукопашным оружием/);assert.match(azer.text,/уже включён/);assert.match(azer.text,/попадает по нему рукопашной атакой, находясь в пределах 5 футов/);

 assert.equal(treant.monster.type,'plant');assert.match(treant.text,/Сопротивление дробящему и колющему урону, уязвимость к огню/);assert.match(treant.text,/Интеллекта и Харизмы 1/);assert.match(treant.text,/дальше 120 футов/);
 assert.equal(harpy.monster.speed.fly,40);assert.match(harpy.text,/гуманоид и великан.*300 футов/);assert.match(harpy.text,/не от гарпии/);assert.match(harpy.text,/в конце каждого своего хода/);assert.match(harpy.text,/именно этой гарпии на 24 часа/);
 assert.match(minotaur.text,/не менее 10 футов прямо.*в тот же ход/);assert.match(minotaur.text,/до начала его следующего хода/);assert.match(troll.text,/кислотой или огнём.*следующего хода/);assert.match(troll.text,/с 0 хитов и не регенерирует/);
});
test('threat import repeats without game writes and exposes correct condition links and filters',()=>{
 const s=openStore(':memory:');try{const before=s.read(),preview=s.catalog.previewBundled();s.catalog.installBundled({version:preview.version});assert.equal(s.catalog.importEntries(pack,{apply:true}).unchanged,5);
 for(const [slug,links]of [['harpy',['charmed','incapacitated']],['minotaur',['prone']],['troll',[]],['treant',[]],['azer',['poisoned']]]){
  const card=s.catalog.lookup(new URLSearchParams({id:'srd51:2014:monster:'+slug}));assert.deepEqual(card.related.map(e=>e.id).sort(),links.map(id=>'srd51:2014:mechanic:'+id).sort());
 }
 const found=s.catalog.search(new URLSearchParams({kind:'monster',challenge:'5',limit:'100'}));assert.ok(found.entries.some(e=>e.name.en==='Troll'));assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),[]);
 }finally{s.close();}
});
