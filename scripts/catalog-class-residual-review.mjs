import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {sha} from './catalog-class-body-evidence.mjs';
import {verifyResidualUnits} from './catalog-residual-heading-units.mjs';
import {reviewArtificerHeadings} from './catalog-artificer-heading-review.mjs';
import {verifyWizardBoundaries} from './catalog-wizard-source-boundaries.mjs';
const generic=['bard','barbarian','fighter','druid','cleric','warlock','monk','paladin','rogue','ranger','sorcerer'];
export const residualReviewPaths=['catalog/dndsu-class-headings.json','catalog/class-composition-review-2014.json','catalog/dndsu-reviewed-class-proposals.json','catalog/dndsu-source-register.json','catalog/class-source-bibliography.json','catalog/artificer-heading-unit-proposals-2014.json','catalog/wizard-source-boundary-proposals-2014.json',...generic.map(s=>`catalog/${s}-heading-unit-proposals-2014.json`)];
export function buildResidualReview(inputs){
 const [snapshot,composition,reviewed,,,artificer,wizard,...manifests]=inputs;
 if(inputs.length!==residualReviewPaths.length||manifests.length!==generic.length||new Set(manifests.map(m=>m.classSlug)).size!==generic.length||manifests.some(m=>!generic.includes(m.classSlug)))throw Error('Missing or duplicate class batch');
 reviewArtificerHeadings(snapshot,composition,reviewed,artificer);verifyWizardBoundaries(wizard,snapshot,composition);
 const rows=[],seen=new Set();
 const add=(slug,records)=>{
  const base=composition.rows.find(r=>r.classSlug===slug),expected=new Set(base.unclassifiedHeadingOrdinals),counts={classified:0,proposedExcluded:0,sourcePending:0,otherComponents:0};
  for(const r of records){const key=slug+':'+r.ordinal;if(!expected.has(r.ordinal)||seen.has(key))throw Error('Residual overlap or foreign identity');seen.add(key);counts.classified++;if(r.disposition.startsWith('excluded-'))counts.proposedExcluded++;else if(r.disposition==='needs-official-source-evidence')counts.sourcePending++;else counts.otherComponents++;}
  if(counts.classified!==expected.size)throw Error('Incomplete class batch');
  rows.push({classSlug:slug,originalResidualHeadings:expected.size,...counts,accepted:false});
 };
 add('artificer',artificer.records.map(r=>({ordinal:r.heading.ordinal,disposition:'component-review'})));
 add('wizard',[...wizard.groups.flatMap(g=>g.headings.map(h=>({ordinal:h.ordinal,disposition:'excluded-third-party'}))),...wizard.classifications.map(r=>({ordinal:r.heading.ordinal,disposition:'component-review'}))]);
 for(const m of manifests){verifyResidualUnits(m,snapshot,composition,undefined,[inputs[3],inputs[4]]);add(m.classSlug,m.records.map(r=>({ordinal:r.heading.ordinal,disposition:r.kind==='source-policy-component'?m.policyContexts[r.policyContextId].disposition:r.kind==='excluded-third-party-component'?'excluded-third-party':r.kind==='excluded-playtest-component'?'excluded-experimental':'component-review'})));}
 rows.sort((a,b)=>a.classSlug.localeCompare(b.classSlug));
 const sum=key=>rows.reduce((n,r)=>n+r[key],0),summary={classes:rows.length,originalResidualHeadings:composition.summary.unclassifiedHeadings,classifiedResidualHeadings:sum('classified'),remainingUnclassifiedHeadings:composition.summary.unclassifiedHeadings-sum('classified'),proposedExcludedHeadings:sum('proposedExcluded'),sourcePendingHeadings:sum('sourcePending'),otherComponentHeadings:sum('otherComponents')};
 if(summary.classes!==13||summary.remainingUnclassifiedHeadings!==0||summary.classifiedResidualHeadings!==summary.proposedExcludedHeadings+summary.sourcePendingHeadings+summary.otherComponentHeadings)throw Error('Residual conservation failed');
 return {schemaVersion:1,status:'residual-classification-review-not-canonical-catalog',accepted:false,complete:false,approvedDenominator:null,verification:'Offline metadata validation; raw-capture validation is a separate check.',summary,rows,limitations:['All512 residual navigation headings have proposals, not512 new features.','Ten source-pending headings remain unresolved; no official source acceptance is inferred.','Existing913 feature proposals,189 choice observations and57 spell tables are not replaced or accepted here.','Full rules, versions, publication inventory, rights and M0 owner acceptance remain separate.','No runtime imports this research report.']};
}
export function loadResidualReview(){const raw=residualReviewPaths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n'));return {raw,inputs:raw.map(JSON.parse)};}
export function residualReview(){const {raw,inputs}=loadResidualReview(),report=buildResidualReview(inputs);report.inputSha256=Object.fromEntries(residualReviewPaths.map((p,i)=>[p,sha(raw[i])]));return report;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const r=residualReview();writeFileSync(process.argv[2]||new URL('../catalog/class-residual-review-2014.json',import.meta.url),JSON.stringify(r,null,2)+'\n');console.log(r.summary);}
