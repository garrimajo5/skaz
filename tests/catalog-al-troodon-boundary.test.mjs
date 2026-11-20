import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const read=p=>JSON.parse(readFileSync(new URL('../catalog/'+p,import.meta.url)));
const evidence=read('al-troodon-boundary-evidence-2014.json'),scope=read('scope-register-2014.json');
test('same English Troodon label preserves two distinct observed units and original names',()=>{
 assert.deepEqual(evidence.records.map(r=>r.observationId),['dndsu:bestiary:5977','dndsu:bestiary:6005']);
 for(const row of evidence.records){const original=scope.records.find(r=>r.id===row.observationId);assert.deepEqual(row.originalNames,original.names);assert.equal(row.url,original.url);assert.deepEqual(row.sourceIds,original.sourceIds);assert.equal(row.originalNames.en,'Troodon');assert.match(row.rawSha256,/^[a-f0-9]{64}$/);}
 const [living,undead]=evidence.records;assert.match(living.sizeType,/Зверь/);assert.match(undead.sizeType,/Нежить/);
 assert.equal(living.selected.armorClass,13);assert.equal(undead.selected.armorClass,11);
 assert.equal(living.selected.hitPoints,undead.selected.hitPoints);
 assert.notDeepEqual(living.selected.hitDice,undead.selected.hitDice);
 assert.notDeepEqual(living.selected.abilities,undead.selected.abilities);
});
test('secondary differences cannot invent a primary zombie title, canonical ID or source approval',()=>{
 assert.equal(evidence.accepted,false);assert.equal(evidence.complete,false);assert.equal(evidence.approvedDenominator,null);assert.equal(evidence.automaticMerge,false);assert.equal(evidence.automaticRename,false);
 for(const r of evidence.records){assert.equal(r.primaryStatBlockRead,false);assert.equal(r.exactTextVersion,'unverified');assert.equal(r.canonicalId,null);assert.equal(r.accepted,false);assert.equal(r.traitNames,undefined);}
 const raw=readFileSync(new URL('../catalog/scope-register-2014.json',import.meta.url),'utf8').replace(/\r\n/g,'\n');assert.equal(evidence.inputSha256['catalog/scope-register-2014.json'],createHash('sha256').update(raw).digest('hex'));
});
