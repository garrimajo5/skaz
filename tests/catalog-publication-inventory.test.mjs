import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { auditPublicationInventory } from '../scripts/catalog-publication-inventory.mjs';
const source = { records: [{ sourceId: 'book', publicationKind: 'official-wotc-2014-publication' }] };
const unit = (id, name, extra = {}) => ({ id, name, printedPage: 2, ...extra });
const inventory = units => ({ sourceId: 'book', section: 'bestiary', evidenceUrl: 'https://example.test/preview.pdf', evidenceLocator: 'Contents', units });
const observation = (id, name, sourceIds = ['book'], section = 'bestiary') => ({ id, names: { en: name }, sourceIds, section });

test('exact title, other attribution, explicit candidate and no observation remain separate unresolved outcomes', () => {
  const input = inventory([unit('a','Same'),unit('b','Elsewhere'),unit('c','Different',{reviewCandidates:[{observationId:'alias',reason:'Requires version comparison'}]}),unit('d','Absent')]);
  const scope = { records: [observation('same','Same'),observation('other','Elsewhere',['other-book']),observation('alias','Variant'),observation('item','Absent',['book'],'items')] };
  const before = JSON.stringify([input,scope,source]);
  const result = auditPublicationInventory(input,scope,source);
  assert.deepEqual(result.records.map(row=>row.status),['same-name-and-source-needs-version-review','same-name-other-source-needs-attribution-review','explicit-candidate-needs-identity-review','not-found-in-observed-index']);
  assert.ok(result.records.every(row=>row.canonicalId===null && row.accepted===false && row.fullRules==='unverified'));
  assert.equal(result.approvedDenominator,null);assert.equal(result.complete,false);
  assert.equal(JSON.stringify([input,scope,source]),before);
});

test('duplicate names are not resolved by observation order and orphan source pages remain visible', () => {
  const scope={records:[observation('first','Same'),observation('second','Same'),observation('unlisted','Not in contents')]};
  const result=auditPublicationInventory(inventory([unit('a','Same')]),scope,source);
  assert.equal(result.records[0].status,'ambiguous-same-name-and-source');
  assert.deepEqual(result.records[0].exactNameCandidates.map(row=>row.observationId),['first','second']);
  assert.deepEqual(result.observationsWithoutInventoryCandidate,['unlisted']);
});

test('invalid identities, evidence and proposed aliases fail rather than silently changing attribution', () => {
  const fixture=()=>[inventory([unit('a','Same')]),{records:[observation('same','Same')]},structuredClone(source)];
  for(const mutate of [
    ([i])=>i.units.push(i.units[0]), ([,s])=>s.records.push(s.records[0]),
    ([i])=>i.evidenceUrl='', ([i])=>i.evidenceLocator='', ([i])=>i.units[0].printedPage=0,
    ([,,b])=>b.records[0].publicationKind='third-party-sourcebook', ([,,b])=>b.records.push(b.records[0]),
    ([i])=>i.units[0].reviewCandidates=[{observationId:'unknown',reason:'unverified'}],
    ([i])=>i.units[0].reviewCandidates=[{observationId:'same',reason:''}],
    ([i])=>i.units[0].reviewCandidates=[{observationId:'same',reason:'x'},{observationId:'same',reason:'x'}],
    ([i,s])=>{s.records[0].section='items';i.units[0].reviewCandidates=[{observationId:'same',reason:'wrong section'}];}
  ]){const args=fixture();mutate(args);assert.throws(()=>auditPublicationInventory(...args));}
});

test('Fiendish Folio retains all18 printed units,17 source observations, and four identity/attribution questions',()=>{
 const paths=['catalog/fiendish-folio-inventory-2014.json','catalog/scope-register-2014.json','catalog/numeric-source-publisher-evidence.json'];
 const raw=paths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n'));
 const args=raw.map(s=>JSON.parse(s));const result=auditPublicationInventory(...args);
 assert.deepEqual(result.summary,{publicationUnits:18,observedPagesWithSource:17,byStatus:{'explicit-candidate-needs-identity-review':3,'same-name-and-source-needs-version-review':14,'same-name-other-source-needs-attribution-review':1}});
 assert.equal(args[0].publisherMetadata.advertisedMonsterCount,17);
 assert.deepEqual(result.observationsWithoutInventoryCandidate,[]);
 const corby=result.records.find(row=>row.publicationName==='Dire Corby');assert.deepEqual(corby.exactNameCandidates,[{observationId:'dndsu:bestiary:17362',sourceIds:['113'],sameSource:false}]);
 const needle=result.records.find(row=>row.publicationName==='Needlefolk');assert.equal(needle.explicitReviewCandidates[0].observedName,'Needle Spawn');assert.equal(needle.canonicalId,null);
 const saved=JSON.parse(readFileSync(new URL('../catalog/fiendish-folio-review-2014.json',import.meta.url),'utf8'));const {inputSha256,...report}=saved;
 assert.deepEqual(result,report);assert.deepEqual(inputSha256,Object.fromEntries(paths.map((p,i)=>[p,createHash('sha256').update(raw[i]).digest('hex')])));
});
