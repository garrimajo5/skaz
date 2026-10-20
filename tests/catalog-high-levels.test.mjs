import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const index=read('srd51-spells.index.json').entries;
for(const [word,level,count] of [['seven',7,20],['eight',8,16],['nine',9,15]]){
 test(`level ${level} covers exactly its ${count} pinned SRD headings with attributable summaries`,()=>{
 const pack=read(`srd51-level-${word}.json`),manifest=read(`srd51-level-${word}.coverage.json`),entries=validateCatalog(pack);
 assert.equal(entries.length,count);assert.equal(manifest.expectedSubsetCount,count);assert.equal(manifest.completeGameCatalog,false);
 assert.deepEqual(entries.map(e=>e.id).sort(),index.filter(e=>e.level===level).map(e=>e.id).sort());assert.deepEqual(entries.map(e=>e.id).sort(),manifest.entries.map(e=>e.id).sort());
 for(const e of entries){const ref=index.find(x=>x.id===e.id),audit=manifest.entries.find(x=>x.id===e.id);assert.equal(e.name.en,ref.nameEn);assert.equal(e.spell.level,level);assert.equal(e.spell.school,ref.school);assert.equal(audit.pages[0],ref.page);assert.ok(audit.pages.every(Number.isInteger));assert.equal(e.source.url,manifest.sourceUrl+'#page='+ref.page);assert.equal(e.source.usage,'cc-by-4.0');assert.match(e.source.attribution,/Wizards of the Coast/);assert.ok(e.source.changes);}
 });
}
test('high-level effects retain 2014 thresholds, costs and exceptions',()=>{
 const all=['seven','eight','nine'].flatMap(w=>read(`srd51-level-${w}.json`).entries),get=en=>all.find(e=>e.name.en===en);
 assert.equal(get('Forcecage').spell.concentration,false);assert.match(get('Forcecage').text,/расход не указан/);
 assert.equal(get('Project Image').spell.range.feet,2640000);assert.equal(get('Simulacrum').spell.castingTime,'12 часов');assert.match(get('Simulacrum').text,/не восстанавливает потраченные ячейки/);
 assert.match(get('Teleport').text,/01–05 неудача, 06–13 похожее место, 14–24 отклонение, 25–100 точно/);assert.match(get('Teleport').text,/3d10/);
 assert.match(get('Feeblemind').text,/4d6 психического урона независимо/);assert.match(get('Maze').text,/проверка характеристики, не спасбросок/);
 assert.equal(get('Animal Shapes').spell.concentration,true);assert.match(get('Animal Shapes').text,/сохраняются мировоззрение и ИНТ\/МДР\/ХАР/);
 assert.match(get('Clone').text,/120 дней/);assert.match(get('Clone').text,/сосуд не менее 2000 зм/);
 assert.match(get('Power Word Kill').text,/100 или меньше/);assert.match(get('Power Word Stun').text,/150 или меньше/);
 assert.match(get('Meteor Swarm').text,/Перекрытие сфер не наносит урон повторно/);
 assert.match(get('Prismatic Wall').text,/Преграда магии на стену не влияет/);
 assert.match(get('True Polymorph').text,/включая умственные/);assert.match(get('True Polymorph').text,/часовая концентрация/);
 assert.match(get('True Resurrection').text,/200 лет/);assert.match(get('True Resurrection').text,/25 000 зм/);
 assert.match(get('Weird').text,/При начальном провале урон не наносится/);
 assert.match(get('Wish').text,/33%/);assert.match(get('Wish').text,/Любое применение кроме повторения/);
});
test('complete SRD spell coverage remains distinct from complete game coverage and installs without progress changes',()=>{
 const s=openStore(':memory:');try{const before=s.read(),preview=s.catalog.previewBundled();s.catalog.installBundled({version:preview.version});
 const c=s.catalog.coverage();assert.equal(c.total,593);assert.equal(c.complete,false);assert.equal(c.expectedTotal,null);assert.deepEqual([c.scopes.srd51Spells.expected,c.scopes.srd51Spells.prepared,c.scopes.srd51Spells.installed],[319,319,319]);
 for(const row of c.scopes.srd51Spells.byLevel)assert.deepEqual([row.prepared,row.installed],[row.expected,row.expected]);
 assert.equal(s.catalog.spellInventory().entries.filter(e=>e.status==='missing').length,0);
 for(const w of ['seven','eight','nine']){const p=read(`srd51-level-${w}.json`);assert.equal(s.catalog.importEntries(p,{apply:true}).unchanged,p.entries.length);}
 assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),[]);
 }finally{s.close();}
});
