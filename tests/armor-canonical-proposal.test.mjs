import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../catalog/'+p,import.meta.url),'utf8').replace(/^\uFEFF/,''));
const proposal=read('armor-canonical-proposal-2014.json'),discovery=read('dndsu-equipment-discovery.json');
test('armor identities preserve all thirteen observations and agree with observed costs',()=>{
 const rows=discovery.articles.find(a=>a.url.endsWith('/95-armor-and-shields/')).records;
 assert.equal(proposal.records.length,13);
 assert.deepEqual(new Set(proposal.records.map(r=>r.observationId)),new Set(rows.map(r=>r.observationId)));
 assert.equal(new Set(proposal.records.map(r=>r.proposedCanonicalId)).size,13);
 for(const r of proposal.records){const original=rows.find(x=>x.observationId===r.observationId);assert.equal(r.observedName,original.name);assert.equal(r.observedPrice,original.priceText);assert.equal(r.costGp,Number(original.priceText.replace(/\s/g,'').replace('зм.','')));assert.ok([63,64].includes(r.sourcePage));assert.equal(r.fullRules,'unverified');}
});
test('new canonical candidates do not replace existing runtime entries or collapse armor variants',()=>{
 const ids=new Set(bundledCatalog().bundle.entries.map(r=>r.id));
 for(const r of proposal.records)assert.ok(!ids.has(r.proposedCanonicalId),'Resolve existing ID before proposing a new identity: '+r.proposedCanonicalId);
 const count=category=>proposal.records.filter(r=>r.category===category).length;
 assert.deepEqual(['light-armor','medium-armor','heavy-armor','shield'].map(count),[3,5,4,1]);
 assert.notEqual(proposal.records.find(r=>r.nameEn==='Ring mail').proposedCanonicalId,proposal.records.find(r=>r.nameEn==='Chain mail').proposedCanonicalId);
 assert.equal(proposal.status,'canonical-identity-proposal');
});
