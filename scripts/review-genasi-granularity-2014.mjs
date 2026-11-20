import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {catalogInputHash} from './verify-catalog-input-hashes.mjs';
const files=['catalog/effective-m0-review-2014.json','catalog/genasi-granularity-publication-evidence-2014.json','catalog/numeric-source-scope-policy-2014.json','catalog/race-other-version-proposals-2014.json'];
const elements=['Air','Earth','Fire','Water'];
const motmUrl='https://www.dndbeyond.com/sources/dnd/motm';
const potaUrl='https://www.dndbeyond.com/sources/dnd/pota';
const legacyUrl='https://www.dndbeyond.com/species/23-genasi';
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const fail=message=>{throw Error(message);};
export function reviewGenasiGranularity(review,evidence,policy,previous){
 if(evidence.schemaVersion!==1||evidence.status!=='genasi-headings-and-publication-metadata-not-full-rules')fail('Unexpected Genasi evidence');
 for(const [id,title] of [['107','Princes of the Apocalypse'],['158','Mordenkainen Presents: Monsters of the Multiverse']]){
  const rows=policy.records.filter(r=>r.sourceId===id);
  if(rows.length!==1||rows[0].observedTitle!==title||rows[0].disposition!=='eligible-publication-records-need-review')fail('Source policy boundary changed');
 }
 const {motm,pota,supportingOtherPublication:other}=evidence;
 if(motm.sourceId!=='158'||motm.title!=='Mordenkainen Presents: Monsters of the Multiverse'||motm.url!==motmUrl||!hash(motm.htmlSha256)||motm.records?.length!==5)fail('Invalid MotM publication');
 const motmRows=new Map();
 for(const r of motm.records){
  if(motmRows.has(r.heading))fail('Duplicate MotM heading');motmRows.set(r.heading,r);
 }
 const parent=motmRows.get('Genasi');
 if(parent?.role!=='family-heading'||parent.parentHeading!==null||parent.targetUrl!=='https://www.dndbeyond.com/sources/motm/fantastical-races#Genasi')fail('Invalid MotM family heading');
 const variants=elements.map(element=>{
  const name=element+' Genasi',r=motmRows.get(name);
  if(r?.role!=='indented-variant-heading'||r.parentHeading!=='Genasi'||r.targetUrl!=='https://www.dndbeyond.com/sources/motm/fantastical-races#'+element+'GenasiTraits')fail('Invalid or missing MotM child');
  return {proposalId:'source-version:158:race:genasi-'+element.toLowerCase(),name,sourceId:'158',
   primaryHeading:r.heading,primaryUrl:r.targetUrl,evidenceRole:r.role,
   accepted:false,canonicalId:null,fullRules:'unverified',exactErrataVersion:'unverified',translationReusePermission:'not-established'};
 });
 if(pota.sourceId!=='107'||pota.book!=='pota'||pota.title!=='Princes of the Apocalypse'||pota.url!==potaUrl||!hash(pota.htmlSha256)||pota.records?.length!==1)fail('Invalid PotA publication');
 const old=pota.records[0];
 if(old.name!=='genasi'||old.heading!=='Appendix A: Genasi'||old.targetUrl!=='https://www.dndbeyond.com/sources/pota/appendix-a-genasi')fail('Invalid PotA family heading');
 if(other.sourceId!==null||other.publication!=="Elemental Evil Player's Companion"||other.url!==legacyUrl||!hash(other.htmlSha256)||other.observationSourceAssignment!==false||other.records?.length!==4)fail('Other publication must not be assigned to source107');
 const otherNames=new Set();
 for(const r of other.records){
  const element=elements.find(e=>r.heading===e+' Genasi');
  if(!element||otherNames.has(r.heading)||r.publicationSlug!=='elemental-evil-players-companion'||r.legacy!==true||r.targetUrl!==legacyUrl+'#'+element+'Genasi')fail('Invalid legacy variant metadata');
  otherNames.add(r.heading);
 }
 const groups=review.identityGroups.filter(g=>g.section==='race'&&g.comparisonKey==='genasi');
 if(groups.length!==1||groups[0].decision!=='define-separate-source-version-units')fail('Unexpected Genasi observation group');
 const group=groups[0],expected=new Map([['158','dndsu:multiverse:race:291'],['107','dndsu:race:102']]);
 if(group.members.length!==2)fail('Unexpected Genasi observation count');
 const seen=new Set();
 const families=group.members.map(member=>{
  const id=member.sourceIds.length===1?member.sourceIds[0]:null;
  if(!expected.has(id)||seen.has(id)||expected.get(id)!==member.id||member.section!=='race'||member.observedName!=='Genasi')fail('Changed or ambiguous Genasi observation');seen.add(id);
  return {observationId:member.id,observedSourceIds:[...member.sourceIds],sourceId:id,
   proposedRole:'family-navigation-not-additional-playable-unit',primaryFamilyUrl:id==='158'?parent.targetUrl:old.targetUrl,
   childProposals:id==='158'?variants:null,
   unresolved:id==='107'?['Exact subrace structure in source107 has not been read; Elemental Evil is separate evidence.']:[],
   accepted:false,canonicalId:null,fullRules:'unverified',exactErrataVersion:'unverified',translationReusePermission:'not-established',
   automaticMerge:false,automaticCharacterMigration:false};
 });
 const prior=previous.groups.filter(g=>g.name==='genasi'&&g.reviewId===group.reviewId);
 if(prior.length!==1||prior[0].units.length!==2||prior[0].units.some(u=>!families.some(f=>f.observationId===u.observationId&&f.sourceId===u.sourceId)))fail('Prior Genasi observations changed');
 return {schemaVersion:1,status:'genasi-family-and-variant-proposals-awaiting-review',accepted:false,complete:false,approvedDenominator:null,
  summary:{preservedObservations:2,familyPublicationWitnesses:2,motmVariantHeadingProposals:variants.length,supportingOtherPublicationHeadings:otherNames.size,unverifiedFamilyComponentSets:1,acceptedCanonicalUnits:0},
  reviewId:group.reviewId,families,
  supportingOtherPublication:{publication:other.publication,url:other.url,sourceId:null,observationSourceAssignment:false,componentNames:[...otherNames],proposedCatalogUnits:0},
  relationship:{kind:'separate-publication-family-versions',rulesEquivalent:'unverified',automaticCharacterMigration:false},
  limitations:['Family headings are navigation containers; four MotM variant headings are proposals, not an accepted denominator.',
   'The earlier generic remaining-race report is preserved as historical input; this scoped layer supplies MotM family evidence only.',
   'No Elemental Evil heading is relabeled source107, and an unavailable PotA chapter is not treated as absent content.',
   'Aarakocra107 remains unresolved: its Elemental Evil listing and an absent PotA TOC match do not prove source107 race attribution.',
   'Full rules, exact versions, translation rights, runtime records and game-design acceptance remain open.']};
}
export function buildGenasiGranularity(){
 const raw=files.map(file=>readFileSync(new URL('../'+file,import.meta.url),'utf8'));
 return {...reviewGenasiGranularity(...raw.map(JSON.parse)),inputSha256:Object.fromEntries(files.map((f,i)=>[f,catalogInputHash(raw[i])]))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.slice(2).some(arg=>arg!=='--write'))throw Error('Only --write supported');
 const report=buildGenasiGranularity(),text=JSON.stringify(report,null,2)+'\n',output=new URL('../catalog/genasi-granularity-proposals-2014.json',import.meta.url);
 if(process.argv.includes('--write'))writeFileSync(output,text);else if(readFileSync(output,'utf8').replace(/\r\n/g,'\n')!==text)throw Error('Stale Genasi granularity proposals');
 console.log(JSON.stringify(report.summary));
}
