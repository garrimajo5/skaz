import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {reviewMonsterVersions,buildMonsterVersions} from '../scripts/review-monster-version-units-2014.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url)));
const inputs=()=>[read('effective-m0-review-2014.json'),read('numeric-source-scope-policy-2014.json'),read('mtf-monster-version-publication-evidence-2014.json')];
test('MToF/MotM preserves224 observations and reproduces110 publication pairs without accepting a denominator',()=>{
 const data=inputs(),before=JSON.stringify(data),r=reviewMonsterVersions(...data,'mtof-motm');
 assert.deepEqual(r.summary,{consideredGroups:112,preservedObservations:224,publicationEvidencedObservations:221,proposedSeparateVersionGroups:110,proposedVersionUnits:220,unresolvedGroups:2,acceptedCanonicalUnits:0});
 assert.equal(r.accepted,false);assert.equal(r.complete,false);assert.equal(r.approvedDenominator,null);assert.equal(JSON.stringify(data),before);
 assert.deepEqual(buildMonsterVersions('mtof-motm'),read('mtf-monster-version-unit-proposals-2014.json'));
});
test('same-name Tortle monster is bound to the bestiary chapter, never its playable species',()=>{
 const data=inputs(),r=reviewMonsterVersions(...data,'mtof-motm'),tortle=r.groups.find(g=>g.name==='tortle');
 assert.equal(tortle.proposal,'keep-separate-publication-versions');assert.ok(tortle.units.every(u=>u.publicationEvidence.targetUrl.includes('/bestiary')));
 data[2].sources.find(s=>s.sourceId==='158').records.find(r=>r.name==='tortle').targetUrl='https://www.dndbeyond.com/sources/motm/fantastical-races-continued#Tortle';
 assert.throws(()=>reviewMonsterVersions(...data,'mtof-motm'),/Foreign index target/);
});
test('apostrophe mismatch and absent Sacred Statue stay unresolved without inferred aliases',()=>{
 const r=buildMonsterVersions('mtof-motm');
 assert.equal(r.groups.find(g=>g.name==="githyanki kith'rak").proposal,'retain-unresolved-publication-attribution');
 const statue=r.groups.find(g=>g.name==='sacred statue');assert.equal(statue.proposal,'retain-unresolved-publication-attribution');assert.equal(statue.units.filter(u=>u.publicationEvidence).length,1);
});
test('publication pairs cannot exchange witnesses or source policies',()=>{
 assert.throws(()=>reviewMonsterVersions(...inputs()),/Selected names/);
 const data=inputs();data[1].records.find(r=>r.sourceId==='113').disposition='excluded';assert.throws(()=>reviewMonsterVersions(...data,'mtof-motm'),/policy/);
 for(const pair of ['','unknown','__proto__','constructor'])assert.throws(()=>buildMonsterVersions(pair),/Unsupported/);
});
test('Volo/MotM output is unchanged and its observations do not overlap the MToF selection',()=>{
 const old=buildMonsterVersions(),current=buildMonsterVersions('mtof-motm');assert.deepEqual(old,read('monster-version-unit-proposals-2014.json'));
 const ids=new Set(old.groups.flatMap(g=>g.units.map(u=>u.observationId)));assert.ok(current.groups.flatMap(g=>g.units).every(u=>!ids.has(u.observationId)));
});
test('an empty CLI pair cannot silently select the default report',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/review-monster-version-units-2014.mjs',import.meta.url)),'--pair='],{encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/Unsupported publication pair/);
});
