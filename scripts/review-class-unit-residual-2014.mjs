import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {classInputs,buildClassComposition} from './catalog-class-composition-review.mjs';
export const reviewPaths=[...classInputs,'catalog/class-residual-review-2014.json','catalog/class-unit-granularity-proposal-2014.json','catalog/numeric-source-scope-policy-2014.json','catalog/dndsu-class-discovery.json'];
export const representationRoles={
 'base-feature':'class-feature-candidate','subclass':'subclass-choice-parent-candidate','subclass-feature':'subclass-feature-candidate',
 'rules-guidance':'supporting-rule-reference-candidate','subclass-prerequisite':'subclass-requirement-reference-candidate',
 'equipment-reference':'cross-category-equipment-reference-candidate','choice-index':'choice-collection-reference-candidate','oath-guidance':'oath-rule-reference-candidate',
};
const sha=value=>createHash('sha256').update(value).digest('hex');
const digest=value=>sha(JSON.stringify(value));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const countKinds=rows=>{const counts={};for(const r of rows)counts[r.kind]=(counts[r.kind]||0)+1;return counts;};
export function buildUnitResidualReview(inputs){
 if(inputs.length!==reviewPaths.length)throw Error('Exact class evidence packet required');
 const [scope,headings,bard,barbarian,reviewed,choices,sectionPolicy,tables,residual,twoClass,numericPolicy,discovery]=inputs;
 const composition=buildClassComposition(...inputs.slice(0,classInputs.length));
 const discoveryRows=discovery.rows,main=discoveryRows.filter(r=>r.group==='classes'),sidekicks=discoveryRows.filter(r=>r.group==='sidekicks'),excludedDiscovery=discoveryRows.filter(r=>r.group==='excluded-homebrew');
 if(discoveryRows.length!==31||new Set(discoveryRows.map(r=>r.url)).size!==31||main.length!==13||sidekicks.length!==3||excludedDiscovery.length!==15||!equal(main.map(r=>r.url),scope.rows.map(r=>r.url))||sidekicks.some(r=>r.sourceTitle!=="Tasha's Cauldron of Everything"||!/^https:\/\/dnd\.su\/class\/(197-expert|198-spellcaster|199-warrior)-sidekick\/$/.test(r.url))||excludedDiscovery.some(r=>!r.url.startsWith('https://dnd.su/homebrew/class/')))throw Error('Changed main/sidekick/excluded discovery boundary');
 if(residual.accepted||residual.complete||residual.approvedDenominator!==null||residual.summary.remainingUnclassifiedHeadings!==0||residual.summary.classifiedResidualHeadings!==512||residual.rows.length!==13||new Set(residual.rows.map(r=>r.classSlug)).size!==13)throw Error('Residual metadata is not canonical acceptance');
 if(twoClass.accepted||twoClass.complete||twoClass.acceptedForRuntime||twoClass.approvedDenominator!==null||twoClass.summary.canonicalUnitsAccepted||twoClass.projection.rows.length!==130)throw Error('Prior selected representation remains a bounded proposal');
 const policies=new Map(numericPolicy.records.map(r=>[r.sourceId,r]));
 if(policies.size!==numericPolicy.records.length||numericPolicy.approvedDenominator!==null||numericPolicy.complete)throw Error('Changed numeric policy boundary');
 const proposals=[bard,barbarian,...reviewed.classes],all=new Map(),subclassParents=new Map(),recordsByClass=new Map(),classRows=[],special=[],replacements=[],versionGroups=[];
 for(const c of composition.rows){
  const proposal=proposals.find(p=>p.classUrl===c.classUrl),sourceRows=proposal.records;
  if(!equal(countKinds(sourceRows),c.proposalCountsByKind))throw Error('Changed class kind counts');
  recordsByClass.set(c.classSlug,sourceRows);
  for(const r of sourceRows){
   if(typeof r.id!=='string'||!r.id.startsWith('scope:'+c.classSlug+':'+r.parent+':')||all.has(r.id)||!representationRoles[r.kind]||r.canonicalCatalogId!==null||r.fullRules!=='unverified'||!Array.isArray(r.sourceIds)||!r.sourceIds.length||new Set(r.sourceIds).size!==r.sourceIds.length)throw Error('Unknown, repeated, promoted or wrong-class observation');
   if(r.sourceIds.some(id=>policies.get(id)?.disposition!=='eligible-publication-records-need-review'))throw Error('Unreviewed publication policy cannot become eligible by title');
   all.set(r.id,{classSlug:c.classSlug,record:r});
   if(r.kind==='subclass'){
    const key=c.classSlug+':'+r.parent;if(subclassParents.has(key))throw Error('Ambiguous subclass token');subclassParents.set(key,r.id);
   }
  }
 }
 for(const c of composition.rows){
  const sourceRows=recordsByClass.get(c.classSlug),links=[],groups=new Map();
  for(const r of sourceRows){
   let parent=null;
   if(!['base-feature','subclass'].includes(r.kind)){
    parent=subclassParents.get(c.classSlug+':'+r.parent);if(!parent)throw Error('Missing or foreign subclass parent');
   }else if(r.kind==='base-feature'&&!['class-features','features','klassovye_umeniya'].includes(r.parent))throw Error('Unknown original base-feature parent');
   links.push([r.id,parent]);
   if(!['base-feature','subclass','subclass-feature','rules-guidance'].includes(r.kind))special.push({classSlug:c.classSlug,observationId:r.id,title:r.title,observedKind:r.kind,proposedRepresentationRole:representationRoles[r.kind],parentObservationId:parent,sourceIds:[...r.sourceIds],sourceBasis:r.sourceBasis,profileCapabilityAutomaticallyGranted:false,canonicalId:null,crossCategoryTargetId:null});
   if(r.optionalReplacement){
    const target=all.get(r.replacementForObservationId);
    if(!target||target.classSlug!==c.classSlug||target.record.parent!==r.parent||target.record.kind!=='subclass-feature'||r.kind!=='subclass-feature'||r.id===r.replacementForObservationId)throw Error('Missing or cross-class replacement target');
    replacements.push({classSlug:c.classSlug,optionalObservationId:r.id,replacementTargetObservationId:r.replacementForObservationId,sourceIds:[...r.sourceIds],choiceRequired:true,existingFeatureRemovedAutomatically:false,canonicalVersionEqualityAccepted:false});
   }
   if(r.sourceIds.length>1){
    const key=JSON.stringify([r.parent,r.sourceIds]);if(!groups.has(key))groups.set(key,{classSlug:c.classSlug,parentToken:r.parent,parentObservationId:r.kind==='subclass'?r.id:parent,sourceIds:[...r.sourceIds],memberObservationIds:[],sourceClaimsAreNotVersionCount:true,versionCount:null,aliasAccepted:false});
    groups.get(key).memberObservationIds.push(r.id);
   }
  }
  versionGroups.push(...groups.values());
  const rr=residual.rows.find(r=>r.classSlug===c.classSlug);
  if(!rr||rr.accepted||rr.originalResidualHeadings!==c.unclassifiedHeadingOrdinals.length||rr.classified!==rr.originalResidualHeadings||rr.classified!==rr.proposedExcluded+rr.sourcePending+rr.otherComponents)throw Error('Class residual partition changed');
  classRows.push({classSlug:c.classSlug,classUrl:c.classUrl,proposalObservations:sourceRows.length,observedKindCounts:countKinds(sourceRows),preservedIdSequenceSha256:digest(sourceRows.map(r=>r.id)),preservedClaimLedgerSha256:digest(sourceRows.map(r=>({id:r.id,kind:r.kind,title:r.title,parent:r.parent,sourceIds:r.sourceIds,sourceBasis:r.sourceBasis,sourceUrl:r.sourceUrl,observedInitialLevels:r.observedInitialLevels}))),resolvedParentLedgerSha256:digest(links),auxiliaryResidualHeadings:rr.originalResidualHeadings,auxiliaryChoiceObservations:c.choiceObservationIds.length,auxiliarySpellTableObservations:c.spellTableObservationIds.length,fullPublicationInventoryVerified:false,canonicalUnitsAccepted:0});
 }
 for(const selected of twoClass.projection.rows){
  const original=all.get(selected.sourceObservationId);
  if(!original||original.classSlug!==selected.classGroupKey||original.record.kind!==selected.observedKind||original.record.title!==selected.titlePreserved||!equal(original.record.observedInitialLevels,selected.observedInitialLevelsPreserved)||!equal(original.record.sourceIds,selected.sourceClaimsPreserved.sourceIds)||original.record.sourceBasis!==selected.sourceClaimsPreserved.sourceBasis||original.record.sourceUrl!==selected.sourceClaimsPreserved.sourceUrl||original.record.parent!==selected.observedParentTokenPreserved||selected.canonicalId!==null||selected.automaticallyGrantedByCatalogPresence)throw Error('Selected two-class observation lost or promoted in global packet');
 }
 const allRecords=[...all.values()].map(x=>x.record),roleCounts={};for(const r of allRecords){const role=representationRoles[r.kind];roleCounts[role]=(roleCounts[role]||0)+1;}
 const sourcePending=residual.rows.reduce((n,r)=>n+r.sourcePending,0),excluded=residual.rows.reduce((n,r)=>n+r.proposedExcluded,0);
 if(all.size!==913||special.length!==13||versionGroups.length!==4||versionGroups.reduce((n,g)=>n+g.memberObservationIds.length,0)!==28||replacements.length!==1||sourcePending!==10||excluded!==130)throw Error('Changed bounded baseline; reassess unit/version decisions');
 return {schemaVersion:1,status:'thirteen-class-representation-review-and-version-residual-not-canonical-catalog',accepted:false,complete:false,approvedDenominator:null,acceptedForRuntime:false,runtimeChanged:false,
  selectedReviewBasis:{path:'catalog/class-unit-granularity-proposal-2014.json',review:'https://github.com/garrimajo5/skaz/pull/245#issuecomment-7068679715',exactHead:'87647d9522a3e04b9c02caec54c42154396f5e8c',priorReviewInheritedForNewThirteenClassPacket:false},
  summary:{classes:13,preservedProposalObservations:913,acquiredFeatureCandidateObservations:780,subclassParentObservations:118,otherReferenceObservations:15,newSparseRoleCases:13,multiSourceObservationGroups:4,multiSourceObservations:28,optionalReplacementLinks:1,canonicalUnitsAccepted:0},
  discoveryBoundary:{observedNavigationRows:31,mainClassRows:13,sidekickReferenceRows:3,observedExcludedGroupRows:15,preservedDiscoveryRowSequenceSha256:digest(discoveryRows),mainClassesAreEntireAllowedClassReferenceCatalog:false,sidekickReferences:sidekicks.map(r=>({...structuredClone(r),canonicalId:null,fullRulesAccepted:false,playerClassAutomaticallyAdded:false})),excludedObservationUrls:excludedDiscovery.map(r=>r.url)},
  representationRoles:structuredClone(representationRoles),roleCounts,classRows,specialRoleCases:special,optionalReplacementLinks:replacements,versionDecisionGroups:versionGroups,
  overlappingAuxiliaryObservations:{residualHeadings:512,proposedExcludedResidualHeadings:excluded,sourcePendingResidualHeadings:sourcePending,otherResidualComponents:372,choiceObservations:composition.summary.choiceObservations,spellTableObservations:composition.summary.spellTableObservations,existingChoiceHeadingLinks:composition.summary.existingChoiceHeadings,existingSpellTableHeadingLinks:composition.summary.existingSpellTableHeadings,mayBeAddedTo913AsCanonicalUnits:false},
  sparseRoleDecisions:[{kind:'subclass-prerequisite',count:2,proposal:'Keep an addressable parent requirement reference, not a separately acquired ability. Ordinary deviations warn and allow manual character choices.'},{kind:'equipment-reference',count:1,proposal:'Keep the original class reference; defer any item-category identity/alias until exact source/version comparison. Do not invent an equipment ID or grant.'},{kind:'choice-index',count:2,proposal:'Keep the choice collection parent; links/options are not all granted automatically and index presence is not proof of full options.'},{kind:'oath-guidance',count:8,proposal:'Keep tenets and redemption-rule references addressable, not decorative lore to discard. No automatic penalty, subclass removal or mandatory GM checkbox.'}],
  plannerDecision:{representationMethod:'trial-on-this-thirteen-class-packet',selectedTwoClassMethodIndependentlyReviewed:true,newThirteenClassScopeRequiresOwnReview:true,sourceAndVersionDecisionsNotReplaced:true,m0FullTextAuditOfEveryHigherLevelFeatureAddedAsNewRequirement:false},
  nextWorkItem:{role:'content',phase:'four-class-multisource-version-proposals',action:'Resolve only four exact source-claim families (Eloquence/Spores/Order/Glory) using bounded publication/version evidence. Preserve 28 observation IDs and original source order; do not multiply counts by source links or infer whole-text equality. If primary access fails, retain a scoped hold and take independent D01/D06/D07 work.',firstFamily:'bard:college.eloquence',canonicalCountBeforeEvidence:null},
  limits:['Thirteen main-class navigation groups were already inventoried; no new class or full-text coverage is claimed.','913 records and 512/189/57 auxiliary observations overlap and do not establish a canonical denominator.','Eligible numeric publication status is not full-text/version/rights proof; the 12 section policies do not automatically propagate to arbitrary descendants.','Two selected-class prior reviews do not independently accept this wider packet.','Multiple source IDs can represent reuse, revised versions or broader attribution; version count and canonical aliases stay unknown.','Ranger replacement remains a choice link, not automatic removal or replay of an imported feature.','No runtime import/schema/character/automation changes; ordinary manual exceptions remain allowed.']};
}
export function unitResidualReview(){const raw=reviewPaths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replaceAll('\r\n','\n')),d=buildUnitResidualReview(raw.map(JSON.parse));d.inputSha256=Object.fromEntries(reviewPaths.map((p,i)=>[p,sha(raw[i])]));d.upstreamCodeSha256={'scripts/catalog-class-composition-review.mjs':sha(readFileSync(new URL('./catalog-class-composition-review.mjs',import.meta.url),'utf8').replaceAll('\r\n','\n'))};d.generator={path:'scripts/review-class-unit-residual-2014.mjs',sha256:sha(readFileSync(new URL(import.meta.url),'utf8').replaceAll('\r\n','\n'))};return d;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const d=unitResidualReview();writeFileSync(process.argv[2]||new URL('../catalog/class-unit-residual-review-2014.json',import.meta.url),JSON.stringify(d,null,2)+'\n');console.log(JSON.stringify(d.summary));}
