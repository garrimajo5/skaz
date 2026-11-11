import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {seed} from '../server/state.mjs';
import {templateStats} from '../server/character-stats.mjs';
import {previewClassLevel,spellChoiceOptions} from '../server/class-progression.mjs';
import {buildAdvancementChange,validateAdvancementCommand,validateAdvancementLedger} from '../server/class-advancement.mjs';
const hero=(classId='fighter',level=1)=>({revision:7,context:{characterId:'test-character'},state:{...structuredClone(seed),hp:4,maxHp:12,tempHp:3},characterSheet:{ruleset:'5e-2014',ancestry:'Человек',className:classId,subclass:'',level,counters:[]},characterStats:structuredClone(templateStats),spellbook:[],advancement:null});
const command=(s,classId=s.characterSheet.className)=>({mutationId:randomUUID(),expectedRevision:s.revision,characterId:s.context.characterId,classId,fromLevel:s.characterSheet.level,hpMethod:'fixed',hpRoll:null,choices:{},reviewedFeatures:previewClassLevel({classId,fromLevel:s.characterSheet.level,toLevel:s.characterSheet.level+1,constitution:s.characterStats.abilities.con}).requiresFeatureReview});
const next=(s,result)=>({...s,revision:s.revision+1,...result,spellbook:[...s.spellbook,...result.addSpells.map(catalogId=>({catalogId,status:'known'}))]});

test('fighter level 2 produces one complete non-mutating change set and never heals or refills manual counters',()=>{
 const s=hero();s.characterSheet.counters=[{id:'manual-counter',name:'Другой запас',current:1,max:5}];const original=structuredClone(s),r=buildAdvancementChange(s,command(s));
 assert.deepEqual(s,original);assert.equal(r.characterSheet.level,2);assert.equal(r.state.hp,4);assert.equal(r.state.maxHp,20);assert.equal(r.state.tempHp,3);assert.deepEqual(r.characterSheet.counters[0],s.characterSheet.counters[0]);
 assert.deepEqual(r.characterSheet.counters[1],{id:'class-fighter-action-surge',name:'Всплеск действий',current:1,max:1});assert.equal(r.advancement.events.length,1);assert.equal(r.advancement.baselineLevel,1);assert.equal(r.advancement.level,2);assert.ok(r.summary.unmanagedResources.includes('class-fighter-second-wind'));
});

test('stale revision, wrong hero, wrong level and changed class cannot create a change set',()=>{
 const s=hero(),q=command(s);for(const patch of [{expectedRevision:6},{characterId:'other-character'},{fromLevel:2}])assert.throws(()=>buildAdvancementChange(s,{...q,...patch}),{status:409});
 const r=buildAdvancementChange(s,q),s2=next(s,r);s2.characterSheet.level=4;assert.throws(()=>buildAdvancementChange(s2,command(s2)),{status:409});
 s2.characterSheet.level=2;assert.throws(()=>buildAdvancementChange(s2,command(s2,'barbarian')),{status:409});
});

test('missing choices or feature review fail closed, including subclass, feat and optional unsupported replacement',()=>{
 const s=hero(),q=command(s);assert.throws(()=>buildAdvancementChange(s,{...q,reviewedFeatures:[]}),{status:422});assert.throws(()=>buildAdvancementChange(s,{...q,choices:{forged:[]}}),{status:422});
 const level2=hero('fighter',2);assert.throws(()=>buildAdvancementChange(level2,command(level2)),/subclass/);
 const level3=hero('fighter',3),asi=command(level3);assert.throws(()=>buildAdvancementChange(level3,asi),/Не завершён/);asi.choices['fighter:4:ability-score-improvement-or-feat']={feat:'anything'};assert.throws(()=>buildAdvancementChange(level3,asi),/Черты/);
});

test('ASI applies constitution retroactively without healing and preserves unrelated statistics',()=>{
 const s=hero('fighter',3),q=command(s);q.choices['fighter:4:ability-score-improvement-or-feat']={increases:{str:0,dex:0,con:2,int:0,wis:0,cha:0}};
 const r=buildAdvancementChange(s,q);assert.equal(r.characterStats.abilities.con,16);assert.equal(r.state.maxHp,24);assert.equal(r.state.hp,4);assert.equal(r.characterStats.armorClass,s.characterStats.armorClass);assert.equal(r.summary.hitPoints.retroactive,3);
});

