import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export const classInputs=['catalog/class-scope.json','catalog/dndsu-class-headings.json','catalog/dndsu-bard-scope-proposal.json','catalog/dndsu-barbarian-scope-proposal.json','catalog/dndsu-reviewed-class-proposals.json','catalog/dndsu-class-choice-metadata.json','catalog/class-scope-policy-2014.json','catalog/dndsu-subclass-spell-tables.json'];
export function buildClassComposition(scope,headings,bard,barbarian,reviewed,choices,sectionPolicy,spellTables){
 const expected=new Set(['bard','barbarian','fighter','wizard','druid','cleric','artificer','warlock','monk','paladin','rogue','ranger','sorcerer']);
 if(scope.rows.length!==13||headings.pages.length!==13||new Set(scope.rows.map(r=>r.slug)).size!==13||scope.rows.some(r=>!expected.has(r.slug)))throw Error('Incomplete thirteen-class scope');
 const sources=new Map(headings.pages.map(p=>[p.url,p])),proposals=new Map(),globalIds=new Set(),choiceIds=new Set(),tableIds=new Set();
 if(spellTables.classes.length!==13||new Set(spellTables.classes.map(c=>c.classUrl)).size!==13)throw Error('Incomplete spell table class inventory');
 if(sources.size!==13)throw Error('Repeated class page');
 for(const p of [bard,barbarian,...reviewed.classes]){if(proposals.has(p.classUrl))throw Error('Repeated class proposal');proposals.set(p.classUrl,p);}
 if(proposals.size!==13)throw Error('Missing class proposal');
 const rows=scope.rows.map(c=>{
  const page=sources.get(c.url),proposal=proposals.get(c.url);
  if(!page||!proposal||proposal.inputPageSha256!==page.rawSha256)throw Error('Stale or unlinked class proposal');
  const hs=new Map(page.headings.map(h=>[h.ordinal,h]));if(hs.size!==page.headings.length)throw Error('Duplicate heading identity');
  if(page.headings.some((h,i)=>!Number.isInteger(h.level)||h.level<1||h.level>6||!Number.isInteger(h.ordinal)||(i>0&&h.ordinal<=page.headings[i-1].ordinal)))throw Error('Invalid heading order or level');
  const represented=new Set(),excluded=new Set(),kinds={},records=[];
  for(const r of proposal.records){
   const h=hs.get(r.headingOrdinal);
   if(!h||h.title!==r.title||r.sourceUrl.split('#')[0]!==c.url||globalIds.has(r.id)||represented.has(r.headingOrdinal))throw Error('Proposal heading identity mismatch');
   if(h.inclusion!=='needs-section-source-review'||r.canonicalCatalogId!==null||r.fullRules!=='unverified')throw Error('Proposal promoted');
   globalIds.add(r.id);represented.add(r.headingOrdinal);kinds[r.kind]=(kinds[r.kind]||0)+1;
   records.push({observationId:r.id,headingOrdinal:r.headingOrdinal,kind:r.kind,sourceIds:[...r.sourceIds]});
  }
  for(const e of proposal.excluded){if(!hs.has(e.ordinal)||excluded.has(e.ordinal)||represented.has(e.ordinal))throw Error('Excluded heading overlaps or is missing');excluded.add(e.ordinal);}
  const classChoices=[],choiceRecords=[];
  for(const g of choices.groups.filter(g=>g.classUrl===c.url)){
   if(g.rawSha256!==page.rawSha256)throw Error('Choice page hash differs');
   for(const r of g.records){if(r.classUrl!==c.url||choiceIds.has(r.id)||r.canonicalCatalogId!==null||r.fullRules!=='unverified')throw Error('Choice identity or acceptance differs');choiceIds.add(r.id);classChoices.push(r.id);choiceRecords.push(r);}
  }
  const policyRows=sectionPolicy.records.filter(r=>r.observation.classUrl===c.url).map(r=>{
   const h=hs.get(r.observation.headingOrdinal);
   if(!h||h.title!==r.observation.title)throw Error('Policy heading differs');
   return {headingOrdinal:h.ordinal,disposition:r.disposition,bibliographyIds:r.evidence.map(e=>e.id)};
  });
  const classTables=spellTables.classes.find(t=>t.classUrl===c.url);
  if(!classTables||classTables.rawSha256!==page.rawSha256)throw Error('Spell table page hash differs');
  for(const t of classTables.tables){if(t.classUrl!==c.url||tableIds.has(t.id))throw Error('Duplicate or foreign spell table');tableIds.add(t.id);}
  const referenceExcluded=[],playtest=[],choiceLinks=[],tableLinks=[],remaining=[],stack=[],contexts=new Map();
  for(const h of page.headings){
   while(stack.length&&stack.at(-1).level>=h.level)stack.pop();
   contexts.set(h.ordinal,new Set([h.sectionAnchor,...h.anchors,...stack.flatMap(a=>a.anchors)].filter(Boolean)));
   stack.push(h);
  }
  for(const h of page.headings){
   if(represented.has(h.ordinal)||excluded.has(h.ordinal))continue;
   if(h.inclusion==='excluded-homebrew'){referenceExcluded.push(h.ordinal);continue;}
   if(h.inclusion==='needs-playtest-review'){playtest.push(h.ordinal);continue;}
   if(h.inclusion!=='needs-section-source-review')throw Error('Unknown heading scope');
   const matches=choiceRecords.filter(r=>r.title===h.title&&contexts.get(h.ordinal).has(r.section));
   const tables=classTables.tables.filter(t=>t.heading===h.title&&contexts.get(h.ordinal).has(t.parent));
   if(matches.length===1&&tables.length===0)choiceLinks.push({headingOrdinal:h.ordinal,choiceObservationId:matches[0].id,sectionAnchor:matches[0].section});
   else if(tables.length===1&&matches.length===0)tableLinks.push({headingOrdinal:h.ordinal,tableObservationId:tables[0].id,sectionAnchor:tables[0].parent});
   else remaining.push(h.ordinal);
  }
  return {classSlug:c.slug,classUrl:c.url,headings:page.headings.length,proposalCountsByKind:kinds,proposalRecords:records,excludedHeadingOrdinals:[...excluded],referenceExcludedHomebrewHeadingOrdinals:referenceExcluded,playtestReviewHeadingOrdinals:playtest,existingChoiceHeadingLinks:choiceLinks,existingSpellTableHeadingLinks:tableLinks,spellTableObservationIds:classTables.tables.map(t=>t.id),unclassifiedHeadingOrdinals:remaining,choiceObservationIds:classChoices,explicitSourceSectionDecisions:policyRows,legacyPendingComponentLabels:[...(proposal.pendingComponents||[])],fullPublicationInventoryVerified:false,approvedCanonicalUnits:null};
 });
 const urls=new Set(scope.rows.map(r=>r.url));
 if(choices.groups.some(g=>!urls.has(g.classUrl))||sectionPolicy.records.some(r=>!urls.has(r.observation.classUrl)))throw Error('Orphan choice or policy page');
 const kinds={};for(const r of rows)for(const [kind,n]of Object.entries(r.proposalCountsByKind))kinds[kind]=(kinds[kind]||0)+n;
 return {schemaVersion:1,status:'class-composition-reconciliation-not-catalog-acceptance',accepted:false,complete:false,approvedDenominator:null,summary:{classes:rows.length,observedHeadings:rows.reduce((n,r)=>n+r.headings,0),proposedHeadingUnits:globalIds.size,excludedHeadingObservations:rows.reduce((n,r)=>n+r.excludedHeadingOrdinals.length,0),referenceExcludedHomebrewHeadings:rows.reduce((n,r)=>n+r.referenceExcludedHomebrewHeadingOrdinals.length,0),playtestReviewHeadings:rows.reduce((n,r)=>n+r.playtestReviewHeadingOrdinals.length,0),existingChoiceHeadings:rows.reduce((n,r)=>n+r.existingChoiceHeadingLinks.length,0),existingSpellTableHeadings:rows.reduce((n,r)=>n+r.existingSpellTableHeadingLinks.length,0),spellTableObservations:tableIds.size,unclassifiedHeadings:rows.reduce((n,r)=>n+r.unclassifiedHeadingOrdinals.length,0),choiceObservations:choiceIds.size,proposalCountsByKind:kinds,explicitSourceSectionDecisions:rows.reduce((n,r)=>n+r.explicitSourceSectionDecisions.length,0)},rows,limitations:['Existing source flags are retained per heading; homebrew and playtest groups are not missing official features.','Choice and spell-table links require exact title, current/ancestor section anchor and captured page identity; ambiguous matches remain unclassified.','Headings, proposed units and choice options overlap conceptually and are not additive canonical counts.','Unclassified headings can be prose, tables or existing choices; they are not proven missing features.','Legacy pending-component labels are preserved as historical leads, not proof that later metadata work is absent.','Explicit source decisions cover only their twelve recorded section headings; this report does not silently inherit exclusions to child features.','No runtime features, full rules, automation, publication completeness or text rights are accepted.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const raw=classInputs.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n'));
 const r=buildClassComposition(...raw.map(JSON.parse));r.inputSha256=Object.fromEntries(classInputs.map((p,i)=>[p,createHash('sha256').update(raw[i]).digest('hex')]));
 writeFileSync(process.argv[2]||new URL('../catalog/class-composition-review-2014.json',import.meta.url),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r.summary));
}
