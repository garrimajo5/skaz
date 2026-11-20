import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {classBodyEvidence,sha,structureSha} from './catalog-class-body-evidence.mjs';
export function verifyResidualUnits(manifest,snapshot,composition,html){
 if(manifest.accepted!==false||manifest.complete!==false||manifest.approvedDenominator!==null)throw Error('Proposal promoted');
 const page=snapshot.pages.find(p=>p.url===manifest.classUrl),base=composition.rows.find(r=>r.classSlug===manifest.classSlug);
 if(!page||page.url!==base?.classUrl||page.rawSha256!==manifest.snapshotPageSha256||manifest.freshCapture.url!==page.url||structureSha(page.headings)!==manifest.freshCapture.headingStructureSha256||!/^[a-f0-9]{64}$/.test(manifest.freshCapture.sha256))throw Error('Source mismatch');
 const expected=new Set(base.unclassifiedHeadingOrdinals),seen=new Set();
 if(manifest.records.length!==expected.size)throw Error('Incomplete residual coverage');
 const parentKinds=new Set(['feature-subrule','additional-spell-table','feature-effect-table']);
 const kinds=new Set([...parentKinds,'progression-table','lore','creation-guidance','backstory-introduction','backstory-guidance','backstory-table','multiclass-rule-group','section-container','base-rule','tradition-introduction','excluded-section-index']);
 for(const r of manifest.records){
  const h=r.heading,n=h.ordinal,old=page.headings[n-1];
  if(!expected.has(n)||seen.has(n)||!kinds.has(r.kind))throw Error('Wrong residual identity or kind');seen.add(n);
  for(const key of ['ordinal','title','level','anchors','sectionAnchor'])if(JSON.stringify(h[key])!==JSON.stringify(old?.[key]))throw Error('Heading changed');
  if(!/^[a-f0-9]{64}$/.test(h.bodySha256)||typeof h.bodyEmpty!=='boolean'||!Array.isArray(h.tables)||h.tables.some(t=>!Number.isInteger(t.rows)||t.rows<0)||r.accepted!==false||r.fullRulesVerified!==false||r.canonicalId!==null)throw Error('Invalid evidence or acceptance');
  if(parentKinds.has(r.kind)){
   if(!base.proposalRecords.some(p=>p.observationId===r.parentFeatureObservationId&&p.headingOrdinal===r.parentHeadingOrdinal&&p.headingOrdinal<n))throw Error('Missing existing parent');
  }else if(r.parentFeatureObservationId!==null||r.parentHeadingOrdinal!==null)throw Error('Invented parent');
 }
 if(html!==undefined){
  if(sha(html)!==manifest.freshCapture.sha256)throw Error('Capture changed');const body=classBodyEvidence(html);
  if(structureSha(body)!==manifest.freshCapture.headingStructureSha256)throw Error('Capture structure changed');
  for(const r of manifest.records)if(JSON.stringify(r.heading)!==JSON.stringify(body[r.heading.ordinal-1]))throw Error('Body evidence changed');
 }
 return {classSlug:manifest.classSlug,classifiedResidualHeadings:seen.size,remainingResidualHeadings:expected.size-seen.size,accepted:false,approvedDenominator:null};
}
export function loadResidualInputs(file){return [file,'catalog/dndsu-class-headings.json','catalog/class-composition-review-2014.json'].map(p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8')));}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(verifyResidualUnits(...loadResidualInputs(process.argv[2]),process.argv[3]?readFileSync(process.argv[3],'utf8'):undefined));
