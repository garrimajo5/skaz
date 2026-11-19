import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL('../catalog/'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const proposal=JSON.parse(read('minecraft-source-units-2014.json'));
const source=read('scope-register-2014.json');

test('five creature units and two embedded descriptions cover seven observed identities without merging categories',()=>{
 const actual=JSON.parse(source).records.filter(row=>row.sourceIds.includes(proposal.sourceId));
 assert.equal(actual.length,7);assert.equal(new Set(proposal.records.map(row=>row.observationId)).size,7);
 assert.deepEqual(new Set(proposal.records.map(row=>row.observationId)),new Set(actual.map(row=>row.id)));
 for(const row of proposal.records){const observed=actual.find(p=>p.id===row.observationId);assert.equal(row.nameEn,observed.names.en);assert.equal(row.unitKind==='creature-statblock',observed.section==='bestiary');assert.equal(row.proposedCanonicalId,null);assert.equal(row.fullRules,'unverified');assert.equal(row.exactTextVersion,'unverified');assert.equal(row.reusePermission,'not-established');}
 assert.equal(proposal.records.filter(row=>row.unitKind==='creature-statblock').length,5);
 assert.equal(proposal.records.find(row=>row.nameEn==='End Crystal').unitKind,'embedded-object-description');
 assert.equal(proposal.records.find(row=>row.nameEn==='Ender Pearl').unitKind,'embedded-trait-item');
 assert.equal(proposal.complete,false);assert.equal(proposal.approvedDenominator,null);
 assert.equal(proposal.inputSha256['catalog/scope-register-2014.json'],createHash('sha256').update(source).digest('hex'));
});
