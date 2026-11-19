import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reviewObservedNames,nameComparisonKey} from '../scripts/catalog-observed-name-review.mjs';
const row=(id,en,section='bestiary',sourceIds=['101'])=>({id,section,names:{en},sourceIds});

test('matching is section-scoped and never merges IDs, sources or versions',()=>{
 const input={records:[row('one','Goblin','bestiary',['101']),row('two','Goblin','bestiary',['158']),row('spell','Goblin','spells',['101'])]};
 const before=structuredClone(input),r=reviewObservedNames(input);
 assert.deepEqual(input,before);assert.equal(r.duplicateNameGroups.length,1);
 assert.deepEqual(r.duplicateNameGroups[0].members.map(x=>x.id),['one','two']);
 assert.deepEqual(r.duplicateNameGroups[0].sharedSourceIds,[]);
 assert.equal(r.duplicateNameGroups[0].accepted,false);assert.equal(r.duplicateNameGroups[0].canonicalId,null);
 assert.equal(r.complete,false);assert.equal(r.approvedDenominator,null);
});

test('only review keys normalize typography, whitespace, case and NFC; accents are retained',()=>{
 assert.equal(nameComparisonKey('  Wizard’s\u00a0Staff—One '),"wizard's staff-one");
 assert.equal(nameComparisonKey('E\u0301lan'),nameComparisonKey('Élan'));
 assert.notEqual(nameComparisonKey('Élan'),nameComparisonKey('Elan'));
 const r=reviewObservedNames({records:[row('a','Wizard’s Staff'),row('b',"wizard's  staff")]});
 assert.equal(r.duplicateNameGroups[0].reason,'typography-or-case-candidate');
 assert.equal(r.duplicateNameGroups[0].members[0].observedName,'Wizard’s Staff');
});

test('Cyrillic lookalikes are explicit unaccepted candidates; unrelated scripts are not transliterated',()=>{
 const input={records:[row('mixed','Swarm of Сreeping Сoins'),row('plain','Swarm of Creeping Coins'),row('other','Swarm of Creeping Coins','spells'),row('unsupported','Goblin гоблин'),row('cyrillic','Сова')]};
 const r=reviewObservedNames(input),mixed=r.scriptDiagnostics.find(x=>x.id==='mixed');
 assert.equal(mixed.candidateName,'Swarm of Creeping Coins');assert.deepEqual(mixed.candidateObservationIds,['plain']);
 assert.deepEqual(mixed.characters,[{character:'С',codePoint:'U+0421',latinLookalike:'C'}]);
 assert.equal(mixed.accepted,false);assert.equal(r.duplicateNameGroups.length,0);
 assert.equal(r.scriptDiagnostics.find(x=>x.id==='unsupported').candidateName,null);
 assert.equal(r.scriptDiagnostics.find(x=>x.id==='cyrillic').candidateName,null);
});

test('empty English names stay research gaps without fabricated translations and order is deterministic',()=>{
 const records=[row('z',null),row('a','  '),row('b','Troodon'),row('c','Troodon')];
 const r=reviewObservedNames({records});assert.deepEqual(r.missingEnglishNameIds,['a','z']);
 assert.deepEqual(r,reviewObservedNames({records:[...records].reverse()}));
});

test('invalid identities, sources and English fields fail instead of silently dropping observations',()=>{
 for(const records of [[row('a','One'),row('a','Two')],[row('','Name')],[row('a','Name','')],[row('a','Name','items',['101','101'])],[row('a',42)],[row('a','Name','items',[null])]])assert.throws(()=>reviewObservedNames({records}));
});

test('saved diagnostics reproduce4973 observations,294 name groups and five script cases with pinned SHA',()=>{
 const path='catalog/scope-register-2014.json';const raw=readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
 const actual=reviewObservedNames(JSON.parse(raw));
 const {inputSha256,...saved}=JSON.parse(readFileSync(new URL('../catalog/observed-name-review-2014.json',import.meta.url),'utf8'));
 assert.deepEqual(actual,saved);assert.deepEqual(inputSha256,{[path]:createHash('sha256').update(raw).digest('hex')});
 assert.deepEqual(actual.summary,{observedPages:4973,namedPages:4968,missingEnglishNames:5,duplicateNameGroups:294,observationsInNameGroups:618,scriptDiagnostics:5});
 assert.deepEqual(actual.duplicateNameGroups.find(g=>g.comparisonKey==='troodon').members.map(r=>r.id),['dndsu:bestiary:5977','dndsu:bestiary:6005']);
 assert.equal(actual.scriptDiagnostics.find(r=>r.id==='dndsu:items:6459').candidateName,null);
});
