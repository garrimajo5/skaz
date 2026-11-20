import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {paths,reviewArtificerHeadings,verifyArtificerCapture} from '../scripts/catalog-artificer-heading-review.mjs';
import {classBodyEvidence,sha,structureSha} from '../scripts/catalog-class-body-evidence.mjs';
const raw=paths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n'));
const inputs=()=>raw.map(JSON.parse);
test('23 residual headings are classified without adding class features or changing originals',()=>{
 const a=inputs(),before=JSON.stringify(a),r=reviewArtificerHeadings(...a);assert.equal(r.summary.classifiedResidualHeadings,23);assert.equal(r.summary.existingFeatureProposals,43);assert.equal(r.summary.remainingAllClassClassificationHeadings,489);assert.equal(r.summary.remainingArtificerClassificationHeadings,0);assert.equal(JSON.stringify(a),before);assert.equal(r.approvedDenominator,null);assert.equal(r.accepted,false);assert.equal(r.complete,false);
});
test('presentation guidance does not become an extra feature or own the following spell rules',()=>{
 const r=reviewArtificerHeadings(...inputs());assert.equal(r.rows.find(r=>r.headingOrdinal===14).kind,'presentation-guidance');for(const n of [13,14,15,16,17,18])assert.equal(r.rows.find(r=>r.headingOrdinal===n).parentFeatureObservationId,'scope:artificer:class-features:feature.spellcasting');
});
test('missing repeated or unrelated headings cannot reduce the remaining count',()=>{
 for(const mutate of [m=>m.records.pop(),m=>m.records[1]=m.records[0],m=>m.records[0].heading.ordinal=11]){const a=inputs();mutate(a[3]);assert.throws(()=>reviewArtificerHeadings(...a));}
});
test('wrong source title hash or semantic parent fails',()=>{
 for(const mutate of [m=>m.snapshotPageSha256='stale',m=>m.freshCapture.url='https://wrong.example/',m=>m.records[0].heading.title='Other',m=>m.records.find(r=>r.heading.ordinal===15).parentFeatureObservationId=m.records.find(r=>r.heading.ordinal===20).parentFeatureObservationId,m=>m.records[0].parentFeatureObservationId='made-up']){const a=inputs();mutate(a[3]);assert.throws(()=>reviewArtificerHeadings(...a));}
});
test('tables remain components with six and three effects and twenty level rows',()=>{
 for(const n of [1,55,64]){const a=inputs();a[3].records.find(r=>r.heading.ordinal===n).heading.tables[0].rows++;assert.throws(()=>reviewArtificerHeadings(...a),/Table unit/);}
});
test('classification does not certify full rules or a canonical denominator',()=>{
 for(const mutate of [m=>m.accepted=true,m=>m.complete=true,m=>m.approvedDenominator=23,m=>m.records[0].fullRulesVerified=true,m=>m.records[0].canonicalId='invented']){const a=inputs();mutate(a[3]);assert.throws(()=>reviewArtificerHeadings(...a));}
});
test('body extraction separates sidebar from subsequent headings and skips td-based table headers',()=>{
 const html='<div class="card__body new-article"><h3 id="ignored">Rule</h3><p>body</p><h3>Sidebar</h3><p>flavour</p><h4>Table</h4><table><tr class="table_header"><td>Type</td></tr><tr><td>A</td></tr><tr><td>B</td></tr></table><div class="card__footer">';const rows=classBodyEvidence(html);assert.equal(rows.length,3);assert.equal(rows[0].bodySha256,sha('body'));assert.equal(rows[1].bodySha256,sha('flavour'));assert.deepEqual(rows[2].tables,[{rows:2}]);
});
test('changed capture or body hash is rejected independently of classification',()=>{
 const html='<div class="card__body new-article"><h3>One</h3><p>body</p><div class="card__footer">',body=classBodyEvidence(html),m={freshCapture:{sha256:sha(html),headingStructureSha256:structureSha(body)},records:[{heading:body[0]}]};assert.equal(verifyArtificerCapture(m,html).classifiedBodies,1);assert.throws(()=>verifyArtificerCapture(m,html+'changed'),/capture/);m.records[0].heading.bodySha256='changed';assert.throws(()=>verifyArtificerCapture(m,html),/Body/);
});
test('report is reproducible from committed inputs',()=>{const r=reviewArtificerHeadings(...inputs());r.inputSha256=Object.fromEntries(paths.map((p,i)=>[p,sha(raw[i])]));assert.deepEqual(r,JSON.parse(readFileSync(new URL('../catalog/artificer-heading-review-2014.json',import.meta.url),'utf8')));});

test('whole heading structure is pinned beyond the23 classified bodies',()=>{const a=inputs();a[0].pages.find(p=>p.url===a[3].classUrl).headings[129].title+=' changed';assert.throws(()=>reviewArtificerHeadings(...a),/structure changed/);});

 test('only a class token identifies a td-based header, not arbitrary attributes or substrings',()=>{
 const html=`<div class="card__body new-article"><h3>Table</h3><table>
 <tr data-note="table_header"><td>A</td></tr>
 <tr class="not_table_header"><td>B</td></tr>
 <tr data-note='class="table_header"'><td>C</td></tr>
 <tr CLASS='other table_header'><td>Header</td></tr>
 <tr class=table_header><td>Header</td></tr>
 <tr class="other&#32;table_header"><td>Header</td></tr>
 </table><div class="card__footer">`;
 assert.deepEqual(classBodyEvidence(html)[0].tables,[{rows:3}]);
 });
