import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const bundle=read('srd51-level-one-support.json'),manifest=read('srd51-level-one-support.coverage.json');
test('first-level support spells have reviewed identities, pages, provenance and boundaries',()=>{
 const entries=validateCatalog(bundle),index=read('srd51-spells.index.json');assert.equal(entries.length,12);assert.equal(manifest.expectedSubsetCount,12);assert.equal(manifest.completeGameCatalog,false);
 for(const e of entries){const ref=manifest.entries.find(x=>x.id===e.id),source=index.entries.find(x=>x.id===e.id);assert.ok(ref&&source);assert.equal(e.name.en,source.nameEn);assert.equal(ref.pages[0],source.page);assert.equal(e.spell.level,1);assert.equal(e.source.usage,'cc-by-4.0');assert.ok(e.source.url.endsWith('#page='+source.page));assert.match(e.source.attribution,/Wizards of the Coast/);assert.ok(e.name.ru&&e.source.changes);}
 const get=en=>entries.find(e=>e.name.en===en);
 assert.equal(get('Alarm').spell.castingTime,'1 минута');assert.equal(get('Alarm').spell.ritual,true);assert.equal(get('Alarm').spell.concentration,false);
 assert.equal(get('Expeditious Retreat').spell.castingTime,'1 бонусное действие');assert.equal(get('Detect Evil and Good').spell.ritual,false);assert.equal(get('Detect Poison and Disease').spell.ritual,true);
 assert.deepEqual(get('Command').spell.components,['V']);assert.match(get('Command').text,/нежить/);assert.match(get('Command').text,/5 футов/);assert.match(get('Animal Friendship').text,/опечатку/);
 assert.match(get('Bane').text,/Харизмы/);assert.match(get('Bless').text,/d4/);assert.match(get('Charm Person').text,/преимуществом/);assert.match(get('Comprehend Languages').text,/касаясь/);
});
test('support import requires condition links, is atomic on conflicts, repeatable and preserves game state',()=>{
 const s=openStore(':memory:');try{const before=s.read();assert.throws(()=>s.catalog.importEntries(bundle,{apply:true}),{status:422});assert.equal(s.catalog.coverage().total,0);
 s.catalog.importEntries(read('srd51-conditions.json'),{apply:true});assert.equal(s.catalog.importEntries(bundle).added,12);assert.equal(s.catalog.importEntries(bundle,{apply:true}).added,12);assert.equal(s.catalog.importEntries({...bundle,entries:[...bundle.entries].reverse()},{apply:true}).unchanged,12);
 const changed=structuredClone(bundle);changed.entries[0].text+=' conflict';changed.entries.push({...changed.entries[0],id:'test:new:alarm'});assert.throws(()=>s.catalog.importEntries(changed,{apply:true}),{status:409});assert.equal(s.catalog.search(new URLSearchParams('q=Alarm')).total,1);assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),[]);
 }finally{s.close();}
});

test('combat subset preserves edition-specific dice, reactions, concentration and cross references',()=>{
 const pack=read('srd51-level-one-combat.json'),audit=read('srd51-level-one-combat.coverage.json'),entries=validateCatalog(pack),get=en=>entries.find(e=>e.name.en===en);assert.equal(entries.length,15);assert.equal(audit.expectedSubsetCount,15);
 for(const e of entries){assert.equal(e.spell.level,1);assert.equal(e.spell.ritual,false);const ref=audit.entries.find(a=>a.id===e.id);assert.equal(e.source.url.split('#page=')[1],String(ref.pages[0]));assert.equal(e.source.usage,'cc-by-4.0');}
 assert.match(get('Sleep').text,/5d8/);assert.equal(get('Sleep').spell.concentration,false);assert.match(get('Color Spray').text,/6d10/);assert.match(get('Inflict Wounds').text,/3d10/);assert.match(get('Inflict Wounds').text,/рукопашную атаку/);assert.equal(get('Divine Favor').spell.concentration,true);
 assert.match(get('Shield').spell.castingTime,/реакция/);assert.match(get('Shield').text,/начала твоего следующего хода/);assert.deepEqual(get('Shield').links,['srd51:2014:spell:magic-missile']);assert.match(get('Hellish Rebuke').spell.castingTime,/причиняет тебе урон/);
 assert.match(get('Entangle').text,/проверку Силы/);assert.match(get('Heroism').text,/оставшиеся временные хиты/);assert.match(get('Thunderwave').text,/300 футов/);
 const s=openStore(':memory:');try{s.catalog.importEntries(read('srd51-conditions.json'),{apply:true});const before=s.read();assert.equal(s.catalog.importEntries(pack,{apply:true}).added,15);assert.equal(s.catalog.importEntries(pack,{apply:true}).unchanged,15);assert.deepEqual(s.read(),before);}finally{s.close();}
});

