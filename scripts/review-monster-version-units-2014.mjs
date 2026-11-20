import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {catalogInputHash} from './verify-catalog-input-hashes.mjs';
const pairs={'volo-motm':{sourceIds:['111','158'],evidence:'monster-version-publication-evidence-2014.json',output:'monster-version-unit-proposals-2014.json'},'mtof-motm':{sourceIds:['113','158'],evidence:'mtf-monster-version-publication-evidence-2014.json',output:'mtf-monster-version-unit-proposals-2014.json'}};
const configuration=pair=>{if(!Object.hasOwn(pairs,pair))throw Error('Unsupported publication pair');return pairs[pair];};
const books={'113':{book:'mtof',title:"Mordenkainen's Tome of Foes",policyTitle:"Mordenkainen's Tome of Foes"},'111':{book:'vgtm',title:"Volo's Guide to Monsters",policyTitle:"Volo's guide to monsters"},'158':{book:'motm',title:'Mordenkainen Presents: Monsters of the Multiverse',policyTitle:'Mordenkainen Presents: Monsters of the Multiverse'}};
const selected=(g,sourceIds)=>g.section==='bestiary'&&g.decision==='define-separate-source-version-units'&&g.members.length===2&&JSON.stringify(g.members.map(m=>m.sourceIds).sort())===JSON.stringify(sourceIds.map(id=>[id]));
export function reviewMonsterVersions(review,policy,evidence,pair='volo-motm'){
 const config=configuration(pair);
 if(evidence.schemaVersion!==1||evidence.status!=='bestiary-publication-index-evidence-not-full-rules'||!Array.isArray(evidence.sources)||evidence.sources.length!==2)throw Error('Invalid monster evidence');
 const groups=review.identityGroups.filter(g=>selected(g,config.sourceIds)),names=[...new Set(groups.map(g=>g.comparisonKey))].sort();
 if(JSON.stringify(names)!==JSON.stringify(evidence.selectedNames))throw Error('Selected names changed; refresh primary evidence');
 const indexes=new Map();
 for(const sourceId of config.sourceIds){
  const expected=books[sourceId];
  const policies=policy.records.filter(p=>p.sourceId===sourceId);
  if(policies.length!==1||policies[0].observedTitle!==expected.policyTitle||policies[0].disposition!=='eligible-publication-records-need-review')throw Error('Source policy changed');
  const sources=evidence.sources.filter(s=>s.sourceId===sourceId);if(sources.length!==1)throw Error('Ambiguous book evidence');const source=sources[0];
  if(source.book!==expected.book||source.title!==expected.title||source.url!=='https://www.dndbeyond.com/sources/dnd/'+expected.book||!/^[a-f0-9]{64}$/.test(source.htmlSha256))throw Error('Substituted publication');
  const found=new Map(),seen=new Set();
  for(const record of source.records){
   if(!names.includes(record.name)||seen.has(record.name)||typeof record.heading!=='string'||record.heading.toLowerCase()!==record.name)throw Error('Changed or duplicate index name');
   const url=new URL(record.targetUrl),path=new RegExp('^/(?:sources/(?:dnd/)?|compendium/rules/)'+expected.book+'/(?:bestiary(?:-[a-z]+)?|appendix-a-assorted-beasts|appendix-b-nonplayer-characters)/?$');
   if(url.origin!=='https://www.dndbeyond.com'||url.username||url.password||url.search||!url.hash||!path.test(url.pathname))throw Error('Foreign index target');
   seen.add(record.name);found.set(record.name,{book:source.title,indexUrl:source.url,targetUrl:record.targetUrl,heading:record.heading,htmlSha256:source.htmlSha256});
  }
  for(const missing of source.missing){if(!names.includes(missing.name)||seen.has(missing.name)||!['missing-index-heading','ambiguous-index-heading'].includes(missing.reason))throw Error('Invalid missing evidence');seen.add(missing.name);}
  if(seen.size!==names.length)throw Error('Incomplete evidence accounting');indexes.set(sourceId,found);
 }
 const observations=new Set(),ids=new Set();
 const proposals=groups.map(g=>{
  if(ids.has(g.reviewId))throw Error('Duplicate review group');ids.add(g.reviewId);
  const units=g.members.map(member=>{
   if(observations.has(member.id)||member.section!=='bestiary'||member.observedName.trim().toLowerCase()!==g.comparisonKey)throw Error('Changed or duplicate observation');observations.add(member.id);
   const sourceId=member.sourceIds[0],witness=indexes.get(sourceId).get(g.comparisonKey);
   return {observationId:member.id,observedName:member.observedName,sourceIds:[...member.sourceIds],publicationEvidence:witness??null,missingReason:witness?null:'exact-primary-heading-unresolved',proposedVersionKey:witness?g.reviewId+':source:'+sourceId:null,fullRules:'unverified',exactErrataVersion:'unverified',translationReusePermission:'not-established'};
  });
  return {reviewId:g.reviewId,name:g.comparisonKey,proposal:units.every(u=>u.publicationEvidence)?'keep-separate-publication-versions':'retain-unresolved-publication-attribution',units,accepted:false,canonicalId:null,automaticMerge:false,automaticCharacterMigration:false};
 });
 const complete=proposals.filter(g=>g.proposal==='keep-separate-publication-versions');
 return {schemaVersion:1,status:'bestiary-publication-version-proposals-awaiting-review',accepted:false,complete:false,approvedDenominator:null,selection:'Exactly two bestiary observations with separate sourceIds'+config.sourceIds[0]+' and'+config.sourceIds[1]+'; no other group is resolved by this report.',summary:{consideredGroups:groups.length,preservedObservations:observations.size,publicationEvidencedObservations:proposals.flatMap(g=>g.units).filter(u=>u.publicationEvidence).length,proposedSeparateVersionGroups:complete.length,proposedVersionUnits:complete.length*2,unresolvedGroups:groups.length-complete.length,acceptedCanonicalUnits:0},groups:proposals,limitations:['Contents headings establish publication presence, not identical rules or exact errata.','Missing, accented, compound and variant names are not automatically mapped to other headings.','No source observation, runtime entry, character, approved denominator or reuse permission is modified.']};
}
export function buildMonsterVersions(pair='volo-motm'){
 const config=configuration(pair),files=['catalog/effective-m0-review-2014.json','catalog/numeric-source-scope-policy-2014.json','catalog/'+config.evidence];
 const raw=files.map(file=>readFileSync(new URL('../'+file,import.meta.url),'utf8'));
 return {...reviewMonsterVersions(...raw.map(JSON.parse),pair),inputSha256:Object.fromEntries(files.map((file,i)=>[file,catalogInputHash(raw[i])]))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2);if(args.some(arg=>arg!=='--write'&&!arg.startsWith('--pair='))||args.filter(arg=>arg.startsWith('--pair=')).length>1)throw Error('Only --write and one --pair= supported');
 const pair=args.find(arg=>arg.startsWith('--pair='))?.slice(7)??'volo-motm',config=configuration(pair);
 const report=buildMonsterVersions(pair),text=JSON.stringify(report,null,2)+'\n',output=new URL('../catalog/'+config.output,import.meta.url);
 if(args.includes('--write'))writeFileSync(output,text);else if(readFileSync(output,'utf8').replace(/\r\n/g,'\n')!==text)throw Error('Stale monster proposals');console.log(JSON.stringify(report.summary));
}
