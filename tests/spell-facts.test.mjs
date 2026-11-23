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
 for(const change of[e=>e.text+=' Local house rule',e=>e.source.version+=' edited',e=>e.source.url='https://example.com',e=>e.ruleset='5e-2024',e=>e.kind='item',e=>e.spell.level=1,e=>e.id='personal:mockery']){const e=structuredClone(get('vicious-mockery'));change(e);assert.equal(Facts.calculate(e,5),null);assert.equal(Facts.summary(e,5),null);}
 assert.equal(Facts.summary(null,5),null);assert.equal(Facts.summary(get('druidcraft'),5),null);
});

test('structured cantrip facts scale at total-level boundaries without Russian presentation',()=>{
 const entry=get('acid-splash'),before=structuredClone(entry);
 for(const[level,count]of[[1,1],[4,1],[5,2],[10,2],[11,3],[16,3],[17,4],[20,4]]){
  assert.deepEqual(Facts.calculate(entry,level),{savingThrow:'dex',attack:null,damage:{dice:{count,sides:6},bonus:0,type:'acid',projectiles:null,basis:'character-level'},healing:null,onSuccessfulSave:null,effect:null});
 }
 assert.deepEqual(entry,before);
});

test('unknown or invalid character level means base dice, never an assumed fifth level',()=>{
 for(const level of[undefined,null,NaN,'5',0,21,4.5]){
  const f=Facts.calculate(get('acid-splash'),level);assert.deepEqual(f.damage.dice,{count:1,sides:6});assert.equal(f.damage.basis,'base');assert.equal(Facts.summary(get('acid-splash'),level),'спас ЛОВ · 1к6 кислота (база)');
 }
});

test('Russian formatter is separate from the rule calculation and does not mutate facts',()=>{
 const f=Facts.calculate(get('acid-splash'),5);f.damage.dice.count=7;const before=structuredClone(f);
 assert.equal(Facts.format(f),'спас ЛОВ · 7к6 кислота');assert.deepEqual(f,before);assert.equal(Facts.calculate(get('acid-splash'),5).damage.dice.count,2);
 for(const[level,dice]of[[4,'1к6'],[5,'2к6'],[10,'2к6'],[11,'3к6'],[16,'3к6'],[17,'4к6']])assert.equal(Facts.format(Facts.calculate(get('acid-splash'),level)),'спас ЛОВ · '+dice+' кислота');
 assert.equal(Facts.format(null),null);
});

test('half-on-save, projectiles, healing modifier and effect are structured facts',()=>{
 const fire=Facts.calculate(get('fireball'),17);assert.deepEqual(fire.damage,{dice:{count:8,sides:6},bonus:0,type:'fire',projectiles:null,basis:'base'});assert.deepEqual(fire.onSuccessfulSave,{damageMultiplier:0.5});assert.equal(fire.savingThrow,'dex');
 assert.deepEqual(Facts.calculate(get('magic-missile'),5).damage,{dice:{count:1,sides:4},bonus:1,type:'force',projectiles:3,basis:'base'});
 assert.deepEqual(Facts.calculate(get('cure-wounds'),5).healing,{dice:{count:1,sides:8},addSpellcastingModifier:true,basis:'base'});assert.equal(Facts.calculate(get('hold-person'),5).effect,'humanoid-paralysis');
 for(const entry of entries)for(const level of[undefined,5,17])assert.equal(Facts.summary(entry,level),Facts.format(Facts.calculate(entry,level)));
});

test('personal changed text with original ID and prototype-like IDs cannot claim checked facts',()=>{
 const e=structuredClone(get('acid-splash'));e.source.usage='personal';e.text+=' Личное изменение: 9d20.';assert.equal(Facts.calculate(e,5),null);assert.equal(Facts.summary(e,5),null);
 for(const id of['__proto__','constructor','toString'])assert.equal(Facts.calculate({...e,id},5),null);
});
