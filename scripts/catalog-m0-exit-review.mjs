import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {buildSourceReviewQueue} from './catalog-source-review-queue.mjs';
import {reviewObservedNames} from './catalog-observed-name-review.mjs';
const excluded=new Set(['excluded-by-reference-scope','excluded-by-reviewed-source-policy']);
export function buildM0ExitReview(scope,policy,nameReview,backgroundProposals){
 const queue=buildSourceReviewQueue(scope,policy);
 const regenerated=reviewObservedNames(scope);
 for(const key of ['duplicateNameGroups','missingEnglishNameIds','scriptDiagnostics'])if(JSON.stringify(regenerated[key])!==JSON.stringify(nameReview[key]))throw Error('Name diagnosis stale or incomplete');
 const proposalMap=new Map();for(const row of backgroundProposals.records){if(proposalMap.has(row.observationId)||row.accepted!==false||row.canonicalId!==null)throw Error('Invalid background proposal');proposalMap.set(row.observationId,row);}
 const pages=new Map(scope.records.map(r=>[r.id,r]));
 const routing=new Map(Object.entries(queue.pageGroups).flatMap(([group,ids])=>ids.map(id=>[id,group])));
 if(nameReview.complete!==false||nameReview.approvedDenominator!==null)throw Error('Name review already promoted');
 const seenGroups=new Set(),seenMembers=new Set();
 const identityGroups=nameReview.duplicateNameGroups.map(g=>{
  if(seenGroups.has(g.reviewId)||g.accepted!==false||g.canonicalId!==null||g.members.length<2)throw Error('Invalid identity group');seenGroups.add(g.reviewId);
  const members=g.members.map(m=>{
   const page=pages.get(m.id);
   if(!page||seenMembers.has(m.id)||page.section!==g.section||page.names.en!==m.observedName||JSON.stringify([...page.sourceIds].sort())!==JSON.stringify([...m.sourceIds].sort()))throw Error('Identity member lost/reassigned');
   seenMembers.add(m.id);return {...structuredClone(m),routing:routing.get(m.id)};
  });
  const active=members.filter(m=>!excluded.has(m.routing));
  const shared=active.some((m,i)=>active.slice(i+1).some(n=>m.sourceIds.some(id=>n.sourceIds.includes(id))));
  const decision=active.length===0?'all-observations-excluded':active.length===1?'one-nonexcluded-observation':active.some(m=>m.routing!=='ready-for-version-and-rights-review')?'resolve-publication-first':shared?(active.every(m=>JSON.stringify([...m.sourceIds].sort())===JSON.stringify([...active[0].sourceIds].sort()))?'resolve-duplicate-or-variant-unit':'resolve-overlapping-source-attribution'):'define-separate-source-version-units';
  return {reviewId:g.reviewId,section:g.section,comparisonKey:g.comparisonKey,decision,members,accepted:false,canonicalId:null,automaticMerge:false};
 });
 const sections={};
 for(const page of scope.records){
  const row=sections[page.section]??={observedPages:0,excludedPages:0,publicationDecisionPages:0,eligiblePublicationObservationPages:0,approvedCanonicalUnits:null};
  row.observedPages++;const state=routing.get(page.id);
  if(excluded.has(state))row.excludedPages++;
  else if(state==='ready-for-version-and-rights-review')row.eligiblePublicationObservationPages++;
  else row.publicationDecisionPages++;
 }
 const byDecision={};for(const group of identityGroups)byDecision[group.decision]=(byDecision[group.decision]||0)+1;
 const missingNames=nameReview.missingEnglishNameIds.map(id=>{const p=pages.get(id);if(!p||(typeof p.names.en==='string'&&p.names.en.trim()))throw Error('Missing-name diagnosis stale');const proposal=proposalMap.get(id);if(proposal&&(p.section!=='backgrounds'||!p.sourceIds.includes(proposal.sourceId)))throw Error('Proposal attribution changed');return {observationId:id,section:p.section,routing:routing.get(id),existingPageKindProposal:proposal?{path:'catalog/background-adaptation-page-review-2014.json',pageKind:proposal.proposedPageKind,accepted:false}:null};});
 if(new Set(missingNames.map(r=>r.observationId)).size!==missingNames.length)throw Error('Repeated missing-name diagnosis');
 const sourceDecisions=Object.entries(queue.pageGroups).filter(([key])=>!excluded.has(key)&&key!=='ready-for-version-and-rights-review').flatMap(([decision,ids])=>ids.map(id=>({observationId:id,section:pages.get(id).section,sourceIds:[...pages.get(id).sourceIds],decision})));
 return {schemaVersion:1,status:'m0-exit-routing-not-catalog-acceptance',accepted:false,complete:false,approvedDenominator:null,summary:{observedPages:scope.records.length,excludedObservationPages:Object.values(sections).reduce((n,r)=>n+r.excludedPages,0),publicationDecisionPages:sourceDecisions.length,eligiblePublicationObservationPages:Object.values(sections).reduce((n,r)=>n+r.eligiblePublicationObservationPages,0),identityGroups:identityGroups.length,identityGroupsByDecision:byDecision,missingEnglishNames:missingNames.length},sections,sourceDecisions,identityGroups,missingNames,legacyUnindexedScopeLabels:[...scope.unindexedScopes],scriptDiagnostics:structuredClone(nameReview.scriptDiagnostics),limitations:['Counts describe observations and overlapping review dimensions, not accepted canonical units.','Identity groups, missing names and publication decisions overlap; never add them to estimate missing catalog records.','Different source labels do not prove different rules or canonical identity.','Full text/parameters/automation/art belong to downstream completion; unclear unit/version boundaries remain M0 decisions.','Unestablished text rights can block publication without erasing existence evidence.','Legacy unindexed labels require reconciliation with later component evidence; do not treat them as absence of all work.','Scope and personal profiles are not changed.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const paths=['catalog/scope-register-2014.json','catalog/numeric-source-scope-policy-2014.json','catalog/observed-name-review-2014.json','catalog/background-adaptation-page-review-2014.json'];
 const raw=paths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n'));
 const report=buildM0ExitReview(...raw.map(JSON.parse));report.inputSha256=Object.fromEntries(paths.map((p,i)=>[p,createHash('sha256').update(raw[i]).digest('hex')]));
 writeFileSync(process.argv[2]||new URL('../catalog/m0-exit-review-2014.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));
}
