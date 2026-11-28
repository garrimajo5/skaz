import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {readAuditInput,readScopeBundle,scopeRegisterPath} from './catalog-audit-inputs.mjs';
import {compareNames} from './audit-dndsu-names.mjs';
const sections=['spells','bestiary','items'];
export function pageIdentity(url){
 const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='dnd.su'||u.search||u.hash||u.port||u.username||u.password)throw Error('Unexpected reference URL');
 const m=u.pathname.match(/^\/(homebrew\/|multiverse\/)?(spells|bestiary|items|class|feats|backgrounds|race)\/(\d+)-[a-z0-9_-]+\/$/);if(!m)throw Error('Unsupported reference path');
 return {id:'dndsu:'+(m[1]==='multiverse/'?'multiverse:':'')+m[2]+':'+m[3],section:m[2],homebrew:m[1]==='homebrew/'};
}
export function buildRegister({index,sources,classIndex,entries,acceptedArt=[],additional,equipment,bestiaryVariants,classNavigation,bardProposal,barbarianProposal,reviewedProposals,choiceMetadata,spellMetadata,spellTables,spellPolicies,bibliography,featureReferences,featureRelations,replicateItems,companions,companionStats,classBoundaries,choiceSpellRefs,replacementExceptions,spellChanges,choicePrereqs,choiceLearning,invocationPolicies,infusionEffects,classBibliography,equipmentIdentities,additionalEquipment,packMemberships,equipmentUnits}){
 const extraSources=additional?Object.values(additional.sections).flatMap(s=>s.sources||[]):[];
 const mergedSources=[...sources.sources];for(const s of extraSources){const existing=mergedSources.find(x=>x.sourceId===s.sourceId);if(existing&&(existing.title!==s.title||(existing.group&&s.group&&existing.group!==s.group)))throw Error('Conflicting source title or group');if(!existing)mergedSources.push(s);}
 const sourceMap=new Map();for(const s of mergedSources){if(sourceMap.has(s.sourceId))throw Error('Duplicate source');sourceMap.set(s.sourceId,s);}
 const local=new Map(entries.map(e=>[e.id,e]));if(local.size!==entries.length)throw Error('Duplicate catalog ID');
 const art=new Set(acceptedArt),seen=new Set(),records=[];
 function add(row,section,extra={}){
  const identity=pageIdentity(row.url);if(identity.section!==(section==='classes'?'class':section))throw Error('Section mismatch');
  if(seen.has(identity.id))throw Error('Duplicate page identity');seen.add(identity.id);
  const ids=[...(row.candidateIds||[])];if(new Set(ids).size!==ids.length||ids.some(id=>!local.has(id)))throw Error('Unknown or duplicate candidate ID');
  const sourceIds=row.sources||[];const unresolvedSources=sourceIds.filter(id=>!sourceMap.has(id));
  const homebrewSources=sourceIds.filter(id=>sourceMap.get(id)?.group==='Homebrew');
  const homebrew=identity.homebrew||extra.group==='excluded-homebrew'||(sourceIds.length>0&&homebrewSources.length===sourceIds.length);
  const inclusion=homebrew?'excluded-homebrew':unresolvedSources.length||homebrewSources.length||!sourceIds.length?'needs-source-review':'candidate-2014';
  records.push({id:identity.id,section,url:row.url,names:{ru:row.ru,en:row.en},sourceIds,...extra,inclusion,...(unresolvedSources.length?{unresolvedSources}:{}),candidateIds:ids,match:row.status||'not-compared',coverage:{record:ids.length?'candidate-present':'not-matched',fullRules:'unverified',metadata:row.fields?'partial-snapshot-fields':'unverified',automation:'not-audited',art:ids.length?ids.every(id=>art.has(id))?'accepted-for-local-candidates':'not-covered-for-all-candidates':'not-applicable-before-match'},reusePermission:'not-established-for-reference-text'});
 }
 for(const section of sections){if(!index.sections[section]?.rows?.length)throw Error('Missing section '+section);for(const row of index.sections[section].rows)add(row,section);}
 for(const row of classIndex.rows){const source=sources.sources.find(s=>s.title===row.sourceTitle);add({...row,sources:source?[source.sourceId]:[]},'classes',{group:row.group,sourceTitle:row.sourceTitle});}
 if(additional)for(const section of ['feats','backgrounds'])for(const row of additional.sections[section].rows)add(row,section);
 if(additional?.sections.race)for(const row of additional.sections.race.rows){const source=mergedSources.find(s=>s.title===row.sourceTitle);add({...row,sources:source?[source.sourceId]:[]},'race',{sourceTitle:row.sourceTitle});}
 if(bestiaryVariants){
  for(const variant of ['classic','multiverse']){const pending=bestiaryVariants.variants[variant].rows.filter(row=>!seen.has(pageIdentity(row.url).id));for(const row of compareNames(pending,entries.filter(e=>e.kind==='monster')))add(row,'bestiary');}
  const variantIds=Object.fromEntries(['classic','multiverse'].map(v=>[v,new Set(bestiaryVariants.variants[v].rows.map(r=>pageIdentity(r.url).id))]));
  for(const r of records)if(r.section==='bestiary')r.observedVariants=['classic','multiverse'].filter(v=>variantIds[v].has(r.id));
 }
 records.sort((a,b)=>a.id.localeCompare(b.id,'en'));
 const summary={observedPages:records.length,bySection:{},inclusion:{},candidateMatchedPages:0,fullRulesVerified:0,complete:false,approvedDenominator:null};
 for(const r of records){summary.bySection[r.section]=(summary.bySection[r.section]||0)+1;summary.inclusion[r.inclusion]=(summary.inclusion[r.inclusion]||0)+1;if(r.candidateIds.length)summary.candidateMatchedPages++;}
 for(const record of records){const matches=(bibliography?.records||[]).filter(b=>b.title===record.sourceTitle);if(matches.length>1)throw Error('Ambiguous bibliography title');if(matches.length)record.bibliographyEvidenceId=matches[0].id;}
 const componentEvidence=[
  [choicePrereqs,'catalog/dndsu-choice-prerequisites.json',choicePrereqs?.summary],
  [choiceLearning,'catalog/dndsu-choice-learning.json',choiceLearning?.summary],
  [invocationPolicies,'catalog/dndsu-invocation-spell-policies.json',invocationPolicies?.summary],
  [infusionEffects,'catalog/dndsu-infusion-effects.json',infusionEffects?.summary],
  [classBibliography,'catalog/class-source-bibliography.json',classBibliography?.summary],
  [spellChanges,'catalog/dndsu-spell-change-proposals.json',spellChanges?.summary],
  [replacementExceptions,'catalog/dndsu-replacement-exceptions.json',replacementExceptions?.summary],
  [choiceSpellRefs,'catalog/dndsu-choice-spell-references.json',choiceSpellRefs?.summary],
  [featureReferences,'catalog/dndsu-feature-spell-references.json',featureReferences?.summary],
  [featureRelations,'catalog/dndsu-feature-spell-relations.json',featureRelations?.summary],
  [replicateItems,'catalog/dndsu-replicate-item-options.json',{options:replicateItems?.groups.reduce((n,g)=>n+g.options.length,0),tableIsExhaustive:false}],
  [companions,'catalog/dndsu-companion-discovery.json',companions?.summary],
  [companionStats,'catalog/dndsu-companion-statblocks.json',{pages:companionStats?.records.length}],
  [classBoundaries,'catalog/dndsu-class-scope-boundaries.json',{pendingSections:classBoundaries?.pending.length}],
  [equipmentIdentities,'catalog/equipment-identity-reconciliation.json',equipmentIdentities?.summary],
  [additionalEquipment,'catalog/srd51-additional-equipment-discovery.json',additionalEquipment?.summary],
  [packMemberships,'catalog/srd51-equipment-pack-memberships.json',packMemberships?.summary],
  [equipmentUnits,'catalog/equipment-unit-proposals-2014.json',equipmentUnits?.summary]
 ].filter(([data])=>data).map(([data,manifest,summary])=>({manifest,status:data.status,summary}));
 return {schemaVersion:1,componentEvidence,rulesetTarget:'5e-2014',status:'discovery-not-approved-full-catalog',inputs:{referenceSnapshotDate:'2026-11-15',sourceMetadataDate:sources.observedOn,classIndexDate:classIndex.observedOn},summary,unindexedScopes:['subclasses-and-features',...(additional?.sections.race?[]:['races-and-origins']),...(additional?[]:['backgrounds','feats']),'ordinary-equipment','mechanics',...(bestiaryVariants?[]:['bestiary-classic-variant'])],records,...(bardProposal?{classScopeProposals:[{classUrl:bardProposal.classUrl,status:bardProposal.status,summary:bardProposal.summary,manifest:'catalog/dndsu-bard-scope-proposal.json'},...(barbarianProposal?[{classUrl:barbarianProposal.classUrl,status:barbarianProposal.status,summary:barbarianProposal.summary,manifest:'catalog/dndsu-barbarian-scope-proposal.json'}]:[]),...(reviewedProposals?.classes||[]).map(p=>({classUrl:p.classUrl,status:p.status,summary:p.summary,manifest:'catalog/dndsu-reviewed-class-proposals.json'}))]}:{}),...(bibliography?{bibliographyEvidence:{status:bibliography.status,records:bibliography.records.length,manifest:'catalog/source-bibliography-evidence.json'}}:{}),...(spellMetadata?{spellIndexMetadata:{observedOn:spellMetadata.observedOn,records:spellMetadata.records.length,status:spellMetadata.status,manifest:'catalog/dndsu-spell-index-metadata.json'}}:{}),...(spellTables?{subclassSpellTables:{summary:spellTables.summary,status:spellTables.status,manifest:'catalog/dndsu-subclass-spell-tables.json'}}:{}),...(spellPolicies?{spellGrantPolicyProposals:{records:spellPolicies.records.length,status:spellPolicies.status,manifest:'catalog/dndsu-spell-grant-proposals.json'}}:{}),...(choiceMetadata?{classChoiceMetadata:{status:choiceMetadata.status,groups:choiceMetadata.groups.length,observations:choiceMetadata.groups.reduce((n,g)=>n+g.records.length,0),manifest:'catalog/dndsu-class-choice-metadata.json'}}:{}),...(classNavigation?{classNavigation:{observedOn:classNavigation.observedOn,pages:classNavigation.pages.length,headings:classNavigation.pages.reduce((n,p)=>n+p.headings.length,0),status:classNavigation.status,manifest:'catalog/dndsu-class-headings.json'}}:{}),...(bestiaryVariants?{bestiaryVariants:{observedOn:bestiaryVariants.observedOn,manifest:'catalog/dndsu-bestiary-variants.json',rulesEquivalence:'unverified'}}:{}),...(equipment?{equipmentObservations:{observedOn:equipment.observedOn,articles:equipment.articles.length,rows:equipment.articles.reduce((n,a)=>n+a.records.length,0),status:equipment.status,manifest:'catalog/dndsu-equipment-discovery.json'}}:{}),...(additional?{additionalDiscoveryDate:additional.observedOn,inventoryArticles:additional.sections.inventory.articles,mechanicsArticles:additional.sections.mechanics?.articles||[],additionalSources:extraSources.filter((s,i,a)=>!sources.sources.some(x=>x.sourceId===s.sourceId)&&a.findIndex(x=>x.sourceId===s.sourceId)===i)}:{}),localCatalog:entries.map(e=>({id:e.id,kind:e.kind,sourceUrl:e.source.url,sourceTitle:e.source.title,sourceVersion:e.source.version,usage:e.source.usage,fullRules:'not-certified-by-this-register',art:art.has(e.id)?'accepted':'not-in-accepted-art-manifest'})).sort((a,b)=>a.id.localeCompare(b.id,'en'))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const inputPaths=['catalog/dndsu-rule-index-2026-11-15.json','catalog/dndsu-source-register.json','catalog/dndsu-class-discovery.json','catalog/art-coverage.json','catalog/dndsu-additional-discovery.json','catalog/dndsu-equipment-discovery.json','catalog/dndsu-bestiary-variants.json','catalog/dndsu-class-headings.json','catalog/dndsu-bard-scope-proposal.json','catalog/dndsu-barbarian-scope-proposal.json','catalog/dndsu-reviewed-class-proposals.json','catalog/dndsu-class-choice-metadata.json','catalog/dndsu-spell-index-metadata.json','catalog/dndsu-subclass-spell-tables.json','catalog/dndsu-spell-grant-proposals.json','catalog/source-bibliography-evidence.json','catalog/dndsu-feature-spell-references.json','catalog/dndsu-feature-spell-relations.json','catalog/dndsu-replicate-item-options.json','catalog/dndsu-companion-discovery.json','catalog/dndsu-companion-statblocks.json','catalog/dndsu-class-scope-boundaries.json','catalog/dndsu-choice-spell-references.json','catalog/dndsu-replacement-exceptions.json','catalog/dndsu-spell-change-proposals.json','catalog/dndsu-choice-prerequisites.json','catalog/dndsu-choice-learning.json','catalog/dndsu-invocation-spell-policies.json','catalog/dndsu-infusion-effects.json','catalog/class-source-bibliography.json','catalog/equipment-identity-reconciliation.json','catalog/srd51-additional-equipment-discovery.json','catalog/srd51-equipment-pack-memberships.json','catalog/equipment-unit-proposals-2014.json'];
 const inputs=inputPaths.map(path=>readAuditInput(scopeRegisterPath,path));
 const [index,sources,classIndex,art,additional,equipment,bestiaryVariants,classNavigation,bardProposal,barbarianProposal,reviewedProposals,choiceMetadata,spellMetadata,spellTables,spellPolicies,bibliography,featureReferences,featureRelations,replicateItems,companions,companionStats,classBoundaries,choiceSpellRefs,replacementExceptions,spellChanges,choicePrereqs,choiceLearning,invocationPolicies,infusionEffects,classBibliography,equipmentIdentities,additionalEquipment,packMemberships,equipmentUnits]=inputs.map(JSON.parse),bundle=readScopeBundle();const output=buildRegister({index,sources,classIndex,entries:bundle.entries,acceptedArt:art.statuses.accepted,additional,equipment,bestiaryVariants,classNavigation,bardProposal,barbarianProposal,reviewedProposals,choiceMetadata,spellMetadata,spellTables,spellPolicies,bibliography,featureReferences,featureRelations,replicateItems,companions,companionStats,classBoundaries,choiceSpellRefs,replacementExceptions,spellChanges,choicePrereqs,choiceLearning,invocationPolicies,infusionEffects,classBibliography,equipmentIdentities,additionalEquipment,packMemberships,equipmentUnits});
 output.inputSha256=Object.fromEntries(inputPaths.map((p,i)=>[p,createHash('sha256').update(inputs[i]).digest('hex')]));
 output.catalogSha256=createHash('sha256').update(JSON.stringify(bundle)).digest('hex');
 writeFileSync(process.argv[2]||new URL('../'+scopeRegisterPath,import.meta.url),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output.summary));
}
