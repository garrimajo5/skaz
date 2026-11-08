import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{bundledCatalog}from'../server/bundled-catalog.mjs';import{definitions,records,render,coverage}from'../scripts/build-spell-facts.mjs';import Facts from'../client/spell-facts.js';
const entries=bundledCatalog().bundle.entries.filter(e=>e.kind==='spell'),get=slug=>entries.find(e=>e.id==='srd51:2014:spell:'+slug);
test('16 exact licensed source snapshots produce repeatable facts; remaining 303 are explicitly uncovered',()=>{
 assert.equal(Facts.count,16);assert.equal(entries.length,319);assert.equal(entries.filter(e=>Facts.summary(e,5)!==null).length,16);assert.equal(render(),readFileSync(new URL('../client/spell-facts.js',import.meta.url),'utf8').replaceAll('\r\n','\n'));
 assert.deepEqual(coverage(),JSON.parse(readFileSync(new URL('../catalog/spell-quick-facts.coverage.json',import.meta.url),'utf8')));assert.equal(coverage().uncovered.length,303);
 for(const[id,r]of Object.entries(records())){assert.equal(r.source.usage,'cc-by-4.0');assert.ok(r.source.attribution.includes('Wizards of the Coast'));assert.ok(r.source.url.includes('SRD_CC_v5.1.pdf'));const f=r.facts,dice=f.damage||f.healing;if(dice)assert.ok(r.text.includes(dice[0]+'d'+dice[1]),id);if(f.save)assert.ok(r.text.includes({dex:'Ловкости',con:'Телосложения',wis:'Мудрости'}[f.save]),id);}
});
test('2014 cantrips use total character thresholds, not class level or 2024 damage',()=>{
 for(const[level,dice]of[[1,'1к4'],[4,'1к4'],[5,'2к4'],[10,'2к4'],[11,'3к4'],[16,'3к4'],[17,'4к4'],[20,'4к4']])assert.equal(Facts.summary(get('vicious-mockery'),level),'спас МДР · '+dice+' психический');
 assert.match(Facts.summary(get('vicious-mockery'),undefined),/1к4 психический \(база\)/);assert.match(Facts.summary(get('chill-touch'),5),/дальн. атака · 2к8 некротический/);
});
test('healing and leveled damage are marked base; projectiles and successful save retain their qualifiers',()=>{
 assert.equal(Facts.summary(get('cure-wounds'),5),'лечение 1к8+мод. (база)');assert.equal(Facts.summary(get('healing-word'),5),'лечение 1к4+мод. (база)');
 assert.equal(Facts.summary(get('magic-missile'),5),'3×(1к4+1) силовое поле (база)');assert.equal(Facts.summary(get('fireball'),5),'спас ЛОВ · 8к6 огонь (база) · успех: ½');assert.equal(Facts.summary(get('hold-person'),5),'спас МДР · паралич гуманоида');
 assert.equal(Object.keys(definitions).length,16);
});
test('changed personal snapshots, source versions, edition and circle never inherit facts by name or ID alone',()=>{
 for(const change of[e=>e.text+=' Local house rule',e=>e.source.version+=' edited',e=>e.source.url='https://example.com',e=>e.ruleset='5e-2024',e=>e.spell.level=1,e=>e.id='personal:mockery']){const e=structuredClone(get('vicious-mockery'));change(e);assert.equal(Facts.summary(e,5),null);}
 assert.equal(Facts.summary(null,5),null);assert.equal(Facts.summary(get('druidcraft'),5),null);
});
