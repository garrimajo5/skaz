import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reviewPaths,buildUnitResidualReview,unitResidualReview} from '../scripts/review-class-unit-residual-2014.mjs';
const base=reviewPaths.map(p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8')));
const inputs=()=>structuredClone(base);
const fullRecords=d=>[d[2],d[3],...d[4].classes].flatMap(p=>p.records);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
test('thirteen-class unit residual report reproduces exact current JSON and pins',()=>{
 const d=unitResidualReview();assert.deepEqual(d,JSON.parse(readFileSync(new URL('../catalog/class-unit-residual-review-2014.json',import.meta.url),'utf8')));
 for(const [path,digest]of Object.entries({...d.inputSha256,...d.upstreamCodeSha256}))assert.equal(createHash('sha256').update(readFileSync(new URL('../'+path,import.meta.url),'utf8').replaceAll('\r\n','\n')).digest('hex'),digest);
});
test('913 source observations preserve class scope, ID order, kinds and claim ledger without mutation',()=>{
 const d=inputs(),before=structuredClone(d),r=buildUnitResidualReview(d);assert.deepEqual(d,before);assert.equal(r.classRows.length,13);assert.equal(r.classRows.reduce((n,c)=>n+c.proposalObservations,0),913);
 for(const row of r.classRows){const p=[d[2],d[3],...d[4].classes].find(p=>p.classUrl===row.classUrl);assert.equal(row.preservedIdSequenceSha256,hash(p.records.map(x=>x.id)));assert.equal(row.preservedClaimLedgerSha256,hash(p.records.map(x=>({id:x.id,kind:x.kind,title:x.title,parent:x.parent,sourceIds:x.sourceIds,sourceBasis:x.sourceBasis,sourceUrl:x.sourceUrl,observedInitialLevels:x.observedInitialLevels}))));}
});
test('eight roles distinguish780feature candidates,118choice parents and15references',()=>{
 const r=buildUnitResidualReview(inputs());assert.equal(Object.keys(r.representationRoles).length,8);assert.equal(r.summary.acquiredFeatureCandidateObservations,780);assert.equal(r.summary.subclassParentObservations,118);assert.equal(r.summary.otherReferenceObservations,15);assert.equal(Object.values(r.roleCounts).reduce((a,b)=>a+b,0),913);
});
test('thirteen sparse cases keep original parents and never invent cross-category targets or grants',()=>{
 const d=inputs(),r=buildUnitResidualReview(d),byId=new Map(fullRecords(d).map(x=>[x.id,x]));assert.equal(r.specialRoleCases.length,13);
 for(const x of r.specialRoleCases){const old=byId.get(x.observationId),parent=byId.get(x.parentObservationId);assert.equal(parent.kind,'subclass');assert.equal(parent.parent,old.parent);assert.deepEqual(x.sourceIds,old.sourceIds);assert.equal(x.canonicalId,null);assert.equal(x.crossCategoryTargetId,null);assert.equal(x.profileCapabilityAutomaticallyGranted,false);}
 assert.deepEqual(r.sparseRoleDecisions.map(x=>[x.kind,x.count]),[['subclass-prerequisite',2],['equipment-reference',1],['choice-index',2],['oath-guidance',8]]);
});
test('Ranger optional replacement preserves both observation identities without automatic removal',()=>{
 const r=buildUnitResidualReview(inputs());assert.equal(r.optionalReplacementLinks.length,1);const x=r.optionalReplacementLinks[0];assert.equal(x.classSlug,'ranger');assert.notEqual(x.optionalObservationId,x.replacementTargetObservationId);assert.equal(x.choiceRequired,true);assert.equal(x.existingFeatureRemovedAutomatically,false);assert.equal(x.canonicalVersionEqualityAccepted,false);
});
test('four version families preserve28observations and ordered source claims without alias or version count',()=>{
 const r=buildUnitResidualReview(inputs());assert.deepEqual(r.versionDecisionGroups.map(g=>[g.classSlug,g.memberObservationIds.length]),[['bard',6],['druid',7],['cleric',8],['paladin',7]]);
 for(const g of r.versionDecisionGroups){assert.equal(g.sourceClaimsAreNotVersionCount,true);assert.equal(g.versionCount,null);assert.equal(g.aliasAccepted,false);assert.equal(g.parentObservationId!==null,true);assert.equal(g.sourceIds[0],'117');}
});
test('source arrays are preserved in supplied order rather than rewritten by sorting',()=>{
 const d=inputs(),bard=d[2];for(const r of bard.records)if(r.sourceIds.length>1)r.sourceIds.reverse();
 const r=buildUnitResidualReview(d);assert.deepEqual(r.versionDecisionGroups.find(x=>x.classSlug==='bard').sourceIds,['121','117']);
});
test('output arrays do not mutate original source arrays or the shared role mapping',()=>{
 const d=inputs(),before=structuredClone(d),r=buildUnitResidualReview(d);r.versionDecisionGroups[0].sourceIds.push('foreign');r.specialRoleCases[0].sourceIds.push('foreign');r.representationRoles.subclass='grant-all';assert.deepEqual(d,before);assert.equal(buildUnitResidualReview(inputs()).representationRoles.subclass,'subclass-choice-parent-candidate');
});
test('missing class or repeated ID cannot enter the representation ledger',()=>{
 for(const mutation of['class','id']){const d=inputs();if(mutation==='class')d[4].classes.pop();else d[2].records[1].id=d[2].records[0].id;assert.throws(()=>buildUnitResidualReview(d));}
});
test('an unknown observation kind requires review instead of a default capability role',()=>{
 const d=inputs();d[2].records[0].kind='unrecognized-rule';assert.throws(()=>buildUnitResidualReview(d));
});
test('an existing other-subclass parent cannot steal an observation identity',()=>{
 const d=inputs(),r=d[3].records.find(x=>x.kind==='subclass-prerequisite');r.parent=d[3].records.find(x=>x.kind==='subclass'&&x.parent!==r.parent).parent;assert.throws(()=>buildUnitResidualReview(d));
});
test('unknown or excluded numeric publication cannot become eligible by a title match',()=>{
 for(const mutation of['unknown','excluded']){const d=inputs(),r=d[2].records[0];if(mutation==='unknown')r.sourceIds=['missing'];else d[10].records.find(x=>x.sourceId===r.sourceIds[0]).disposition='excluded-third-party';assert.throws(()=>buildUnitResidualReview(d));}
});
test('duplicate numeric policy identity cannot shadow an earlier disposition',()=>{
 const d=inputs();d[10].records.push(structuredClone(d[10].records[0]));assert.throws(()=>buildUnitResidualReview(d));
});
test('selected two-class evidence must preserve title, source basis, parent, level and null canonical identity',()=>{
 for(const key of['title','source','parent','level','canonical']){const d=inputs(),r=d[9].projection.rows[0];if(key==='title')r.titlePreserved+=' changed';if(key==='source')r.sourceClaimsPreserved.sourceBasis='inferred-by-title';if(key==='parent')r.observedParentTokenPreserved='foreign';if(key==='level')r.observedInitialLevelsPreserved=[99];if(key==='canonical')r.canonicalId='approved';assert.throws(()=>buildUnitResidualReview(d));}
});
test('replacement cannot remove a foreign-class or same-ID observation',()=>{
 for(const target of['scope:wizard:class-features:feature.spellcasting','self']){const d=inputs(),r=fullRecords(d).find(x=>x.optionalReplacement);r.replacementForObservationId=target==='self'?r.id:target;assert.throws(()=>buildUnitResidualReview(d));}
});
test('metadata review cannot promote a full catalog, residual body or prior method acceptance',()=>{
 for(const mutation of['residual','selected','policy']){const d=inputs();if(mutation==='residual')d[8].accepted=true;if(mutation==='selected')d[9].approvedDenominator=130;if(mutation==='policy')d[10].complete=true;assert.throws(()=>buildUnitResidualReview(d));}
});
test('overlapping512residual/189choice/57tables never become an additive canonical denominator',()=>{
 const r=buildUnitResidualReview(inputs()),a=r.overlappingAuxiliaryObservations;assert.equal(a.residualHeadings,512);assert.equal(a.choiceObservations,189);assert.equal(a.spellTableObservations,57);assert.equal(a.mayBeAddedTo913AsCanonicalUnits,false);assert.equal(r.approvedDenominator,null);assert.equal(r.summary.canonicalUnitsAccepted,0);assert.equal(r.acceptedForRuntime,false);assert.equal(r.plannerDecision.newThirteenClassScopeRequiresOwnReview,true);
});

test('31discovery rows keep13main/3sidekick/15excluded distinct; main classes are not all reference material',()=>{
 const r=buildUnitResidualReview(inputs()),d=r.discoveryBoundary;assert.deepEqual([d.observedNavigationRows,d.mainClassRows,d.sidekickReferenceRows,d.observedExcludedGroupRows],[31,13,3,15]);assert.equal(d.mainClassesAreEntireAllowedClassReferenceCatalog,false);assert.equal(d.sidekickReferences.length,3);assert.ok(d.sidekickReferences.every(x=>x.canonicalId===null&&!x.playerClassAutomaticallyAdded&&!x.fullRulesAccepted));
});
test('a missing, repeated or reclassified sidekick cannot silently shrink the discovery scope',()=>{
 for(const mutation of['missing','repeat','group']){const d=inputs(),rows=d[11].rows,r=rows.find(x=>x.group==='sidekicks');if(mutation==='missing')rows.splice(rows.indexOf(r),1);if(mutation==='repeat')rows[14].url=r.url;if(mutation==='group')r.group='classes';assert.throws(()=>buildUnitResidualReview(d));}
});
