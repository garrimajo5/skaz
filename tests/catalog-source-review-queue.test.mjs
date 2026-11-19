import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildSourceReviewQueue } from '../scripts/catalog-source-review-queue.mjs';
const raw=['scope-register-2014.json','numeric-source-scope-policy-2014.json'].map(path=>readFileSync(new URL('../catalog/'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n'));
const actual=raw.map(text=>JSON.parse(text));
const fixture=()=>({records:[
 {sourceId:'official',observedTitle:'Official fixture',disposition:'eligible-publication-records-need-review'},
 {sourceId:'third-party',observedTitle:'Excluded fixture',disposition:'excluded-third-party'},
 {sourceId:'unreviewed',observedTitle:'Unknown fixture',disposition:'not-reviewed-by-this-audit'},
]});
const page=(id,sourceIds,inclusion='candidate-2014')=>({id,sourceIds,inclusion});

test('base routes keep publication eligibility distinct from acceptance',()=>{
 const scope={records:[
 page('prior-exclusion',['official'],'excluded-homebrew'),
 page('excluded',['third-party']), page('mixed',['official','third-party']),
 page('empty',[]),page('unknown',['not-registered']),
 page('pending',['official','unreviewed']),
 page('context',['official'],'needs-source-review'), page('version',['official']),
 ]};
 const result=buildSourceReviewQueue(scope,fixture());
 assert.deepEqual(result.pageGroups,{
 'excluded-by-reference-scope':['prior-exclusion'],
 'excluded-by-reviewed-source-policy':['excluded'],
 'mixed-excluded-and-other-sources':['mixed'],
 'needs-source-identification':['empty','unknown'],
 'needs-publication-review':['pending'], 'needs-publication-identification':[],
 'needs-reference-scope-review':['context'],
 'ready-for-version-and-rights-review':['version'],
 });
 assert.equal(result.summary.observedPages,8);assert.equal(result.summary.groupedPages,8);
 assert.equal(result.approvedDenominator,null);assert.equal(result.complete,false);
 assert.ok(!('includedPages' in result));
});

test('empty or partially known sources cannot pass by vacuous all-official check',()=>{
 const result=buildSourceReviewQueue({records:[page('none',[]),page('partial',['official','missing']),page('unreviewed',['unreviewed'])]},fixture());
 assert.deepEqual(result.pageGroups['ready-for-version-and-rights-review'],[]);
 assert.deepEqual(result.pageGroups['needs-source-identification'],['none','partial']);
 assert.deepEqual(result.pageGroups['needs-publication-review'],['unreviewed']);
});

test('source priority counts references, not missing records, and preserves unknown identity',()=>{
 const result=buildSourceReviewQueue({records:[page('a',['unreviewed','missing']),page('b',['unreviewed']),page('c',['third-party'])]},fixture());
 assert.deepEqual(result.sourceReviewPriority,[
 {sourceId:'unreviewed',observedTitle:'Unknown fixture',status:'publication-not-reviewed',pageReferences:2},
 {sourceId:'missing',observedTitle:null,status:'not-in-numeric-source-audit',pageReferences:1},
 ]);
});

test('duplicate pages and invalid source identities are rejected instead of double counted',()=>{
 for(const rows of [[page('same',['official']),page('same',['official'])],[page('a',['official','official'])],[page('a',[''])],[page('a',[42])],[page('a',null)],[page('a',['official'],'new-unknown-scope')]]){
 assert.throws(()=>buildSourceReviewQueue({records:rows},fixture()));
 }
 const source=fixture();source.records.push(source.records[0]);assert.throws(()=>buildSourceReviewQueue({records:[]},source),/Invalid source/);
 source.records.pop();source.records[0].disposition='accepted';assert.throws(()=>buildSourceReviewQueue({records:[]},source),/Invalid source/);
});

test('actual queue exhaustively partitions all4973 pages and preserves six newly excluded observations',()=>{
 const before=structuredClone(actual);const result=buildSourceReviewQueue(...actual);
 const ids=Object.values(result.pageGroups).flat();
 assert.equal(ids.length,4973);assert.equal(new Set(ids).size,4973);
 assert.deepEqual(new Set(ids),new Set(actual[0].records.map(row=>row.id)));
 assert.deepEqual(result.pageGroups['excluded-by-reviewed-source-policy'],['dndsu:items:4642','dndsu:items:4644','dndsu:items:4680','dndsu:items:4681','dndsu:items:4682','dndsu:items:4683']);
 assert.equal(result.pageGroups['excluded-by-reference-scope'].length,81);
 assert.deepEqual(actual,before);
 const saved=JSON.parse(readFileSync(new URL('../catalog/source-review-queue-2014.json',import.meta.url),'utf8'));
 const {inputSha256,...data}=saved;assert.deepEqual(data,result);
 assert.deepEqual(inputSha256,Object.fromEntries(['catalog/scope-register-2014.json','catalog/numeric-source-scope-policy-2014.json'].map((p,i)=>[p,createHash('sha256').update(raw[i]).digest('hex')])));
});

test('organized-play source grouping requires title identification even beside an official book',()=>{
 const sources=fixture();sources.records.push({sourceId:'league',observedTitle:'Adventurers League fixture',disposition:'needs-publication-identification'});
 const result=buildSourceReviewQueue({records:[page('group',['league']),page('mixed-official',['league','official']),page('excluded-mixed',['league','third-party'])]},sources);
 assert.deepEqual(result.pageGroups['needs-publication-identification'],['group','mixed-official']);
 assert.deepEqual(result.pageGroups['mixed-excluded-and-other-sources'],['excluded-mixed']);
 assert.deepEqual(result.pageGroups['ready-for-version-and-rights-review'],[]);
 assert.equal(result.sourceReviewPriority[0].status,'identify-publications-within-source-group');
 assert.equal(result.sourceReviewPriority[0].pageReferences,3);
 assert.equal(result.summary.pendingPublicationSourceIds,1);
});
