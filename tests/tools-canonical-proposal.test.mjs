import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {bundledCatalog} from '../server/bundled-catalog.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../catalog/'+p,import.meta.url),'utf8').replace(/^\uFEFF/,''));
const p=read('tools-canonical-proposal-2014.json'),rows=read('dndsu-equipment-discovery.json').articles.find(a=>a.url.endsWith('/100-tools/')).records;
test('tools keep all 37 observations while two non-SRD games remain explicitly unresolved',()=>{
 assert.equal(p.records.length,35);assert.equal(p.unmatched.length,2);
 const all=[...p.records,...p.unmatched];assert.equal(new Set(all.map(r=>r.observationId)).size,37);assert.deepEqual(new Set(all.map(r=>r.observationId)),new Set(rows.map(r=>r.observationId)));
 assert.deepEqual(p.unmatched.map(r=>r.observedName).sort(),['Драконьи шахматы','Ставка трех драконов'].sort());assert.ok(p.unmatched.every(r=>r.proposedCanonicalId===null&&r.status==='not-in-reviewed-srd-table'));
 for(const r of p.records){const o=rows.find(x=>x.observationId===r.observationId);assert.equal(r.observedName,o.name);assert.equal(r.observedPrice,o.priceText);const m=o.priceText.match(/^(\d+)\s+(см|зм)$/);assert.equal(r.costCp,Number(m[1])*(m[2]==='см'?10:100));assert.equal(r.sourcePage,70);assert.equal(r.fullRules,'unverified');}
});
test('all proposed equipment IDs are unique across three groups and runtime',()=>{
 const all=[...p.records,...read('armor-canonical-proposal-2014.json').records,...read('weapon-canonical-proposal-2014.json').records];assert.equal(all.length,85);assert.equal(new Set(all.map(r=>r.proposedCanonicalId)).size,85);const live=new Set(bundledCatalog().bundle.entries.map(r=>r.id));assert.ok(all.every(r=>!live.has(r.proposedCanonicalId)));
});
