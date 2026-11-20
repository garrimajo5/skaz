import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function verifyBackgroundReferenceKinds(structures,decisions){
 if(decisions.schemaVersion!==1||decisions.acceptedForReferencePageKinds!==true||decisions.complete!==false||decisions.approvedDenominator!==null||decisions.canonicalUnitsAccepted!==0)throw Error('Reference classification promoted to catalog acceptance');
 if(decisions.review?.reviewedHead!=='c26c696857ffe301cbb8554fef8a1d556e9255e1'||decisions.review.evidenceUrl!=='https://github.com/garrimajo5/skaz/pull/191#issuecomment-7050173376'||decisions.review.fullPrimarySectionsReviewed!==false)throw Error('Changed independent review provenance');
 const source=new Map(structures.records.map(r=>[r.observationId,r]));const ids=new Set();
 if(source.size!==5||structures.records.length!==5||decisions.records.length!==5)throw Error('Changed five-page scope');
 for(const d of decisions.records){
  const r=source.get(d.observationId);
  if(!r||ids.has(d.observationId))throw Error('Unknown or duplicate decision');ids.add(d.observationId);
  if(d.reviewedHtmlSha256!==r.htmlSha256||d.referenceUrl!==r.referenceUrl||JSON.stringify(d.sourceIds)!==JSON.stringify(r.sourceIds)||d.verifiedReferencePageKind!==r.proposedPageKind||r.structureReproduced!==true)throw Error('Decision applied to unreviewed source or kind');
  if(d.acceptedForReferencePageKind!==true||d.standaloneBackgroundUnit!==false||d.componentUnitsAccepted!==false||d.fullRulesAccepted!==false||d.canonicalId!==null||d.automaticProfileChange!==false||d.manualPersonalChoiceRestricted!==false)throw Error('Reference decision changed units, rules or manual choice');
 }
 return {reviewedReferencePageKinds:ids.size,acceptedStandaloneBackgrounds:0,acceptedComponentUnits:0,fullPrimaryRulesAccepted:0,approvedDenominator:null,runtimeChanged:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const read=p=>JSON.parse(readFileSync(new URL('../catalog/'+p,import.meta.url),'utf8'));console.log(JSON.stringify(verifyBackgroundReferenceKinds(read('background-collection-structures-2014.json'),read('background-reference-kind-decisions-2014.json'))));}
