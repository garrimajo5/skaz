import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../catalog/'+p,import.meta.url),'utf8').replace(/^\uFEFF/,''));
const proposal=read('weapon-canonical-proposal-2014.json'),rows=read('dndsu-equipment-discovery.json').articles.find(a=>a.url.endsWith('/96-arms/')).records;
test('weapon mapping keeps every observation and copper/silver/gold prices distinct',()=>{
 assert.equal(proposal.records.length,37);
 assert.deepEqual(new Set(proposal.records.map(r=>r.observationId)),new Set(rows.map(r=>r.observationId)));
 assert.equal(new Set(proposal.records.map(r=>r.proposedCanonicalId)).size,37);
 for(const r of proposal.records){const o=rows.find(x=>x.observationId===r.observationId);assert.equal(r.observedName,o.name);assert.equal(r.observedPrice,o.priceText);const m=o.priceText.match(/^(\d+)\s+(мм|см|зм)$/);assert.ok(m);assert.equal(r.costCp,Number(m[1])*({'мм':1,'см':10,'зм':100}[m[2]]));assert.equal(r.sourcePage,66);assert.equal(r.fullRules,'unverified');}
 assert.equal(proposal.records.find(r=>r.nameEn==='Dart').costCp,5);
 assert.equal(proposal.records.find(r=>r.nameEn==='Quarterstaff').costCp,20);
});
test('weapon variants remain distinct and new candidates do not collide with runtime or armor IDs',()=>{
 const ids=new Set([...bundledCatalog().bundle.entries.map(r=>r.id),...read('armor-canonical-proposal-2014.json').records.map(r=>r.proposedCanonicalId)]);
 for(const r of proposal.records)assert.ok(!ids.has(r.proposedCanonicalId));
 const count=c=>proposal.records.filter(r=>r.category===c).length;
 assert.deepEqual(['simple-melee','simple-ranged','martial-melee','martial-ranged'].map(count),[10,4,18,5]);
 assert.equal(proposal.status,'canonical-identity-proposal');
});
