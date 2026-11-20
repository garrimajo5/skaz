import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {reviewObservedNames} from './catalog-observed-name-review.mjs';
import {buildM0ExitReview} from './catalog-m0-exit-review.mjs';
const sha=s=>createHash('sha256').update(s.replace(/\r\n/g,'\n')).digest('hex');
const paths=['catalog/scope-register-2014.json','catalog/baldur-background-name-corrections-2014.json','catalog/numeric-source-scope-policy-2014.json','catalog/background-adaptation-page-review-2014.json'];
export function buildCorrectedNameReview(scopeText,proposalText,policyText,backgroundText){
 const scope=JSON.parse(scopeText),proposal=JSON.parse(proposalText),policy=JSON.parse(policyText),background=JSON.parse(backgroundText);
 if(proposal.schemaVersion!==1||proposal.accepted!==false||proposal.complete!==false||proposal.approvedDenominator!==null||proposal.scopeSha256!==sha(scopeText))throw Error('Unpinned or promoted name correction proposal');
 const eligible=scope.records.filter(p=>p.section==='backgrounds'&&p.names.en==='Baldur'&&p.sourceIds.length===1&&p.sourceIds[0]==='126');
 if(eligible.length!==13||proposal.records.length!==13)throw Error('Unexpected correction boundary');
 const effective=structuredClone(scope),byId=new Map(effective.records.map(p=>[p.id,p])),expected=new Set(eligible.map(p=>p.id)),seen=new Set(),names=new Set(),corrections=[];
 for(const c of proposal.records){
  const p=byId.get(c.observationId);
  if(!p||!expected.has(c.observationId)||seen.has(c.observationId)||c.accepted!==false||c.canonicalId!==null)throw Error('Missing, duplicate or promoted correction');
  if(c.url!==p.url||c.resolvedUrl!==p.url||JSON.stringify(c.sourceIds)!==JSON.stringify(p.sourceIds)||c.observedEnglishName!==p.names.en||c.evidenceKind!=='exact-secondary-card-heading'||!/^[0-9a-f]{64}$/.test(c.rawSha256))throw Error('Correction provenance mismatch');
  if(typeof c.observedCardEnglishName!=='string'||c.proposedEnglishName!==c.observedCardEnglishName.trim()||!/^Baldur's Gate .+/.test(c.proposedEnglishName)||names.has(c.proposedEnglishName))throw Error('Invalid or repeated corrected name');
  seen.add(c.observationId);names.add(c.proposedEnglishName);
  corrections.push({observationId:c.observationId,originalEnglishName:p.names.en,observedCardEnglishName:c.observedCardEnglishName,effectiveEnglishName:c.proposedEnglishName,sourceIds:[...p.sourceIds],url:p.url,evidenceSha256:c.rawSha256,canonicalId:null,identityAccepted:false});
  p.names.en=c.proposedEnglishName;
 }
 const before=reviewObservedNames(scope),after=reviewObservedNames(effective);
 const beforeGroups=new Map(before.duplicateNameGroups.map(g=>[g.reviewId,g])),afterGroups=new Map(after.duplicateNameGroups.map(g=>[g.reviewId,g]));
 const unchanged=[],removed=[],added=[],changed=[];
 for(const [id,g] of beforeGroups){const next=afterGroups.get(id);if(!next)removed.push(g);else if(JSON.stringify(g)===JSON.stringify(next))unchanged.push(id);else changed.push({before:g,after:next});}
 for(const [id,g] of afterGroups)if(!beforeGroups.has(id))added.push(g);
 const originalExit=buildM0ExitReview(scope,policy,before,background),effectiveExit=buildM0ExitReview(effective,policy,after,background);
 const sameOther=JSON.stringify(before.missingEnglishNameIds)===JSON.stringify(after.missingEnglishNameIds)&&JSON.stringify(before.scriptDiagnostics)===JSON.stringify(after.scriptDiagnostics);
 if(!sameOther)throw Error('Unrelated name diagnostics changed');
 // Prove the overlay only changes the selected English fields; no persisted register is emitted.
 const restored=structuredClone(effective);for(const c of corrections)restored.records.find(p=>p.id===c.observationId).names.en=c.originalEnglishName;
 if(JSON.stringify(restored)!==JSON.stringify(scope))throw Error('Overlay modified other observation data');
 return {schemaVersion:1,status:'derived-name-review-overlay-not-canonical-catalog',accepted:false,complete:false,approvedDenominator:null,nameBasis:'exact-secondary-card-headings-in-separately-reviewed-proposal',inputSha256:Object.fromEntries(paths.map((p,i)=>[p,sha([scopeText,proposalText,policyText,backgroundText][i])])),corrections,
  beforeSummary:before.summary,afterSummary:after.summary,groupDelta:{removedDiagnosticGroups:removed,addedDiagnosticGroups:added,changedDiagnosticGroups:changed,unchangedGroupIds:unchanged},
  originalM0Summary:originalExit.summary,effectiveM0Summary:effectiveExit.summary,missingEnglishNameIds:after.missingEnglishNameIds,scriptDiagnostics:after.scriptDiagnostics,
  invariants:{sameObservationCount:scope.records.length===effective.records.length,sameIdsAndNonNameData:true,originalRegisterUnchanged:true,canonicalIdentitiesAssigned:0},
  limitations:['Removed diagnostic groups are false shared-name signals, not deleted catalog records or accepted canonical merges.','The original snapshot, original diagnostics and original source eligibility remain unchanged.','This research overlay does not feed runtime imports, player profiles or publication.','Primary identities, full publication inventory, full rules and reuse rights still require review.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=buildCorrectedNameReview(...paths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')));
 writeFileSync(process.argv[2]||new URL('../catalog/corrected-name-review-2014.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({before:result.beforeSummary,after:result.afterSummary,m0:result.effectiveM0Summary}));
}
