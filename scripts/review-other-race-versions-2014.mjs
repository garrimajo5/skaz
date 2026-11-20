import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {catalogInputHash} from './verify-catalog-input-hashes.mjs';
const files=['catalog/effective-m0-review-2014.json','catalog/race-other-publication-evidence-2014.json','catalog/numeric-source-scope-policy-2014.json','catalog/race-other-toc-evidence-2014.json','catalog/race-version-unit-proposals-2014.json'];
const output=new URL('../catalog/race-other-version-proposals-2014.json',import.meta.url);
const publications={'107':'Princes of the Apocalypse','112':"Guildmasters' guide to Ravnica",'119':'Eberron: Rising from the Last War','121':'Mythic Odysseys of Theros','151':'The Wild Beyond The Witchlight: A Feywild Adventure','158':'Mordenkainen Presents: Monsters of the Multiverse'};
const books={'107':{book:'pota',title:'Princes of the Apocalypse',names:['genasi']},'112':{book:'ggtr',title:"Guildmasters' Guide to Ravnica",names:['centaur','minotaur']},'151':{book:'twbtw',title:'The Wild Beyond the Witchlight',names:['fairy','harengon']}};
const key=value=>value.trim().toLowerCase();
export function reviewOtherRaceVersions(review,index,policy,toc,previous){
 if(index.schemaVersion!==1||index.url!=='https://www.dndbeyond.com/species'||!/^[a-f0-9]{64}$/.test(index.htmlSha256)||index.faq?.url!=='https://www.dndbeyond.com/posts/1201-faq-for-mordenkainen-presents-monsters-of-the')throw Error('Unexpected publisher index');
 if(toc.schemaVersion!==1||!Array.isArray(toc.sources))throw Error('Unexpected contents evidence');
 for(const [id,title] of Object.entries(publications)){
  const records=policy.records.filter(r=>r.sourceId===id);
  if(records.length!==1||records[0].observedTitle!==title||records[0].disposition!=='eligible-publication-records-need-review')throw Error('Publication mapping changed');
 }
 const primary=new Map(),urls=new Set();
 for(const record of index.records){
  if(typeof record.name!=='string'||typeof record.publication!=='string'||!/^https:\/\/www\.dndbeyond\.com\/species\/[0-9]+-[a-z0-9-]+$/.test(record.url))throw Error('Invalid primary identity');
  const id=key(record.name)+'|'+key(record.publication);
  if(primary.has(id)||urls.has(record.url))throw Error('Ambiguous primary identity');
  primary.set(id,record);urls.add(record.url);
 }
 const headings=new Map(),seenBooks=new Set();
 for(const source of toc.sources){
  const expected=books[source.sourceId];
  if(!expected||seenBooks.has(source.sourceId)||source.book!==expected.book||source.title!==expected.title||source.url!=='https://www.dndbeyond.com/sources/dnd/'+expected.book||!/^[a-f0-9]{64}$/.test(source.htmlSha256))throw Error('Invalid contents publication');
  seenBooks.add(source.sourceId);
  for(const row of source.records){
   const id=source.sourceId+'|'+row.name,url=new URL(row.targetUrl);
   const expectedHeading=row.name==='genasi'?'Appendix A: Genasi':row.name[0].toUpperCase()+row.name.slice(1);
   if(!expected.names.includes(row.name)||row.heading!==expectedHeading||headings.has(id)||url.origin!=='https://www.dndbeyond.com'||url.search||!['/sources/','/sources/dnd/','/compendium/rules/'].some(prefix=>url.pathname.startsWith(prefix+expected.book+'/')))throw Error('Invalid or duplicate contents heading');
   headings.set(id,{...row,sourceUrl:source.url,htmlSha256:source.htmlSha256});
  }
 }
 const priorIds=new Set(previous.groups.map(g=>g.reviewId));
 if(priorIds.size!==previous.groups.length)throw Error('Duplicate prior group');
 const selected=review.identityGroups.filter(g=>g.section==='race'&&g.decision==='define-separate-source-version-units'&&!priorIds.has(g.reviewId));
 const names=selected.map(g=>g.comparisonKey).sort();
 if(JSON.stringify(names)!==JSON.stringify([...new Set(index.selectedNames)].sort()))throw Error('Selected index does not cover remaining race groups');
 const seen=new Set(),observations=new Set(),groups=[];
 for(const group of selected){
  if(seen.has(group.reviewId))throw Error('Duplicate review group');seen.add(group.reviewId);
  const units=group.members.map(member=>{
   if(member.section!=='race'||typeof member.id!=='string'||observations.has(member.id)||key(member.observedName)!==group.comparisonKey)throw Error('Invalid or reused observation');observations.add(member.id);
   const sourceId=member.sourceIds.length===1?member.sourceIds[0]:null;
   if(sourceId&&!publications[sourceId])throw Error('Unsupported source in scoped review');
   const exact=sourceId?primary.get(group.comparisonKey+'|'+key(publications[sourceId])):null;
   const heading=sourceId?headings.get(sourceId+'|'+group.comparisonKey):null;
   return {observationId:member.id,sourceIds:[...member.sourceIds],sourceId,
    identityEvidenceKind:exact?'publisher-index':heading?'publisher-contents-heading':'missing',
    primaryIdentityUrl:exact?.url??heading?.targetUrl??null,
    contentsSourceUrl:heading?.sourceUrl??null,
    missingReason:exact||heading?null:sourceId?'no-exact-primary-name-and-publication-match':member.sourceIds.length?'ambiguous-source-attribution':'missing-source-attribution',
    otherListedPublications:index.records.filter(r=>key(r.name)===group.comparisonKey).map(r=>r.publication),
    proposedVersionKey:sourceId?group.reviewId+':source:'+sourceId:null,
    fullRules:'unverified',exactErrataVersion:'unverified',translationReusePermission:'not-established'};
  });
  const keys=units.map(u=>u.proposedVersionKey).filter(Boolean);if(new Set(keys).size!==keys.length)throw Error('Duplicate source version within group');
  const complete=units.every(u=>!u.missingReason);
  groups.push({reviewId:group.reviewId,name:group.comparisonKey,proposal:complete?'keep-separate-publication-versions':'retain-unresolved-publication-attribution',units,accepted:false,canonicalId:null,automaticMerge:false,automaticCharacterMigration:false});
 }
 const proposed=groups.filter(g=>g.proposal==='keep-separate-publication-versions');
 return {schemaVersion:1,status:'remaining-race-publication-proposals-awaiting-review',accepted:false,complete:false,approvedDenominator:null,
  summary:{consideredGroups:groups.length,proposedSeparateVersionGroups:proposed.length,unresolvedGroups:groups.length-proposed.length,preservedObservations:observations.size,publicationEvidencedObservations:groups.flatMap(g=>g.units).filter(u=>!u.missingReason).length,proposedVersionUnits:proposed.flatMap(g=>g.units).length,acceptedCanonicalUnits:0},groups,
  limitations:['Only remaining race identity groups are considered; the earlier Volo/MotM proposal is unchanged.','A contents heading proves publication attribution, not full rules or exact text version.','An unlabeled observation is never assigned a source merely from a matching name.','Elemental Evil is not substituted for source107 Princes of the Apocalypse; later Forge versions do not replace source119 Rising.','Publisher label typography is retained; Ravnica references use separate publisher contents evidence.','No profile migration, runtime import, accepted denominator or reuse approval is performed.']};
}
export function buildOtherRaceVersions(){
 const raw=files.map(file=>readFileSync(new URL('../'+file,import.meta.url),'utf8'));
 return {...reviewOtherRaceVersions(...raw.map(JSON.parse)),inputSha256:Object.fromEntries(files.map((file,i)=>[file,catalogInputHash(raw[i])]))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.slice(2).some(arg=>arg!=='--write'))throw Error('Only --write supported');
 const report=buildOtherRaceVersions(),text=JSON.stringify(report,null,2)+'\n';
 if(process.argv.includes('--write'))writeFileSync(output,text);else if(readFileSync(output,'utf8').replace(/\r\n/g,'\n')!==text)throw Error('Stale other race proposals');
 console.log(JSON.stringify(report.summary));
}
