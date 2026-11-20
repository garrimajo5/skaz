import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {classBodyEvidence,sha,structureSha,verifyClassSourceLabels,verifyClassBodyPrefix} from './catalog-class-body-evidence.mjs';
const manualSourceInputs=['catalog/dndsu-source-register.json','catalog/class-source-bibliography.json'].map(p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8')));
export function isThirdPartyPublication(title,register=manualSourceInputs[0],bibliography=manualSourceInputs[1]){
 return register.sources.some(s=>s.title===title&&s.group==='Homebrew')||bibliography.records.some(r=>r.referenceTitle===title&&r.publicationKind==='third-party-sourcebook'&&r.evidence.length>0);
}
export function verifyResidualUnits(manifest,snapshot,composition,html,sourceEvidence=manualSourceInputs){
 if(manifest.accepted!==false||manifest.complete!==false||manifest.approvedDenominator!==null)throw Error('Proposal promoted');
 const page=snapshot.pages.find(p=>p.url===manifest.classUrl),base=composition.rows.find(r=>r.classSlug===manifest.classSlug);
 if(!page||page.url!==base?.classUrl||page.rawSha256!==manifest.snapshotPageSha256||manifest.freshCapture.url!==page.url||structureSha(page.headings)!==manifest.freshCapture.headingStructureSha256||!/^[a-f0-9]{64}$/.test(manifest.freshCapture.sha256))throw Error('Source mismatch');
 const expected=new Set(base.unclassifiedHeadingOrdinals),seen=new Set();
 if(manifest.records.length!==expected.size)throw Error('Incomplete residual coverage');
 const parentKinds=new Set(['feature-subrule','additional-spell-table','feature-effect-table','feature-limit-table','feature-presentation-guidance','feature-choice-table','feature-choice-index-and-rules','feature-subrule-table','feature-reference-table','feature-reference-guidance','feature-progression-table']);
 const kinds=new Set([...parentKinds,'progression-table','lore','creation-guidance','backstory-introduction','backstory-guidance','backstory-table','multiclass-rule-group','section-container','base-rule','tradition-introduction','excluded-section-index','backstory-guidance-table','feature-limit-table','excluded-third-party-component','excluded-playtest-component','choice-index-and-rules','choice-expansion-and-rules','source-policy-component','variant-introduction']);
 for(const r of manifest.records){
  const h=r.heading,n=h.ordinal,old=page.headings[n-1];
  if(!expected.has(n)||seen.has(n)||!kinds.has(r.kind))throw Error('Wrong residual identity or kind');seen.add(n);
  for(const key of ['ordinal','title','level','anchors','sectionAnchor'])if(JSON.stringify(h[key])!==JSON.stringify(old?.[key]))throw Error('Heading changed');
  if(!/^[a-f0-9]{64}$/.test(h.bodySha256)||typeof h.bodyEmpty!=='boolean'||!Array.isArray(h.tables)||h.tables.some(t=>!Number.isInteger(t.rows)||t.rows<0)||r.accepted!==false||r.fullRulesVerified!==false||r.canonicalId!==null)throw Error('Invalid evidence or acceptance');
  if(r.kind.endsWith('-table')&&(h.tables.length===0||h.tables.some(t=>t.rows===0)))throw Error('Missing table data');
  if(parentKinds.has(r.kind)){
   if(!base.proposalRecords.some(p=>p.observationId===r.parentFeatureObservationId&&p.headingOrdinal===r.parentHeadingOrdinal&&p.headingOrdinal<n))throw Error('Missing existing parent');
  }else if(r.parentFeatureObservationId!==null||r.parentHeadingOrdinal!==null)throw Error('Invented parent');
  if(['excluded-third-party-component','excluded-playtest-component'].includes(r.kind)){
   const context=manifest.exclusionContexts?.[r.sourceContextId],source=context&&page.headings[context.sourceHeading.ordinal-1],link=context&&page.headings[context.linkHeading.ordinal-1];
   const sourceStatus=r.kind==='excluded-playtest-component'?'needs-playtest-review':'excluded-homebrew';
   const manual=context?.sourceBasis==='manual-leading-source-label';
   if(manual){
    if(!isThirdPartyPublication(context.publication,...sourceEvidence)||r.kind!=='excluded-third-party-component'||!['needs-section-source-review','needs-playtest-review'].includes(source?.inclusion)||context.sourcePrefix!==`Источник: «${context.publication}»`||!context.publication||source.ordinal>n||(!link||link.ordinal<source.ordinal||link.ordinal>n)||!context.basis)throw Error('Missing manual source evidence');
   }else if(!context?.basis||source?.inclusion!==sourceStatus||link?.inclusion!==sourceStatus||!source.explicitSources.includes(context.publication)||link.ordinal>=n)throw Error('Missing exclusion source evidence');
   for(const evidence of [context.sourceHeading,context.linkHeading]){const old=page.headings[evidence.ordinal-1];for(const key of ['ordinal','title','level','anchors','sectionAnchor'])if(JSON.stringify(evidence[key])!==JSON.stringify(old[key]))throw Error('Exclusion identity changed');if(!/^[a-f0-9]{64}$/.test(evidence.bodySha256))throw Error('Missing exclusion body');}
  }else if(r.sourceContextId!=null)throw Error('Unexpected exclusion context');
  if(r.kind==='source-policy-component'){
   const context=manifest.policyContexts?.[r.policyContextId],source=context&&page.headings[context.sourceHeading.ordinal-1],decision=context&&base.explicitSourceSectionDecisions.find(d=>d.headingOrdinal===source?.ordinal);
   if(!context?.basis||!decision||context.disposition!==decision.disposition||JSON.stringify(context.bibliographyIds)!==JSON.stringify(decision.bibliographyIds)||source.level!==2||source.ordinal>n||n>context.lastHeadingOrdinal||!Number.isInteger(context.lastHeadingOrdinal)||context.lastHeadingOrdinal>page.headings.length||page.headings.some(h=>h.ordinal>source.ordinal&&h.ordinal<=context.lastHeadingOrdinal&&h.level<=source.level))throw Error('Source policy boundary changed');
   for(const key of ['ordinal','title','level','anchors','sectionAnchor'])if(JSON.stringify(context.sourceHeading[key])!==JSON.stringify(source[key]))throw Error('Policy source identity changed');
   if(!/^[a-f0-9]{64}$/.test(context.sourceHeading.bodySha256))throw Error('Missing policy body');
  }else if(r.policyContextId!=null)throw Error('Unexpected policy context');

 }
 if(html!==undefined){
  if(sha(html)!==manifest.freshCapture.sha256)throw Error('Capture changed');verifyClassSourceLabels(page.headings,html);const body=classBodyEvidence(html);
  if(structureSha(body)!==manifest.freshCapture.headingStructureSha256)throw Error('Capture structure changed');
  for(const c of Object.values(manifest.exclusionContexts??{}))if(c.sourceBasis==='manual-leading-source-label')verifyClassBodyPrefix(html,c.sourceHeading.ordinal,c.sourcePrefix);
  for(const c of Object.values(manifest.exclusionContexts??{}))for(const h of [c.sourceHeading,c.linkHeading])if(JSON.stringify(h)!==JSON.stringify(body[h.ordinal-1]))throw Error('Exclusion body evidence changed');
  for(const c of Object.values(manifest.policyContexts??{}))if(JSON.stringify(c.sourceHeading)!==JSON.stringify(body[c.sourceHeading.ordinal-1]))throw Error('Policy body evidence changed');
  for(const r of manifest.records)if(JSON.stringify(r.heading)!==JSON.stringify(body[r.heading.ordinal-1]))throw Error('Body evidence changed');
 }
 return {classSlug:manifest.classSlug,classifiedResidualHeadings:seen.size,remainingResidualHeadings:expected.size-seen.size,accepted:false,approvedDenominator:null};
}
export function loadResidualInputs(file){return [file,'catalog/dndsu-class-headings.json','catalog/class-composition-review-2014.json'].map(p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8')));}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(verifyResidualUnits(...loadResidualInputs(process.argv[2]),process.argv[3]?readFileSync(process.argv[3],'utf8'):undefined));
