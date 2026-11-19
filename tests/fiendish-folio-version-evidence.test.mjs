import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>JSON.parse(readFileSync(new URL('../catalog/'+p+'.json',import.meta.url),'utf8'));
const d=read('fiendish-folio-version-evidence-2014'),scope=read('scope-register-2014');
test('Folio evidence preserves inputs and separates printed count from digital support claim',()=>{
 for(const [p,sha]of Object.entries(d.inputSha256)){
  const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(readFileSync(new URL('../'+p,import.meta.url))).replace(/\r\n/g,'\n');
  assert.equal(createHash('sha256').update(text).digest('hex'),sha);
 }
 assert.equal(d.printEvidence.rows.length,18);assert.equal(d.printEvidence.challengeRows,18);
 assert.equal(d.countEvidence.staffConfirmedDigitalCount,17);assert.equal(d.countEvidence.printDigitalDifferenceResolved,false);
 assert.equal(d.countEvidence.missingUnitIdentified,false);assert.equal(d.countEvidence.automaticDeletion,false);
 assert.equal(d.approvedDenominator,null);assert.equal(d.accepted,false);assert.equal(d.complete,false);
});
test('equal CR and a digital name do not prove Needlefolk alias or rewrite observed identity',()=>{
 const n=d.needleEvidence,old=scope.records.find(r=>r.id===n.observationId);
 assert.equal(n.observedName,old.names.en);assert.deepEqual(n.observedSourceIds,old.sourceIds);
 assert.equal(n.printedName,'Needlefolk');assert.equal(n.digitalName,'Needle Spawn');
 assert.equal(n.printedChallengeRating,n.digitalChallengeRating);
 assert.equal(n.identityConfirmed,false);assert.equal(n.canonicalId,null);assert.equal(n.automaticRename,false);assert.equal(n.fullStatBlockRead,false);
});
test('staff-confirmed historic correction is distinct from an escalated unconfirmed report',()=>{
 const [ygorl,khargra]=d.versionWarnings;
 assert.equal(ygorl.status,'historical-digital-correction-confirmed-by-staff');assert.equal(ygorl.fields.length,7);
 assert.equal(ygorl.numericValuesVerified,false);assert.equal(ygorl.secondaryPresence,'all-seven-labels-present');
 assert.equal(khargra.status,'report-escalated-not-confirmed-corrected');assert.equal(khargra.primaryCorrectValue,null);
 for(const r of d.versionWarnings){assert.ok(scope.records.some(x=>x.id===r.observationId));assert.equal(r.currentDigitalFullTextVerified,false);assert.equal(r.automaticPatch,false);}
});

test('eighteen filtered digital cards keep one differently attributed source and candidate-only mappings',()=>{
 const index=d.digitalIndexEvidence;
 assert.equal(index.rows.length,18);assert.equal(new Set(index.rows.map(r=>r.cardUrl)).size,18);
 assert.equal(new Set(index.rows.map(r=>r.printedUnitId)).size,18);
 const counts={};for(const r of index.rows){
  counts[r.displayedSource]=(counts[r.displayedSource]||0)+1;
  const print=d.printEvidence.rows.find(p=>p.unitId===r.printedUnitId);assert.ok(print);
  assert.equal(r.challengeRating,print.challengeRating);assert.equal(r.printedName,print.name);
  assert.equal(r.fullRulesVerified,false);assert.equal(r.canonicalId,null);assert.equal(r.automaticSourceReplacement,false);
  assert.equal(r.observationCandidates.length,1);
  for(const c of r.observationCandidates){const old=scope.records.find(x=>x.id===c.id);assert.equal(c.observedName,old.names.en);assert.deepEqual(c.originalSourceIds,old.sourceIds);}
 }
 assert.deepEqual(counts,index.displayedSourceCounts);
 assert.equal(counts['Infernal Machine Rebuild'],1);
 assert.equal(index.rows.find(r=>r.displayedSource==='Infernal Machine Rebuild').digitalName,'Eye of Fear and Flame');
 assert.equal(d.countEvidence.printDigitalDifferenceResolved,false);
});