test('new resources never silently adopt matching manual names or stable IDs',()=>{
 for(const c of [{id:'manual-counter',name:'Всплеск действий',current:0,max:1},{id:'class-fighter-action-surge',name:'Мой ресурс',current:0,max:1}]){
  const s=hero();s.characterSheet.counters=[c];assert.throws(()=>buildAdvancementChange(s,command(s)),{status:409});assert.equal(s.characterSheet.level,1);
 }
});

test('managed counters retain spent uses and reject missing or manually changed maxima',()=>{
 const s=hero('sorcerer',1),q=command(s);q.choices['sorcerer:2:known-spells']=spellChoiceOptions('sorcerer',2,'known-spells').slice(0,1).map(s=>s.spellId);
 const r=buildAdvancementChange(s,q),s2=next(s,r);assert.equal(r.characterSheet.counters.find(c=>c.id==='class-sorcerer-sorcery').max,2);
 // Sorcerer 2 -> 3 needs metamagic, so use a legitimate later baseline at 4.
 const a=hero('cleric',1),aq=command(a),ar=buildAdvancementChange(a,aq),b=next(a,ar);b.characterSheet.counters.find(c=>c.id==='class-cleric-channel').current=0;
 const br=buildAdvancementChange(b,command(b));assert.equal(br.characterSheet.counters.find(c=>c.id==='class-cleric-channel').current,0);
 b.characterSheet.counters.find(c=>c.id==='class-cleric-channel').max=2;assert.throws(()=>buildAdvancementChange(b,command(b)),{status:409});
 b.characterSheet.counters=[];assert.throws(()=>buildAdvancementChange(b,command(b)),{status:409});
});

test('spell choices are validated, recorded with source, and never duplicate existing spells',()=>{
 const s=hero('wizard',2),q=command(s),options=spellChoiceOptions('wizard',3,'spellbook-spells').map(s=>s.spellId);q.choices['wizard:3:spellbook-spells']=options.slice(0,2);
 const r=buildAdvancementChange(s,q);assert.deepEqual(r.addSpells,options.slice(0,2));assert.equal(r.advancement.spells[0].choiceId,'wizard:3:spellbook-spells');assert.equal(r.advancement.spells[0].acquiredLevel,3);
 assert.throws(()=>buildAdvancementChange(s,{...q,choices:{'wizard:3:spellbook-spells':[options[0],options[0]]}}),{status:422});
 s.spellbook=[{catalogId:options[0],status:'prepared'}];assert.throws(()=>buildAdvancementChange(s,q),{status:422});
});

test('zero HP, death saves, concentration checks and temp HP survive advancement exactly',()=>{
 const s=hero();s.state.hp=0;s.state.deathSaves={successes:1,failures:2,status:'dying'};
 s.state.concentration='Shield';s.state.concentrationChecks=[{id:'check-test-123',spell:'Shield',damage:10,dc:10}];
 const r=buildAdvancementChange(s,command(s));assert.equal(r.state.hp,0);assert.deepEqual(r.state.deathSaves,s.state.deathSaves);assert.deepEqual(r.state.concentrationChecks,s.state.concentrationChecks);assert.equal(r.state.concentration,'Shield');assert.equal(r.state.tempHp,3);
});

test('strict envelopes and ledger reject extra fields, gaps, forged feature review and duplicate sources',()=>{
 const s=hero(),q=command(s),r=buildAdvancementChange(s,q);assert.throws(()=>validateAdvancementCommand({...q,hpDelta:100}),{status:422});
 for(const change of [l=>l.version=2,l=>l.events[0].level=3,l=>l.events[0].featuresReviewed=[],l=>l.resources.push({...l.resources[0]}),l=>l.level=4,l=>l.extra=true]){const l=structuredClone(r.advancement);change(l);assert.throws(()=>validateAdvancementLedger(l),{status:422});}
 const cloned=validateAdvancementLedger(r.advancement);cloned.events[0].featuresReviewed.length=0;assert.ok(r.advancement.events[0].featuresReviewed.length);
});

test('overflow of HP or counter count fails without partially changing the input',()=>{
 const s=hero();s.state.maxHp=999;assert.throws(()=>buildAdvancementChange(s,command(s)),{status:422});assert.equal(s.characterSheet.level,1);
 s.state.maxHp=12;s.characterSheet.counters=Array.from({length:20},(_,i)=>({id:'manual-counter-'+i,name:'Ресурс '+i,current:0,max:1}));assert.throws(()=>buildAdvancementChange(s,command(s)),{status:422});assert.equal(s.characterSheet.counters.length,20);
});
