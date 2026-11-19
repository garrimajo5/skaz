import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildNamedSourceReview} from '../scripts/catalog-named-source-review.mjs';
const paths=['catalog/scope-register-2014.json','catalog/numeric-source-scope-policy-2014.json','catalog/source-bibliography-evidence.json','catalog/named-race-source-policy-2014.json'];
const raw=paths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n'));
const inputs=()=>raw.map(JSON.parse);
test('only two supported named publications advance; all observations remain partitioned',()=>{
 const args=inputs(),snapshot=JSON.stringify(args),r=buildNamedSourceReview(...args);
 assert.equal(r.originalSummary.byDisposition['needs-source-identification'],3);
 assert.equal(r.summary.byDisposition['needs-source-identification'],1);
 assert.equal(r.summary.byDisposition['ready-for-version-and-rights-review'],4840);
 assert.deepEqual(r.pageGroups['needs-source-identification'],['dndsu:race:169']);
 const ids=Object.values(r.pageGroups).flat();assert.equal(ids.length,4973);assert.equal(new Set(ids).size,4973);
 assert.equal(JSON.stringify(args),snapshot);assert.equal(r.approvedDenominator,null);assert.equal(r.complete,false);
 for(const d of r.namedSourceDecisions){assert.deepEqual(d.originalSourceIds,[]);assert.equal(d.canonicalId,null);assert.equal(d.fullRulesVerified,false);}
});
test('wrong publication links and fabricated numeric identifiers cannot change routing',()=>{
 for(const change of [a=>a[3].records[0].bibliographyId='bibliography:locathah-rising',a=>a[3].records[1].observationUrl+='wrong',a=>a[3].records[1].numericDndsuSourceId='129',a=>a[0].records.find(p=>p.id==='dndsu:race:178').sourceIds=['129'],a=>a[2].records[1].publisher='Other']){const a=inputs();change(a);assert.throws(()=>buildNamedSourceReview(...a));}
});
test('missing duplicate and unrelated source decisions fail',()=>{
 for(const change of [a=>a[3].records.pop(),a=>a[3].records[1]=a[3].records[0],a=>a[3].records[0].observationId='dndsu:race:999',a=>a[2].records.push(a[2].records[0])]){const a=inputs();change(a);assert.throws(()=>buildNamedSourceReview(...a));}
});
test('publisher identity and AL restrictions do not automatically accept Grung',()=>{
 const a=inputs();a[3].records[0].disposition='eligible-publication-records-need-review';assert.throws(()=>buildNamedSourceReview(...a),/status/);
});
test('source review cannot silently accept rules identities or reproduction rights',()=>{
 for(const change of [a=>a[3].complete=true,a=>a[3].approvedDenominator=4973,a=>a[3].records[1].canonicalId='race:locathah',a=>a[3].records[1].fullRulesVerified=true,a=>a[3].records[1].reusePermission='granted',a=>a[3].records[1].exactTextVersion='verified']){const a=inputs();change(a);assert.throws(()=>buildNamedSourceReview(...a));}
});
test('missing and post-2014-rules-era evidence fails',()=>{
 for(const year of [null,2013,2024,'2019']){const a=inputs();a[3].records[1].originalEraEvidence.year=year;assert.throws(()=>buildNamedSourceReview(...a),/era evidence/);}
});
test('saved report reproduces and pins every source input',()=>{
 const r=buildNamedSourceReview(...inputs());r.inputSha256=Object.fromEntries(paths.map((p,i)=>[p,createHash('sha256').update(raw[i]).digest('hex')]));
 assert.deepEqual(r,JSON.parse(readFileSync(new URL('../catalog/named-source-review-2014.json',import.meta.url),'utf8')));
});
