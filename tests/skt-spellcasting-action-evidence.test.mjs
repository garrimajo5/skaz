import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const raw=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const d=JSON.parse(raw('catalog/skt-spellcasting-action-evidence-2014.json'));
const scope=JSON.parse(raw('catalog/scope-register-2014.json'));
test('action identities preserve book context, observations and unaccepted status',()=>{
 assert.equal(d.actions.length,13);assert.equal(new Set(d.actions.map(r=>r.unitId)).size,13);
 assert.equal(d.accepted,false);assert.equal(d.fullRulesVerified,false);assert.equal(d.automaticPatch,false);assert.equal(d.approvedDenominator,null);
 for(const [path,hash] of Object.entries(d.inputSha256))assert.equal(hash,createHash('sha256').update(raw(path).replace(/\r\n/g,'\n')).digest('hex'));
 for(const r of d.actions){const c=r.observationCandidate;const o=scope.records.find(x=>x.id===c.id);assert.equal(c.name,o.names.en);assert.deepEqual(c.sourceIds,o.sourceIds);assert.equal(c.url,o.url);assert.equal(r.canonicalId,null);assert.equal(r.wholeStatBlockCompared,false);}
 const giant=d.actions.find(r=>r.actor==='The giant');assert.equal(giant.bookPage,256);assert.deepEqual(giant.observationCandidate.sourceIds,['103']);assert.equal(giant.observationCandidate.relation,'same-name-other-book-context');
});
test('unstated limits and separate component waivers remain distinguishable',()=>{
 const actor=name=>d.actions.find(r=>r.actor===name);
 assert.equal(actor('Storvald').saveDc,null);assert.equal(actor('Storvald').spellAttackBonus,null);
 assert.equal(actor('Maegera').groups[0].frequency,'not-stated');
 assert.equal(actor('Maegera').componentWaiver,'material-only');assert.equal(actor('Iymrith').componentWaiver,'all-components');
 assert.equal(actor('Naxene').componentWaiver,'not-stated');assert.equal(actor('The shaman').requiresSacredBundle,true);
});
test('132 action-local spell entries do not replace base-spell time, damage or resource pools',()=>{
 const entries=d.actions.flatMap(r=>r.groups.flatMap(g=>g.spells));assert.equal(entries.length,132);
 assert.equal(entries.filter(s=>s.override?.damage?.dice==='1d10').length,2);
 assert.ok(d.actions.every(r=>r.groups.every(g=>['At will','1/day each','2/day each','not-stated'].includes(g.frequency))));
 const names=entries.filter(s=>s.override?.castingTime==='1 action').map(s=>s.name);
 assert.equal(names.length,10);assert.ok(names.includes('augury'));assert.equal(names.filter(n=>n==='control weather').length,2);
 assert.ok(!entries.some(s=>'spellSlots' in s || 'prepared' in s || 'learned' in s));
});
