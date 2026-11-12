import test from 'node:test';
import assert from 'node:assert/strict';
import {spellLearningMode,spellPresentation} from '../server/spell-learning.mjs';
test('2014 confirmed classes select their learning policy',()=>{
 for(const classId of ['bard','ranger','sorcerer','warlock'])assert.equal(spellLearningMode({classId}),'known');
 for(const classId of ['cleric','druid','paladin','artificer'])assert.equal(spellLearningMode({classId}),'prepared');
 assert.equal(spellLearningMode({classId:'wizard'}),'spellbook');
 for(const classId of ['fighter','Bard','Бард',undefined])assert.equal(spellLearningMode({classId}),null);
});
test('manual sheets require explicit policy, never infer from class text',()=>{
 assert.equal(spellLearningMode({manual:true,classId:'bard'}),null);
 for(const selectedMode of ['known','prepared','spellbook'])assert.equal(spellLearningMode({manual:true,selectedMode}),selectedMode);
 assert.equal(spellLearningMode({manual:true,selectedMode:'other'}),null);
});
test('legacy prepared marks of known casters remain stored but display known',()=>{
 for(const status of ['known','prepared'])assert.deepEqual(spellPresentation(status,'known'),{storedStatus:status,effectiveStatus:'known',label:'Известно',availableInPlay:true});
});
test('prepared and spellbook casters retain preparation behavior',()=>{
 for(const mode of [null,'prepared','spellbook']){
 assert.equal(spellPresentation('known',mode).availableInPlay,false);
 assert.equal(spellPresentation('prepared',mode).availableInPlay,true);
 assert.equal(spellPresentation('prepared',mode).label,'Подготовлено');
 }
 assert.throws(()=>spellPresentation('remove','known'));
 assert.throws(()=>spellPresentation('known','invented'));
});
import {openStore} from '../server/store.mjs';
import {randomUUID} from 'node:crypto';
test('store exposes policy without migrating spell marks or transfer format',()=>{
 const s=openStore(':memory:');try{
 assert.equal(s.read().spellLearning,'known');assert.equal(s.spellbook().spellLearning,'known');
 s.catalog.installBundled({version:s.catalog.previewBundled().version});
 const cmd=extra=>({mutationId:randomUUID(),expectedRevision:s.read().revision,characterId:s.read().context.characterId,...extra});
 s.setSpell(cmd({catalogId:'srd51:2014:spell:light',status:'prepared'}));
 assert.equal(s.spellbook().entries[0].status,'prepared');
 const transfer=s.exportActive(12);assert.equal(Object.hasOwn(transfer,'spellLearning'),false);
 s.saveCharacterSheet(cmd({sheet:{ruleset:'5e-2014',ancestry:'',className:'Бард',subclass:'',level:5,counters:[]}}));
 assert.equal(s.read().spellLearning,null);assert.equal(s.spellbook().spellLearning,null);
 assert.equal(s.spellbook().entries[0].status,'prepared');
 s.saveCharacterSheet(cmd({sheet:null}));assert.equal(s.read().spellLearning,'known');
 }finally{s.close();}
});

test('manual learning choice survives transfer and rejects unsupported values and old exports',()=>{
 const s=openStore(':memory:');try{
 const base={ruleset:'5e-2014',ancestry:'',className:'Мой класс',subclass:'',level:1,counters:[]};
 const cmd=sheet=>({mutationId:randomUUID(),expectedRevision:s.read().revision,characterId:s.read().context.characterId,sheet});
 for(const spellLearning of ['known','prepared','spellbook',null]){
 s.saveCharacterSheet(cmd({...base,spellLearning}));assert.equal(s.read().spellLearning,spellLearning);
 assert.equal(s.exportActive(12).characterSheet.spellLearning,spellLearning);
 assert.throws(()=>s.exportActive(9),{status:409});
 }
 const before=s.read();assert.throws(()=>s.saveCharacterSheet(cmd({...base,spellLearning:'automatic'})),{status:422});assert.deepEqual(s.read(),before);
 }finally{s.close();}
});

test('old sheet editor cannot silently erase an explicit learning choice',()=>{
 const s=openStore(':memory:');try{
 const base={ruleset:'5e-2014',ancestry:'',className:'Мой класс',subclass:'',level:1,counters:[]};
 const cmd=sheet=>({mutationId:randomUUID(),expectedRevision:s.read().revision,characterId:s.read().context.characterId,sheet});
 s.saveCharacterSheet(cmd({...base,spellLearning:'known'}));const before=s.read();
 assert.throws(()=>s.saveCharacterSheet(cmd(base)),{status:409});assert.deepEqual(s.read(),before);
 s.saveCharacterSheet(cmd({...base,spellLearning:null}));assert.equal(s.read().spellLearning,null);
 }finally{s.close();}
});

test('learning policy round-trip preserves marks and counters, rejects malformed imports atomically',()=>{
 for(const spellLearning of ['known','prepared','spellbook',null]){
  const a=openStore(':memory:'),b=openStore(':memory:');try{
   a.catalog.installBundled({version:a.catalog.previewBundled().version});
   const command=extra=>({mutationId:randomUUID(),expectedRevision:a.read().revision,characterId:a.read().context.characterId,...extra});
   a.setSpell(command({catalogId:'srd51:2014:spell:shield',status:'prepared'}));
   const sheet={ruleset:'5e-2014',ancestry:'',className:'Вымышленный маг',subclass:'',level:3,spellLearning,counters:[{id:'spell-slots',name:'Ячейки',current:1,max:3}]};
   a.saveCharacterSheet(command({sheet}));
   const file=a.exportActive(12),request={mutationId:randomUUID(),expectedRevision:b.read().revision,destination:'new-campaign',file};
   b.importActive(request);
   assert.equal(b.read().spellLearning,spellLearning);assert.deepEqual(b.read().characterSheet,sheet);
   assert.equal(b.spellbook().entries[0].status,'prepared');assert.equal(b.importActive(request).replayed,true);
   const invalid=structuredClone(file);invalid.characterSheet.spellLearning='automatic';const before=b.read();
   assert.throws(()=>b.importActive({...request,mutationId:randomUUID(),expectedRevision:before.revision,file:invalid}),{status:422});
   assert.deepEqual(b.read(),before);
  }finally{a.close();b.close();}
 }
});
