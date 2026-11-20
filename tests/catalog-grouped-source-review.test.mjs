import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { reviewGroupedSource } from '../scripts/catalog-grouped-source-review.mjs';

const publication=(id,name='Creature',section='bestiary')=>({id,title:id,publisherStatus:'needs-publisher-status-review',evidenceUrl:'https://example.org/sample.pdf',evidenceLocator:'page1',units:[{name,section,kind:'descriptive-heading',evidenceLocator:'page2'}]});
const observation=(id,name='Creature',section='bestiary',sourceIds=['169'])=>({id,names:{en:name},section,sourceIds});
const fixture=()=>[{sourceId:'169',complete:false,publications:[publication('first')]},{records:[observation('one')]}];

test('primary name evidence remains a candidate, while unrelated groups and sections do not match',()=>{
 const args=fixture();args[1].records.push(observation('other-group','Creature','bestiary',['102']),observation('other-section','Creature','items'),observation('unknown','Other'));
 const original=JSON.stringify(args);const result=reviewGroupedSource(...args);
 assert.equal(JSON.stringify(args),original);assert.equal(result.records.length,3);
 assert.equal(result.records.find(r=>r.observationId==='one').status,'primary-name-candidate-needs-identity-review');
 assert.equal(result.records.find(r=>r.observationId==='other-section').status,'needs-primary-unit-evidence');
 assert.ok(result.records.every(r=>r.accepted===false&&r.canonicalId===null&&r.fullRules==='unverified'&&r.reusePermission==='not-established'));
 assert.equal(result.complete,false);assert.equal(result.approvedDenominator,null);
});

test('same names never collapse observation IDs or competing publication origins',()=>{
 const args=fixture();args[1].records.push(observation('two'));
 let result=reviewGroupedSource(...args);
 assert.ok(result.records.every(r=>r.status==='duplicate-observation-name-needs-identity-review'));
 assert.deepEqual(result.records[0].candidates[0].observationIds,['one','two']);
 args[0].publications.push(publication('second'));result=reviewGroupedSource(...args);
 assert.ok(result.records.every(r=>r.status==='multiple-publications-need-version-review'&&r.duplicateObservationName));
 assert.deepEqual(result.records[0].candidates.map(r=>r.publicationId),['first','second']);
 args[0].publications.reverse();args[1].records.reverse();
 const reversed=reviewGroupedSource(...args);
 assert.deepEqual(new Set(reversed.records.map(r=>r.observationId)),new Set(['one','two']));
 assert.ok(reversed.records.every(r=>!r.accepted&&r.candidates.length===2));
});

test('missing observations are research gaps, not runtime gaps; prose mentions are not stat blocks',()=>{
 const args=fixture();args[0].publications[0].units[0].kind='named-object-in-prose';
 const result=reviewGroupedSource(...args);assert.equal(result.records[0].candidates[0].kind,'named-object-in-prose');
 args[1].records=[];const empty=reviewGroupedSource(...args);assert.equal(empty.records.length,0);assert.equal(empty.unitsWithoutObservation.length,1);assert.equal(empty.complete,false);
});

test('malformed or duplicated identities and ungrounded evidence fail closed',()=>{
 for(const mutate of [
  ([m])=>m.complete=true,([m])=>m.sourceId='',([m])=>m.publications.push(m.publications[0]),
  ([m])=>m.publications[0].evidenceUrl='file:///tmp/sample',([m])=>m.publications[0].evidenceLocator='',
  ([m])=>m.publications[0].publisherStatus='accepted',([m])=>m.publications[0].units.push(m.publications[0].units[0]),
  ([m])=>m.publications[0].units[0].kind='full-statblock',([m])=>m.publications[0].units[0].section='all',
  ([m])=>m.publications[0].units[0].name=' ',([m])=>m.publications[0].units[0].evidenceLocator='',
  ([,s])=>s.records.push(s.records[0]),([,s])=>s.records[0].sourceIds='169'
 ]){const args=fixture();mutate(args);assert.throws(()=>reviewGroupedSource(...args));}
});

test('AL report preserves45 observations, two Troodon IDs and both Eye candidates with pinned inputs',()=>{
 const paths=['catalog/adventurers-league-publication-candidates-2014.json','catalog/scope-register-2014.json'];
 const raw=paths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n'));
 const result=reviewGroupedSource(...raw.map(s=>JSON.parse(s)));
 const {inputSha256,...saved}=JSON.parse(readFileSync(new URL('../catalog/adventurers-league-identity-review-2014.json',import.meta.url),'utf8'));
 assert.deepEqual(result,saved);assert.deepEqual(inputSha256,Object.fromEntries(paths.map((p,i)=>[p,createHash('sha256').update(raw[i]).digest('hex')])));
 assert.deepEqual(result.summary,{publicationsWithMetadata:5,observedPages:45,primaryNamedUnits:14,byStatus:{'needs-primary-unit-evidence':31,'primary-name-candidate-needs-identity-review':11,'duplicate-observation-name-needs-identity-review':2,'multiple-publications-need-version-review':1}});
 assert.deepEqual(result.records.filter(r=>r.duplicateObservationName).map(r=>r.observationId),['dndsu:bestiary:5977','dndsu:bestiary:6005']);
 assert.deepEqual(result.records.find(r=>r.observationId==='dndsu:items:7633').candidates.map(c=>c.publicationId),['DDAL05-18','DDAL05-19']);
 assert.ok(result.records.every(r=>!r.accepted));
});
