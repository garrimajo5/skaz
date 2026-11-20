import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditSourceRights,buildSourceRightsAudit} from '../scripts/audit-source-rights-2014.mjs';

const read = name => JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));
const evidence = read('source-rights-evidence-2014.json');
const sample = () => ({entries:[{id:'synthetic:spell',kind:'spell',source:{
  usage:'cc-by-4.0',url:evidence.srd51.url+'#page=96',title:'System Reference Document 5.1',
  version:'5.1; synthetic test',terms:'CC BY 4.0',attribution:'synthetic declaration',changes:'synthetic adaptation'}}],
  evidence:structuredClone(evidence),numeric:{records:[]},bibliography:{records:[]},scope:{records:[]}});

test('committed diagnostic reproduces the exact current bundle and source registers',()=>{
  const actual=buildSourceRightsAudit();
  assert.deepEqual(actual,read('source-rights-audit-2014.json'));
  assert.deepEqual(actual.findings,[]);
  assert.equal(Object.values(actual.categories).reduce((n,c)=>n+c.entries,0),actual.summary.bundledEntries);
  assert.equal(actual.summary.declaredSrd51+actual.summary.referenceOnly,actual.summary.bundledEntries);
  assert.equal(actual.accepted,false);assert.equal(actual.complete,false);
  assert.equal(actual.approvedDenominator,null);
});

test('metadata presence never becomes independently verified authorship or reuse clearance',()=>{
  const data=sample(),before=structuredClone(data);
  const report=auditSourceRights(data);
  assert.equal(report.summary.declaredSrd51,1);
  assert.equal(report.summary.textsIndependentlyClearedByThisAudit,0);
  assert.equal(report.categories.spell.approvedDenominator,null);
  assert.deepEqual(data,before);
});

test('official publisher, eligible source and upstream CC claim cannot license a whole book or translation',()=>{
  const data=sample();
  data.numeric.records=[{sourceId:'101',observedTitle:'Synthetic official book',disposition:'eligible-publication-records-need-review',reusePermission:'cc-by-4.0'}];
  data.bibliography.records=[{id:'101',referenceTitle:'Synthetic translation',scopeDecision:'included',reusePermission:'granted'}];
  const report=auditSourceRights(data);
  assert.equal(report.publications.length,2); // distinct namespaces, not deduplicated publication count
  for(const record of report.publications){
    assert.equal(record.textReuseEvidence,'not-established-by-this-audit');
    assert.equal(record.translationReuseEvidence,'not-established-by-this-audit');
  }
});

test('CC declaration on a third party translation, different edition, lookalike host or unpinned PDF is diagnosed',()=>{
  for(const url of ['https://dnd.su/spells/1-example/',
    'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.2.pdf#page=96',
    'https://media.wizards.com.example.org/2023/downloads/dnd/SRD_CC_v5.1.pdf#page=96',
    evidence.srd51.url+'?edition=other#page=96']){
    const data=sample();data.entries[0].source.url=url;
    const report=auditSourceRights(data);
    assert.equal(report.summary.declaredSrd51,0);
    assert.ok(report.findings[0].problems.includes('cc-declaration-outside-identified-srd51'));
  }
});

test('page and edition metadata require exact bounded evidence, not a title match',()=>{
  for(const fragment of ['', '#page=0','#page=404','#page=96junk','#page=96.5','#page=096']){
    const data=sample();data.entries[0].source.url=evidence.srd51.url+fragment;
    assert.equal(auditSourceRights(data).summary.metadataFindings,1);
  }
  for(const [field,value] of [['url','not a URL'],['version','5.2'],['title','SRD 5.2'],['attribution',''],['changes',null],['terms',' '],['usage','unrestricted']]){
    const data=sample();data.entries[0].source[field]=value;
    assert.equal(auditSourceRights(data).summary.metadataFindings,1,field);
  }
});

test('reference-only status is retained without inventing permission for underlying text',()=>{
  const data=sample();data.entries[0].source={usage:'reference-only',url:'https://example.org/reference'};
  const report=auditSourceRights(data);
  assert.equal(report.summary.referenceOnly,1);assert.equal(report.summary.declaredSrd51,0);
  assert.equal(report.summary.textsIndependentlyClearedByThisAudit,0);
});

test('duplicate identities and replacement license evidence fail rather than overcount',()=>{
  let data=sample();data.entries.push(structuredClone(data.entries[0]));
  assert.throws(()=>auditSourceRights(data),/duplicate bundled identity/);
  data=sample();data.numeric.records=[{sourceId:'1'},{sourceId:'1'}];
  assert.throws(()=>auditSourceRights(data),/Duplicate publication identity/);
  data=sample();data.bibliography.records=[{}];
  assert.throws(()=>auditSourceRights(data),/Missing publication identity/);
  for(const field of ['url','license','pageCount']){
    data=sample();data.evidence.srd51[field]='changed';
    assert.throws(()=>auditSourceRights(data),/Unexpected SRD evidence/);
  }
});

test('a content change makes the bundle fingerprint stale even when source declarations stay the same',()=>{
  const data=sample();const before=auditSourceRights(data);
  data.entries[0].description='Changed synthetic wording requiring fresh review';
  assert.notEqual(auditSourceRights(data).bundleEntriesSha256,before.bundleEntriesSha256);
});


test('matching a licensed bundled ID never clears the wording of a reference translation',()=>{
  const data=sample();data.numeric.records=[{sourceId:'101',observedTitle:'Synthetic book'}];
  data.scope.records=[{id:'reference:one',section:'spells',sourceIds:['101'],candidateIds:['synthetic:spell'],reusePermission:'not-established-for-reference-text'}];
  const report=auditSourceRights(data);
  assert.equal(report.referenceSections.spells.withCandidateMatch,1);
  assert.equal(report.referenceSections.spells.translationsIndependentlyClearedByThisAudit,0);
  assert.equal(report.referenceSections.spells.approvedDenominator,null);
  assert.deepEqual(report.referenceSections.spells.reuseDeclarations,{'not-established-for-reference-text':1});
});

test('unresolved attribution stays visible and unknown source IDs cannot silently disappear',()=>{
  const data=sample();data.scope.records=[
    {id:'reference:one',section:'classes',sourceIds:[],candidateIds:[]},
    {id:'reference:two',section:'classes',sourceIds:['999'],candidateIds:[]}];
  const report=auditSourceRights(data);
  assert.equal(report.referenceSections.classes.withoutNumericAttribution,1);
  assert.deepEqual(report.referenceFindings,[{id:'reference:two',unknownSourceIds:['999']}]);
  data.scope.records.push(structuredClone(data.scope.records[0]));
  assert.throws(()=>auditSourceRights(data),/duplicate reference identity/);
});
