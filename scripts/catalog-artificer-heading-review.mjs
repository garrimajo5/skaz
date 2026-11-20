import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {classBodyEvidence,sha,structureSha} from './catalog-class-body-evidence.mjs';
export const paths=['catalog/dndsu-class-headings.json','catalog/class-composition-review-2014.json','catalog/dndsu-reviewed-class-proposals.json','catalog/artificer-heading-unit-proposals-2014.json'];
const kinds=new Map([[1,'progression-table'],[2,'lore'],[3,'creation-guidance'],[4,'creation-guidance'],[5,'multiclass-rule-group'],[6,'section-container'],[7,'section-container'],[8,'base-rule'],[9,'base-rule'],[10,'base-rule'],[13,'feature-subrule'],[14,'presentation-guidance'],[15,'feature-subrule'],[16,'feature-subrule'],[17,'feature-subrule'],[18,'feature-subrule'],[20,'feature-subrule'],[21,'feature-subrule'],[32,'choice-index-and-rules'],[49,'section-container'],[55,'feature-effect-table'],[64,'feature-effect-table'],[86,'excluded-section-marker']]);
const parentOrdinals=new Map([[13,12],[14,12],[15,12],[16,12],[17,12],[18,12],[20,19],[21,19],[55,54],[64,63]]);
export function verifyArtificerCapture(manifest,html){
 if(sha(html)!==manifest.freshCapture.sha256)throw Error('Fresh capture changed');
 const body=classBodyEvidence(html);
 if(structureSha(body)!==manifest.freshCapture.headingStructureSha256)throw Error('Capture heading structure changed');
 for(const r of manifest.records)if(JSON.stringify(body[r.heading.ordinal-1])!==JSON.stringify(r.heading))throw Error('Body evidence changed');
 return {classifiedBodies:manifest.records.length,source:'secondary-only'};
}
export function reviewArtificerHeadings(headings,composition,proposals,manifest){
 if(manifest.accepted!==false||manifest.complete!==false||manifest.approvedDenominator!==null)throw Error('Classification promoted');
 const page=headings.pages.find(p=>p.url===manifest.classUrl),base=composition.rows.find(r=>r.classSlug==='artificer'),existing=proposals.classes.find(c=>c.classUrl===manifest.classUrl);
 if(!page||!base||!existing||manifest.classUrl!==base.classUrl||page.rawSha256!==manifest.snapshotPageSha256||existing.inputPageSha256!==page.rawSha256||manifest.freshCapture.url!==page.url||manifest.freshCapture.headingStructureMatchesSnapshot!==true||!/^[a-f0-9]{64}$/.test(manifest.freshCapture.sha256))throw Error('Source provenance mismatch');
 if(structureSha(page.headings)!==manifest.freshCapture.headingStructureSha256)throw Error('Snapshot heading structure changed');
 const expected=new Set(base.unclassifiedHeadingOrdinals),seen=new Set(),counts={},rows=[];
 if(expected.size!==23||manifest.records.length!==23)throw Error('Unexpected classification boundary');
 const byId=new Map(existing.records.map(r=>[r.id,r]));
 for(const r of manifest.records){
  const h=r.heading,n=h.ordinal,original=page.headings.find(x=>x.ordinal===n);
  if(!expected.has(n)||seen.has(n)||!original||r.kind!==kinds.get(n))throw Error('Missing duplicate or wrong classification');seen.add(n);
  for(const key of ['ordinal','title','level','anchors','sectionAnchor'])if(JSON.stringify(h[key])!==JSON.stringify(original[key]))throw Error('Original heading changed');
  if(!/^[a-f0-9]{64}$/.test(h.bodySha256)||typeof h.bodyEmpty!=='boolean'||r.canonicalId!==null||r.fullRulesVerified!==false||r.accepted!==false)throw Error('Body evidence or acceptance invalid');
  const parent=parentOrdinals.get(n);
  if(parent){const p=byId.get(r.parentFeatureObservationId);if(!p||p.headingOrdinal!==parent||r.parentBasis!=='manual-body-review-not-HTML-inheritance')throw Error('Wrong semantic parent');}
  else if(r.parentFeatureObservationId!==null||r.parentBasis!==null)throw Error('Invented semantic parent');
  const expectedRows={1:20,55:6,64:3}[n];
  if(expectedRows?JSON.stringify(h.tables)!==JSON.stringify([{rows:expectedRows}]):h.tables.length!==0)throw Error('Table unit boundary changed');
  if(h.bodyEmpty!==(n===7))throw Error('Empty body classification changed');
  counts[r.kind]=(counts[r.kind]||0)+1;rows.push({headingOrdinal:n,kind:r.kind,parentFeatureObservationId:r.parentFeatureObservationId,canonicalId:null,accepted:false});
 }
 return {schemaVersion:1,status:'derived-artificer-classification-review-not-canonical-units',accepted:false,complete:false,approvedDenominator:null,summary:{observedHeadings:base.headings,existingFeatureProposals:base.proposalRecords.length,classifiedResidualHeadings:rows.length,remainingArtificerClassificationHeadings:expected.size-seen.size,remainingAllClassClassificationHeadings:composition.summary.unclassifiedHeadings-seen.size,byKind:counts},rows,limitations:['Zero remaining headings in this explicit residual batch is not complete rules or canonical class acceptance.','Existing43 feature proposals remain unchanged; components are not counted as extra features.','Primary publication, exact version, reproduction rights and automation remain downstream or unresolved.','The original composition report and all source observations are preserved.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const raw=paths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n'));const result=reviewArtificerHeadings(...raw.map(JSON.parse));result.inputSha256=Object.fromEntries(paths.map((p,i)=>[p,sha(raw[i])]));
 if(process.argv[2]==='--capture'){console.log(JSON.stringify(verifyArtificerCapture(JSON.parse(raw[3]),readFileSync(process.argv[3],'utf8'))));}
 else {writeFileSync(process.argv[2]||new URL('../catalog/artificer-heading-review-2014.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.summary));}
}
