import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {classBodyEvidence,sha,structureSha,verifyClassSourceLabels} from './catalog-class-body-evidence.mjs';
const boundary=[[231,238,238],[252,259,265],[273,284,294],[301,308,309]];
const kinds={1:'progression-table',2:'lore',3:'lore',4:'creation-guidance',5:'creation-guidance',6:'backstory-introduction',7:'backstory-guidance',8:'backstory-table',9:'backstory-guidance',10:'backstory-table',11:'backstory-guidance',12:'backstory-table',13:'multiclass-rule-group',14:'section-container',15:'section-container',16:'base-rule',17:'base-rule',18:'base-rule',20:'feature-subrule',21:'feature-subrule',22:'feature-subrule-mixed-source',23:'feature-subrule',24:'feature-subrule',25:'feature-subrule',26:'feature-subrule',27:'feature-subrule',35:'tradition-introduction',115:'excluded-section-index',116:'playtest-section-marker'};
export function verifyWizardBoundaries(manifest,snapshot,composition,html){
 if(manifest.accepted!==false||manifest.complete!==false||manifest.approvedDenominator!==null||manifest.proposedDisposition!=='exclude-third-party-from-common-catalog')throw Error('Proposal promoted');
 const page=snapshot.pages.find(p=>p.url===manifest.classUrl),base=composition.rows.find(r=>r.classSlug==='wizard');
 if(!page||page.url!==base?.classUrl||page.rawSha256!==manifest.snapshotPageSha256||manifest.freshCapture.url!==page.url||structureSha(page.headings)!==manifest.freshCapture.headingStructureSha256)throw Error('Source mismatch');
 if(manifest.groups.length!==boundary.length)throw Error('Boundary count changed');
 const residual=new Set(base.unclassifiedHeadingOrdinals),seen=new Set();
 for(const [i,g] of manifest.groups.entries()){
  if(JSON.stringify([g.parent,g.first,g.last])!==JSON.stringify(boundary[i]))throw Error('Boundary changed');
  const original=page.headings[g.parent-1];
  if(original.inclusion!=='excluded-homebrew'||!original.explicitSources.includes(manifest.publication)||manifest.publication!=='Midgard Heroes Handbook')throw Error('Source parent changed');
  if(!g.basis||g.headings.length!==g.last-g.first+1)throw Error('Incomplete evidence');
  for(const h of [g.parentHeading,...g.headings,...(g.linkEvidence?[g.linkEvidence]:[])]){
   const old=page.headings[h.ordinal-1];
   for(const key of ['ordinal','title','level','anchors','sectionAnchor'])if(JSON.stringify(h[key])!==JSON.stringify(old?.[key]))throw Error('Heading identity changed');
   if(!/^[a-f0-9]{64}$/.test(h.bodySha256))throw Error('Missing body evidence');
  }
  if((i===0||i===2)&&g.linkEvidence?.ordinal!==({0:234,2:280}[i]))throw Error('Missing semantic link');
  if(g.parentHeading.ordinal!==g.parent)throw Error('Wrong parent evidence');
  for(const [j,h] of g.headings.entries()){
   if(h.ordinal!==g.first+j||!residual.has(h.ordinal)||seen.has(h.ordinal))throw Error('Overlapping or missing residual');seen.add(h.ordinal);
  }
 }
 const excludedCount=seen.size;
 if(manifest.classifications?.length!==29)throw Error('Missing unit proposals');
 for(const r of manifest.classifications){
  const h=r.heading,n=h.ordinal,old=page.headings[n-1];
  if(!residual.has(n)||seen.has(n)||r.kind!==kinds[n])throw Error('Wrong residual classification');seen.add(n);
  for(const key of ['ordinal','title','level','anchors','sectionAnchor'])if(JSON.stringify(h[key])!==JSON.stringify(old?.[key]))throw Error('Unit identity changed');
  if(!/^[a-f0-9]{64}$/.test(h.bodySha256)||r.accepted!==false||r.fullRulesVerified!==false||r.canonicalId!==null)throw Error('Unit evidence or acceptance invalid');
  const parent=n>=20&&n<=27?'scope:wizard:class-features:feature.spellcasting':null;
  if(r.parentFeatureObservationId!==parent||parent&&!base.proposalRecords.some(p=>p.observationId===parent&&p.headingOrdinal===19))throw Error('Wrong feature parent');
  const count=n===1?20:[8,10,12].includes(n)?6:null;
  if(JSON.stringify(h.tables)!==JSON.stringify(count?[{rows:count}]:[])||h.bodyEmpty!==[15,116].includes(n))throw Error('Body unit boundary changed');
 }
 if(html!==undefined){
  if(sha(html)!==manifest.freshCapture.sha256)throw Error('Capture changed');verifyClassSourceLabels(page.headings,html);
  const fresh=classBodyEvidence(html);
  if(structureSha(fresh)!==manifest.freshCapture.headingStructureSha256)throw Error('Capture structure changed');
  for(const r of manifest.classifications)if(JSON.stringify(r.heading)!==JSON.stringify(fresh[r.heading.ordinal-1]))throw Error('Classified body changed');
  for(const g of manifest.groups)for(const h of [g.parentHeading,...g.headings,...(g.linkEvidence?[g.linkEvidence]:[])])if(JSON.stringify(h)!==JSON.stringify(fresh[h.ordinal-1]))throw Error('Body evidence changed');
 }
 return {proposedExcludedHeadings:excludedCount,classifiedOtherHeadings:manifest.classifications.length,remainingWizardHeadings:residual.size-seen.size,accepted:false,approvedDenominator:null};
}
export function loadWizardInputs(){return ['catalog/wizard-source-boundary-proposals-2014.json','catalog/dndsu-class-headings.json','catalog/class-composition-review-2014.json'].map(p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8')));}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(verifyWizardBoundaries(...loadWizardInputs(),process.argv[2]?readFileSync(process.argv[2],'utf8'):undefined));