test('source levels and schools agree with every prepared spell and coverage totals are additive',()=>{
 const index=read('srd51-spells.index.json');assert.equal(index.extractionVersion,2);assert.deepEqual(Array.from({length:10},(_,n)=>index.entries.filter(e=>e.level===n).length),[24,49,54,42,31,37,31,20,16,15]);
 const s=openStore(':memory:');try{const preview=s.catalog.previewBundled();s.catalog.installBundled({version:preview.version});
 const spells=s.catalog.search(new URLSearchParams('kind=spell&limit=100')).entries;for(const e of spells){const ref=index.entries.find(x=>x.id===e.id);assert.equal(ref.level,e.spell.level);assert.equal(ref.school,e.spell.school);}
 const scope=s.catalog.coverage().scopes.srd51Spells;assert.equal(scope.byLevel.reduce((n,x)=>n+x.expected,0),319);assert.equal(scope.byLevel.reduce((n,x)=>n+x.prepared,0),scope.prepared);assert.equal(scope.byLevel.reduce((n,x)=>n+x.installed,0),scope.installed);assert.equal(scope.byLevel[1].expected,49);assert.equal(scope.byLevel[1].installed,49);
 }finally{s.close();}
});

test('exploration subset preserves material exceptions, rituals and familiar limits; first-level SRD coverage has no gaps',()=>{
 const pack=read('srd51-level-one-exploration.json'),audit=read('srd51-level-one-exploration.coverage.json'),entries=validateCatalog(pack),get=en=>entries.find(e=>e.name.en===en);
 assert.equal(entries.length,18);assert.equal(audit.expectedSubsetCount,18);assert.equal(audit.completeGameCatalog,false);
 for(const e of entries){const ref=audit.entries.find(x=>x.id===e.id);assert.ok(ref);assert.equal(e.source.url.split('#page=')[1],String(ref.pages[0]));assert.equal(e.source.usage,'cc-by-4.0');assert.equal(e.spell.level,1);}
 assert.deepEqual(get('Illusory Script').spell.components,['M','S']);assert.equal(get('Illusory Script').spell.ritual,true);assert.match(get('Illusory Script').text,/10 зм, расходуются/);
 assert.match(get('Identify').text,/100 зм/);assert.match(get('Identify').text,/не указывает расход/);assert.equal(get('Identify').spell.castingTime,'1 минута');
 assert.equal(get('Find Familiar').spell.castingTime,'1 час');assert.equal(get('Find Familiar').spell.ritual,true);assert.match(get('Find Familiar').text,/своей реакцией/);assert.match(get('Find Familiar').text,/только один фамильяр/);assert.match(get('Find Familiar').text,/100 футов/);
 assert.equal(get('Grease').spell.concentration,false);assert.equal(get('Fog Cloud').spell.concentration,true);assert.equal(get('Sanctuary').spell.castingTime,'1 бонусное действие');assert.match(get('Sanctuary').text,/Эффекты по области не блокируются/);assert.match(get('Goodberry').text,/24 часа/);
 const s=openStore(':memory:');try{const before=s.read(),p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});assert.equal(s.catalog.importEntries(pack,{apply:true}).unchanged,18);
 const first=s.catalog.spellInventory().entries.filter(e=>e.level===1);assert.equal(first.length,49);assert.ok(first.every(e=>e.status==='installed'));assert.deepEqual(s.read(),before);
 }finally{s.close();}
});

test('remaining cantrips complete the SRD zero-level set and retain 2014 behavior',()=>{
 const pack=read('srd51-cantrips.json'),audit=read('srd51-cantrips.coverage.json'),entries=validateCatalog(pack),get=en=>entries.find(e=>e.name.en===en);
 assert.equal(entries.length,16);assert.equal(audit.expectedSubsetCount,16);assert.equal(audit.completeGameCatalog,false);
 for(const e of entries){assert.equal(e.spell.level,0);assert.equal(e.spell.ritual,false);assert.equal(e.source.usage,'cc-by-4.0');const ref=audit.entries.find(x=>x.id===e.id);assert.equal(e.source.url.split('#page=')[1],String(ref.pages[0]));}
 assert.deepEqual(get('Chill Touch').spell.range,{type:'feet',feet:120});assert.match(get('Chill Touch').text,/начала твоего следующего хода/);assert.match(get('Chill Touch').text,/конца твоего следующего хода/);
 assert.deepEqual(get('Poison Spray').spell.range,{type:'feet',feet:10});assert.match(get('Poison Spray').text,/спасброске Телосложения/);
 assert.equal(get('True Strike').spell.concentration,true);assert.deepEqual(get('True Strike').spell.components,['S']);assert.match(get('True Strike').text,/следующем ходу/);
 assert.match(get('Shocking Grasp').text,/металлический доспех/);assert.match(get('Shocking Grasp').text,/реакции/);assert.match(get('Eldritch Blast').text,/отдельный бросок атаки/);assert.match(get('Guidance').text,/проверке характеристики/);assert.match(get('Resistance').text,/спасброску/);
 const s=openStore(':memory:');try{const before=s.read(),p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});assert.equal(s.catalog.importEntries(pack,{apply:true}).unchanged,16);const zero=s.catalog.spellInventory().entries.filter(e=>e.level===0);assert.equal(zero.length,24);assert.ok(zero.every(e=>e.status==='installed'));assert.deepEqual(s.read(),before);}finally{s.close();}
});
