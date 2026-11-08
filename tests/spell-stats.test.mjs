import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateCharacterSheet} from '../server/character-sheet.mjs';
import {templateStats} from '../server/character-stats.mjs';
import {openStore} from '../server/store.mjs';
import {validateTransfer} from '../server/transfer.mjs';
const context=vm.createContext({});vm.runInContext(readFileSync(new URL('../client/character-sheet.js',import.meta.url),'utf8'),context);
const client=vm.runInContext('SkazCharacterSheet',context);
const sheet=(spellcasting={ability:'cha',dcOverride:null,attackOverride:null})=>({ruleset:'5e-2014',ancestry:'',className:'Бард',subclass:'',level:5,counters:[],spellcasting});
const cmd=(s,value)=>({mutationId:randomUUID(),expectedRevision:s.read().revision,characterId:s.read().context.characterId,sheet:value});
test('2014 spell DC and attack use total level, floor modifiers, explicit casting and separate overrides',()=>{
 const bard=client.spellStats(templateStats,null);assert.equal(bard.dc,15);assert.equal(bard.attack,7);
 for(const [level,bonus] of [[1,2],[4,2],[5,3],[8,3],[9,4],[12,4],[13,5],[16,5],[17,6],[20,6]])assert.equal(client.spellStats(templateStats,{...sheet(),level}).proficiency,bonus);
 assert.equal(client.spellStats(templateStats,sheet(null)),null);const old=sheet();delete old.spellcasting;assert.equal(client.spellStats(templateStats,old),null);
 const stats={...templateStats,abilities:{...templateStats.abilities,int:7}};
 assert.equal(client.spellStats(stats,sheet({ability:'int',dcOverride:null,attackOverride:null})).dc,9);
 const override=sheet({ability:'cha',dcOverride:0,attackOverride:-2});assert.equal(client.spellStats(templateStats,override).dc,0);assert.equal(client.spellStats(templateStats,override).attack,-2);
 assert.equal((client.spellTiles(templateStats,override).match(/изменено вручную/g)||[]).length,2);assert.equal(client.spellTiles(templateStats,sheet(null)),'');
});
test('client and server casting validators reject malformed data without changing legacy sheets',()=>{
 const old=sheet();delete old.spellcasting;assert.deepEqual(validateCharacterSheet(old),old);assert.equal(JSON.stringify(client.validate(old)),JSON.stringify(old));
 for(const casting of [null,{ability:'wis',dcOverride:100,attackOverride:40},{ability:'int',dcOverride:0,attackOverride:-20}]){const value=sheet(casting);assert.deepEqual(validateCharacterSheet(value),value);assert.equal(JSON.stringify(client.validate(value)),JSON.stringify(value));}
 for(const casting of [{ability:'str',dcOverride:null,attackOverride:null},{ability:'cha',dcOverride:'15',attackOverride:null},{ability:'cha',dcOverride:-1,attackOverride:null},{ability:'cha',dcOverride:101,attackOverride:null},{ability:'cha',dcOverride:null,attackOverride:41},{ability:'cha',dcOverride:null,attackOverride:1.5},{ability:'cha',dcOverride:null},[],undefined]){assert.throws(()=>validateCharacterSheet(sheet(casting===undefined?{}:casting)));assert.throws(()=>client.validate(sheet(casting===undefined?{}:casting)));}
 const draft={...sheet(),level:'5',spellcasting:{ability:'cha',dcOverride:'',attackOverride:'-'}};assert.equal(client.validDraft(draft),true);assert.equal(client.validDraft({...draft,spellcasting:{...draft.spellcasting,other:true}}),false);
});
test('casting survives database restart and v10 transfer; older formats refuse silent loss',()=>{
 const file=join(mkdtempSync(join(tmpdir(),'skaz-casting-')),'db.sqlite');let s=openStore(file);
 try{const value=sheet({ability:'cha',dcOverride:18,attackOverride:9}),request=cmd(s,value);s.saveCharacterSheet(request);assert.equal(s.saveCharacterSheet(request).replayed,true);assert.deepEqual(s.read().characterSheet,value);s.close();s=openStore(file);assert.deepEqual(s.read().characterSheet,value);
 const exported=s.exportActive(10);const imported=openStore(':memory:');try{const request={mutationId:randomUUID(),expectedRevision:0,destination:'new-campaign',file:exported};imported.importActive(request);assert.deepEqual(imported.read().characterSheet,value);assert.equal(imported.importActive(request).replayed,true);}finally{imported.close();}assert.deepEqual(validateTransfer(exported).characterSheet,value);assert.throws(()=>s.exportActive(9),{status:409});assert.throws(()=>validateTransfer({...exported,schemaVersion:9}),{status:422});
 const old=sheet();delete old.spellcasting;s.saveCharacterSheet(cmd(s,old));assert.deepEqual(validateTransfer(s.exportActive(9)).characterSheet,old);
 }finally{s.close();}
});
test('save proficiencies are explicit, unique, preserved and shown without inventing skill training',()=>{
 const value={...sheet(null),saveProficiencies:['str','con']};assert.deepEqual(validateCharacterSheet(value),value);assert.equal(JSON.stringify(client.validate(value)),JSON.stringify(value));assert.equal((client.abilityRow(templateStats,value).match(/владение спасброском/g)||[]).length,2);assert.equal((client.abilityRow(templateStats,null).match(/владение спасброском/g)||[]).length,2);
 for(const bad of [['str','str'],['STR'],'dex',[null]]){assert.throws(()=>validateCharacterSheet({...value,saveProficiencies:bad}));assert.throws(()=>client.validate({...value,saveProficiencies:bad}));}
 context.SkazStorage={stats:()=>templateStats,sheet:()=>value};let html='';context.modal=text=>html=text;client.checks();assert.match(html,/СИЛ · проверка -1/);assert.match(html,/Спасбросок \+2 ●/);assert.match(html,/не включает владение навыком/);
});
