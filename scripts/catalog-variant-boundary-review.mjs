import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export function reviewVariantBoundaries(manifest,index,scope){
 if(manifest.accepted!==false||manifest.automaticPatch!==false||manifest.approvedDenominator!==null)throw Error('Unverified acceptance');
 const observations=new Map(scope.records.map(r=>[r.id,r]));
 const cards=new Map(index.pages.flatMap(p=>p.rows).map(r=>[r.cardUrl,r]));
 const records=new Map();
 for(const r of manifest.records){
  const original=observations.get(r.observationId),v=r.selectedObservedFields;
  if(!original||records.has(r.observationId)||original.names.en!==r.observedName||original.url!==r.url||JSON.stringify(original.sourceIds)!==JSON.stringify(r.sourceIds))throw Error('Observation identity mismatch');
  if(r.evidenceKind!=='secondary-observation'||r.fullRulesVerified!==false||r.automaticPatch!==false)throw Error('Secondary evidence promoted');
  if(!v||typeof v.challengeRating!=='string'||!/^\d+(?:\/\d+)?$/.test(v.challengeRating)||!Number.isSafeInteger(v.armorClass)||v.armorClass<0||!Number.isSafeInteger(v.hitPoints)||v.hitPoints<1||typeof v.alignment!=='string'||!v.alignment.trim())throw Error('Invalid observed values');
  records.set(r.observationId,r);
 }
 if(manifest.primaryAccess.fullTextRead!==false||manifest.primaryAccess.result!=='redirect-to-marketplace')throw Error('Primary access boundary changed');
 const used=new Set(),groups=new Set();
 const rows=manifest.groups.map(g=>{
  const card=cards.get(g.cardUrl);
  if(!card||card.digitalName!==g.digitalName||groups.has(g.id)||g.identityDecision!=='unresolved'||g.canonicalId!==null||g.automaticMerge!==false||!g.observationIds.length)throw Error('Invalid unresolved group');
  groups.add(g.id);
  const members=g.observationIds.map(id=>{
   const r=records.get(id);if(!r||used.has(id))throw Error('Missing or reused observation');used.add(id);
   const v=r.selectedObservedFields;
   return {observationId:id,observedName:r.observedName,originalSourceIds:[...r.sourceIds],selectedObservedFields:{...v},challengeRatingComparison:card.challengeRating===''?'primary-index-not-shown':card.challengeRating===v.challengeRating?'same-number-not-proof-of-identity':'different-number-needs-version-review',alignmentComparison:card.alignment===v.alignment?'same-label-not-proof-of-identity':'different-label-needs-version-review'};
  });
  const differingObservedFields=['challengeRating','armorClass','hitPoints','alignment'].filter(k=>new Set(members.map(m=>m.selectedObservedFields[k])).size>1);
  return {groupId:g.id,digitalName:card.digitalName,primaryIndex:{cardUrl:card.cardUrl,challengeRating:card.challengeRating,alignment:card.alignment},members,differingObservedFields,identityDecision:'unresolved',canonicalId:null,automaticMerge:false,primaryFullTextRead:false};
 });
 if(used.size!==records.size)throw Error('Ungrouped observations');
 return {schemaVersion:1,status:'variant-differences-not-canonical-identity',accepted:false,approvedDenominator:null,summary:{groups:rows.length,observations:used.size,groupsWithObservedDifferences:rows.filter(r=>r.differingObservedFields.length).length,primaryIndexCrDifferences:rows.flatMap(r=>r.members).filter(r=>r.challengeRatingComparison==='different-number-needs-version-review').length},rows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const paths=['catalog/skt-variant-boundaries-2014.json','catalog/skt-public-index-2014.json','catalog/scope-register-2014.json'];
 const raw=paths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n'));
 const data=raw.map(JSON.parse);
 for(let i=1;i<paths.length;i++)if(data[0].inputSha256[paths[i]]!==createHash('sha256').update(raw[i]).digest('hex'))throw Error('Pinned input changed');
 const report=reviewVariantBoundaries(...data);report.inputSha256=Object.fromEntries(paths.map((p,i)=>[p,createHash('sha256').update(raw[i]).digest('hex')]));
 writeFileSync(process.argv[2]||new URL('../catalog/skt-variant-review-2014.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));
}
