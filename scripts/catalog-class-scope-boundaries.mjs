import {readFileSync,writeFileSync} from 'node:fs';import {pathToFileURL} from 'node:url';
export function unresolvedClassSections(navigation,proposals,choices){
 const pending=[],accounted=[];
 for(const page of navigation.pages){const proposal=proposals.find(p=>p.classUrl===page.url);if(!proposal)throw Error('Missing class proposal in boundary audit');
  for(const h of page.headings.filter(h=>h.level===2&&h.explicitSources.length&&h.inclusion==='needs-section-source-review')){
   if(proposal.records.some(r=>r.headingOrdinal===h.ordinal))continue;
   const supplementary=proposal.records.filter(r=>r.sourceSectionTitle===h.title),choice=choices.filter(r=>r.classUrl===page.url&&h.anchors.includes(r.section));
   const row={classUrl:page.url,headingOrdinal:h.ordinal,title:h.title,anchors:h.anchors,sourceResolution:h.sourceResolution};
   if(supplementary.length||choice.length)accounted.push({...row,basis:supplementary.length?'explicit-supplemental-feature':'separate-choice-manifest',observationIds:(supplementary.length?supplementary:choice).map(r=>r.id)});
   else pending.push({...row,status:'needs-source-and-scope-decision',approvedInclusion:null,fullRules:'unverified'});
  }
 }
 return {schemaVersion:1,status:'explicit-source-section-boundaries-not-full-heading-audit',pending,accounted};
}
export function buildClassBoundaries(){const read=f=>JSON.parse(readFileSync(new URL('../catalog/'+f,import.meta.url)));return unresolvedClassSections(read('dndsu-class-headings.json'),[read('dndsu-bard-scope-proposal.json'),read('dndsu-barbarian-scope-proposal.json'),...read('dndsu-reviewed-class-proposals.json').classes],read('dndsu-class-choice-metadata.json').groups.flatMap(g=>g.records));}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=buildClassBoundaries();writeFileSync(process.argv[2]||new URL('../catalog/dndsu-class-scope-boundaries.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log({pending:result.pending.length,accounted:result.accounted.length});}
