import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export const d03InputPaths=['catalog/scope-register-2014.json','catalog/effective-m0-review-2014.json','catalog/drake-companion-unit-proposal-2014.json','catalog/demon-source-attribution-2014.json','catalog/vampiric-ixitxachitl-variant-evidence-2014.json'];
const reviewedEvidenceFingerprint='10b898eb6c44b496ab1bf052cf0b207945e431ec0a3ac9cc4b03d2b577e10984';
const definitions=new Map([
 ['name-review:33a60c9b712e1ff852ad',{name:'vampiric ixitxachitl',kind:'distinct-base-and-spellcasting-reference-views',decision:'resolve-duplicate-or-variant-unit',ids:['dndsu:bestiary:5830','dndsu:bestiary:5832']}],
 ['name-review:77c200ef80920cdff245',{name:'drake companion',kind:'one-companion-with-level-state-views',decision:'resolve-duplicate-or-variant-unit',ids:['dndsu:bestiary:4842','dndsu:bestiary:14130','dndsu:bestiary:14131']}],
 ['name-review:5d3df0bb82c140286b68',{name:'juiblex',kind:'distinct-primary-digital-version-candidates',decision:'resolve-overlapping-source-attribution',ids:['dndsu:bestiary:1752','dndsu:bestiary:6595']}],
 ['name-review:b09a079556cf1e4184bd',{name:'zuggtmoy',kind:'distinct-primary-digital-version-candidates',decision:'resolve-overlapping-source-attribution',ids:['dndsu:bestiary:4910','dndsu:bestiary:6594']}]
]);
const sorted=a=>[...a].sort();const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function reviewD03ReferenceRelations(scope,root,drake,demons,vamp){
 const payload=[drake,demons,vamp].map(({inputSha256,...data})=>data);
 if(createHash('sha256').update(JSON.stringify(payload)).digest('hex')!==reviewedEvidenceFingerprint)throw Error('Changed reviewed source evidence; independent review required');
 if(root.accepted!==false||root.complete!==false||root.approvedDenominator!==null)throw Error('Root canonical acceptance changed');
 const pages=new Map(scope.records.map(p=>[p.id,p]));if(pages.size!==scope.records.length)throw Error('Duplicate source observation');
 const selected=root.identityGroups.filter(g=>definitions.has(g.reviewId));if(selected.length!==4||new Set(selected.map(g=>g.reviewId)).size!==4)throw Error('Missing or duplicate D03 group');
 const seen=new Set(),groups=[];
 for(const g of selected){
  const def=definitions.get(g.reviewId);
  if(g.comparisonKey!==def.name||g.decision!==def.decision||!equal(sorted(g.members.map(m=>m.id)),sorted(def.ids))||g.accepted!==false||g.canonicalId!==null||g.automaticMerge!==false)throw Error('Changed D03 membership or decision');
  const observations=g.members.map(m=>{
   const p=pages.get(m.id);
   if(!p||seen.has(m.id)||p.section!=='bestiary'||m.section!=='bestiary'||p.names.en!==m.observedName||m.observedName.trim().toLowerCase()!==def.name||!equal(sorted(p.sourceIds),sorted(m.sourceIds))||new Set(p.sourceIds).size!==p.sourceIds.length)throw Error('Changed original observation attribution');seen.add(m.id);
   return {observationId:p.id,observedName:p.names.en,referenceUrl:p.url,originalSourceIds:[...p.sourceIds],effectiveReviewSourceIds:[...m.sourceIds],sourceSetEqual:true,sourceOrderSame:equal(p.sourceIds,m.sourceIds),sourceOrderDefinesPriority:false,canonicalId:null};
  });
  let referenceModel;
  if(def.kind==='one-companion-with-level-state-views'){
   referenceModel={oneSubclassCompanion:true,levelStateViews:drake.members.map(m=>({observationId:m.observationId,rangerLevelThreshold:m.rangerLevelThreshold,size:m.size})),originalProposedEntityCount:drake.proposedEntityCount,canonicalEntityCountApproved:null,fullClassRulesAccepted:false};
   for(const m of drake.members){const n=observations.find(o=>o.observationId===m.observationId);if(!n||!equal(n.originalSourceIds,['152'])||n.referenceUrl!==m.url)throw Error('Changed companion state attribution');}
  }else if(def.kind==='distinct-base-and-spellcasting-reference-views'){
   referenceModel={baseObservationId:'dndsu:bestiary:5830',spellcastingObservationId:'dndsu:bestiary:5832',selectedSecondaryNumericFieldsEqual:vamp.comparison.selectedNumericFieldsEqual,primaryIndexAssignedToBoth:false,canonicalEntityCountApproved:null,fullPrimaryRulesAccepted:false};
   for(const r of vamp.records){const n=observations.find(o=>o.observationId===r.observationId);if(!n||!equal(n.originalSourceIds,r.originalSourceIds)||n.referenceUrl!==r.referenceUrl)throw Error('Changed variant attribution');}
  }else{
   const prior=demons.groups.find(r=>r.name.toLowerCase()===g.comparisonKey);
   if(!prior||prior.rows.length!==2)throw Error('Missing demon version witnesses');
   for(const r of prior.rows){const n=observations.find(o=>o.observationId===r.candidateObservationId);if(!n||!equal(n.originalSourceIds,r.observedSourceIds)||n.referenceUrl!==r.originalUrl)throw Error('Changed overlapping-source attribution');}
   referenceModel={primaryDigitalCandidates:prior.rows.map(r=>({candidateObservationId:r.candidateObservationId,cardUrl:r.cardUrl,displayedSource:r.displayedSource,sourceIdOfPrimaryListing:r.sourceIdOfPrimaryListing,identityAccepted:false})),sharedSecondarySourceId:'129',sharedSourceProvesEquivalence:false,mtfAndOotaFullTextEquivalence:'unverified',canonicalEntityCountApproved:null,fullPrimaryRulesAccepted:false};
  }
  const sourceClaims=observations.flatMap(o=>o.originalSourceIds.map((sourceId,i)=>({observationId:o.observationId,sourceId,originalSourceArrayIndex:i,assignedCanonicalVersionId:null})));
  groups.push({reviewId:g.reviewId,name:g.comparisonKey,referenceRelationship:def.kind,acceptedForReferenceRelationship:true,observations,sourceClaims,referenceModel,canonicalUnitCountApproved:null,automaticMerge:false,automaticSourceVersionSplit:false,automaticCharacterMigration:false});
 }
 const captures=[...drake.captures.map(c=>({key:'drake:'+c.capture,url:c.url,sha256:c.sha256})),...demons.captures.map(c=>({key:'demon:'+c.key,url:c.url,sha256:c.sha256})),...vamp.records.map(r=>({key:'vamp:'+r.observationId,url:r.referenceUrl,sha256:r.htmlSha256})),{key:'vamp:primary-index',url:vamp.primaryIndex.url,sha256:vamp.primaryIndex.htmlSha256}];
 if(seen.size!==9||captures.length!==13||new Set(captures.map(c=>c.key)).size!==13)throw Error('Changed D03 observation/capture boundary');
 const claims=groups.reduce((n,g)=>n+g.sourceClaims.length,0);if(claims!==13)throw Error('Changed source claim count');
 return {schemaVersion:1,status:'reviewed-reference-relationships-not-canonical-granularity',accepted:false,complete:false,approvedDenominator:null,summary:{referenceGroups:4,preservedObservations:9,preservedOriginalSourceClaims:claims,effectiveReviewOrderDifferences:groups.flatMap(g=>g.observations).filter(o=>!o.sourceOrderSame).length,reviewedCompanionStateViews:3,primaryDigitalVersionCandidates:4,reviewedSourceCaptures:13,acceptedCanonicalUnits:0},reviewedEvidenceFingerprint,groups,sourceCaptures:captures,originalSnapshotsChanged:false,runtimeChanged:false,limitations:['Reference topology is accepted only for the independently reviewed evidence fingerprint; full class/statblock rules, exact versions, rights and canonical unit counts remain unaccepted.','Source claims retain each original observation and array position. The effective identity review sorts source arrays; two differing orders are displayed, not rewritten or interpreted as source priority.','One companion with three level states is not three unrelated creatures; no feature, breath, action economy or final parameter coverage is inferred.','The two vampiric observations retain their spellcasting distinction; one primary index row is not proof of duplicate identity.','Four legacy/MotM digital candidates stay distinct. Shared source129 and MTF/OotA plaques do not prove full text equivalence or authorize automatic merge/split.','No character/runtime migration, approved denominator, issue closure or M0 stage acceptance occurs.']};
}
export function buildD03ReferenceRelations(){const raw=d03InputPaths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n'));const r=reviewD03ReferenceRelations(...raw.map(JSON.parse));r.inputSha256=Object.fromEntries(d03InputPaths.map((p,i)=>[p,createHash('sha256').update(raw[i]).digest('hex')]));return r;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.argv.slice(2).some(a=>a!=='--write'))throw Error('Only --write supported');const r=buildD03ReferenceRelations(),text=JSON.stringify(r,null,2)+'\n',path=new URL('../catalog/d03-reference-relationships-2014.json',import.meta.url);if(process.argv.includes('--write'))writeFileSync(path,text);else if(readFileSync(path,'utf8').replace(/\r\n/g,'\n')!==text)throw Error('Stale D03 relationship report');console.log(JSON.stringify(r.summary));}
