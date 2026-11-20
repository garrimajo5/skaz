import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {verifyBackgroundReferenceKinds} from './verify-background-reference-kinds-2014.mjs';
import {reviewMixedScriptReferenceLabels} from './review-mixed-script-reference-labels-2014.mjs';
export const residualInputPaths=['catalog/scope-register-2014.json','catalog/effective-m0-review-2014.json','catalog/mixed-script-name-evidence-2014.json','catalog/background-collection-structures-2014.json','catalog/background-reference-kind-decisions-2014.json','catalog/mixed-script-reference-labels-2014.json'];
export function reviewD04Residuals(scope,root,evidence,structures,kinds,compiledLabels){
 if(root.accepted!==false||root.complete!==false||root.approvedDenominator!==null)throw Error('Root M0 acceptance changed');
 verifyBackgroundReferenceKinds(structures,kinds);
 const expectedLabels=reviewMixedScriptReferenceLabels(scope,root,evidence);const {inputSha256,...labels}=compiledLabels;
 if(JSON.stringify(labels)!==JSON.stringify(expectedLabels))throw Error('Stale compiled reference labels');
 const pages=new Map(scope.records.map(p=>[p.id,p]));
 const decisions=new Map(kinds.records.map(r=>[r.observationId,r])),seen=new Set();
 if(root.missingNames.length!==5)throw Error('Unexpected missing-English diagnostic scope');
 const explainedCollectionPages=root.missingNames.map(row=>{
  const d=decisions.get(row.observationId),page=pages.get(row.observationId);
  if(!d||!page||seen.has(row.observationId)||row.section!=='backgrounds'||page.section!=='backgrounds'||page.names.en!==''||page.url!==d.referenceUrl||JSON.stringify(page.sourceIds)!==JSON.stringify(d.sourceIds))throw Error('Unreviewed or repeated collection diagnostic');seen.add(row.observationId);
  return {observationId:row.observationId,originalMissingEnglishDiagnosticPreserved:true,referencePageKind:d.verifiedReferencePageKind,reviewedHtmlSha256:d.reviewedHtmlSha256,fieldDisposition:'preserve-empty-name-for-reviewed-reference-collection',standaloneBackgroundAccepted:false,componentUnitsAccepted:false};
 });
 const verifiedLabels=labels.records.filter(r=>r.acceptedForReferenceEnglishLabel).map(r=>({observationId:r.observationId,effectiveReferenceEnglishName:r.effectiveReferenceEnglishName,originalObservedEnglishName:r.originalObservedEnglishName,sourceIds:[...r.sourceIds],identityReviewIds:[...r.identityReviewIds],identityAccepted:false,runtimeChanged:false}));
 const heldLabels=labels.records.filter(r=>!r.acceptedForReferenceEnglishLabel).map(r=>({observationId:r.observationId,sourceIds:[...r.sourceIds],reason:r.labelDecision,nextRequiredEvidence:r.observationId==='dndsu:bestiary:568'?'Exact secondary legacy card for observation568; never substitute6883.':'Exact primary name and publication for observation20456; an AL umbrella label or visual transliteration is insufficient.',automaticCorrection:false}));
 if(verifiedLabels.length!==3||heldLabels.length!==2)throw Error('Changed reviewed/held diagnostic partition');
 return {schemaVersion:1,status:'current-d04-field-review-with-two-source-holds','accepted':false,complete:false,approvedDenominator:null,summary:{originalMissingEnglishDiagnostics:5,reviewedReferenceCollectionExplanations:5,originalMixedScriptDiagnostics:5,verifiedReferenceEnglishLabels:3,heldReferenceLabels:2,acceptedCanonicalBackgrounds:0,acceptedCanonicalUnits:0},explainedCollectionPages,verifiedLabels,heldLabels,originalRootChanged:false,identityGroupsRegrouped:false,otherM0DecisionsChanged:false,runtimeChanged:false,limitations:['This is the residual of selected D04 field/type diagnostics, not a catalog-completeness percentage or an approved denominator.','Five collection-page explanations preserve empty English names; they do not invent standalone background entries or accept component rules.','Three label corrections preserve original observed/search labels and identity membership in the separate reviewed view.','Two exact source conditions remain open; full rules, versions, rights and the other M0 decisions remain separate unfinished work.','No character data, runtime catalog, source snapshot, issue closure or stage acceptance is changed.']};
}
export function buildD04Residuals(){const raw=residualInputPaths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n'));const r=reviewD04Residuals(...raw.map(JSON.parse));r.inputSha256=Object.fromEntries(residualInputPaths.map((p,i)=>[p,createHash('sha256').update(raw[i]).digest('hex')]));return r;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.argv.slice(2).some(a=>a!=='--write'))throw Error('Only --write supported');const r=buildD04Residuals(),text=JSON.stringify(r,null,2)+'\n',path=new URL('../catalog/m0-d04-residual-review-2014.json',import.meta.url);if(process.argv.includes('--write'))writeFileSync(path,text);else if(readFileSync(path,'utf8').replace(/\r\n/g,'\n')!==text)throw Error('Stale D04 residual report');console.log(JSON.stringify(r.summary));}
