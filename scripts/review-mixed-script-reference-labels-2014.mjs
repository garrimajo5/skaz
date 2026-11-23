import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
export const labelInputPaths=['catalog/scope-register-2014.json','catalog/effective-m0-review-2014.json','catalog/mixed-script-name-evidence-2014.json'];
const reviewedCaptureFingerprint='46b0ac937c6ffa23e9c1605b48b261442f59ec5e5291664671808ca0cacd81bc';
const corrections=new Map([['dndsu:bestiary:13077','Cranium Rat Squeaker Swarm'],['dndsu:bestiary:6883','Nilbog'],['dndsu:items:6459','Prehistoric Figurines of Wondrous Power']]);
const holds=new Map([['dndsu:bestiary:568','primary-name-supported-secondary-card-missing'],['dndsu:bestiary:20456','needs-primary-name-and-publication']]);
export function reviewMixedScriptReferenceLabels(scope,root,evidence){
 if(evidence.accepted!==false||evidence.complete!==false||evidence.approvedDenominator!==null)throw Error('Name evidence promoted to canonical acceptance');
 const pages=new Map(scope.records.map(p=>[p.id,p]));const diagnostics=new Map(root.scriptDiagnostics.map(d=>[d.id,d]));const expected=new Set([...corrections.keys(),...holds.keys()]);
 if(diagnostics.size!==5||root.scriptDiagnostics.length!==5||evidence.records.length!==5)throw Error('Changed five-diagnostic scope');
 const captures=new Map(evidence.captures.map(c=>[c.key,c]));if(captures.size!==8||evidence.captures.length!==8)throw Error('Changed source capture set');
 const fingerprint=createHash('sha256').update(JSON.stringify([...captures.values()].map(c=>({key:c.key,url:c.url,sha256:c.sha256})).sort((a,b)=>a.key.localeCompare(b.key,'en')))).digest('hex');
 if(fingerprint!==reviewedCaptureFingerprint)throw Error('Source capture differs from reviewed witness');
 const ids=new Set(),records=[];
 for(const r of evidence.records){
  const p=pages.get(r.observationId),d=diagnostics.get(r.observationId);
  if(!expected.has(r.observationId)||ids.has(r.observationId)||!p||!d)throw Error('Foreign or repeated diagnostic');ids.add(r.observationId);
  if(p.names.en!==r.originalEnglishName||d.observedName!==r.originalEnglishName||p.url!==r.originalUrl||JSON.stringify(p.sourceIds)!==JSON.stringify(r.sourceIds)||JSON.stringify(d.sourceIds)!==JSON.stringify(r.sourceIds))throw Error('Original observation changed');
  if(r.applied!==false||r.identityAccepted!==false||r.canonicalId!==null)throw Error('Original evidence promoted');
  const selected=corrections.get(r.observationId),acceptLabel=selected!==undefined;
  if(acceptLabel&&(r.status!=='supported-heading-proposal'||r.proposedEnglishName!==selected||!r.primaryCapture||!captures.has(r.primaryCapture)||!captures.has(r.secondaryCapture)))throw Error('Unproved reference label');
  if(!acceptLabel&&r.status!==holds.get(r.observationId))throw Error('Unresolved diagnostic lost its hold');
  const groups=root.identityGroups.filter(g=>g.members.some(m=>m.id===r.observationId));
  records.push({observationId:p.id,sourceIds:[...p.sourceIds],referenceUrl:p.url,originalObservedEnglishName:p.names.en,effectiveReferenceEnglishName:acceptLabel?selected:p.names.en,originalSearchLabelPreserved:p.names.en,acceptedForReferenceEnglishLabel:acceptLabel,labelDecision:acceptLabel?'verified-reference-label-cleanup':r.status,primaryCapture:r.primaryCapture,secondaryCapture:r.secondaryCapture,identityReviewIds:groups.map(g=>g.reviewId),identityAccepted:false,canonicalId:null,fullRulesAccepted:false,automaticCharacterMigration:false,runtimeChanged:false});
 }
 const family=evidence.figurineUnitProposal;
 if(family.observationId!=='dndsu:items:6459'||family.accepted!==false||family.canonicalIdsAssigned!==0||family.fullRulesVerified!==false||family.variants.length!==4)throw Error('Family label cannot accept variant units');
 return {schemaVersion:1,status:'verified-reference-label-cleanups-not-identity-or-runtime',accepted:false,complete:false,approvedDenominator:null,summary:{reviewedDiagnostics:5,verifiedReferenceEnglishLabels:3,heldDiagnostics:2,acceptedCanonicalUnits:0,acceptedFigurineVariantUnits:0},reviewedCaptureFingerprint,identityGroupsRegrouped:false,originalSnapshotChanged:false,records,sourceCaptures:[...captures.values()].map(c=>({key:c.key,url:c.url,sha256:c.sha256})),limitations:['Three specific reference English labels are supported by independently reviewed exact secondary headings and primary name metadata.','Original observed/search labels and source arrays are preserved; no automatic transliteration or dropping of aliases occurs.','Legacy Nilbog568 and Swarm20456 stay on hold; the other Nilbog version is not substituted for the missing legacy card.','Figurines6459 is a family heading; its four variant proposals are not accepted canonical units or a new denominator.','The view does not regroup identity observations, merge versions, accept full rules/rights or change runtime/characters.']};
}
export function buildMixedScriptReferenceLabels(){const raw=labelInputPaths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n'));const r=reviewMixedScriptReferenceLabels(...raw.map(JSON.parse));r.inputSha256=Object.fromEntries(labelInputPaths.map((p,i)=>[p,createHash('sha256').update(raw[i]).digest('hex')]));return r;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.argv.slice(2).some(a=>a!=='--write'))throw Error('Only --write supported');const r=buildMixedScriptReferenceLabels(),text=JSON.stringify(r,null,2)+'\n',path=new URL('../catalog/mixed-script-reference-labels-2014.json',import.meta.url);if(process.argv.includes('--write'))writeFileSync(path,text);else if(readFileSync(path,'utf8').replace(/\r\n/g,'\n')!==text)throw Error('Stale reference label view');console.log(JSON.stringify(r.summary));}
