import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {catalogInputHash} from './verify-catalog-input-hashes.mjs';
const files=['catalog/effective-m0-review-2014.json','catalog/numeric-source-scope-policy-2014.json','catalog/multibook-monster-publication-evidence-2014.json','catalog/monster-version-unit-proposals-2014.json','catalog/mtf-monster-version-unit-proposals-2014.json'];
const books={
 '111':{book:'vgtm',title:"Volo's Guide to Monsters",policyTitle:"Volo's guide to monsters"},
 '113':{book:'mtof',title:"Mordenkainen's Tome of Foes",policyTitle:"Mordenkainen's Tome of Foes"},
 '158':{book:'motm',title:'Mordenkainen Presents: Monsters of the Multiverse',policyTitle:'Mordenkainen Presents: Monsters of the Multiverse'},
 '129':{book:'oota',title:'Out of the Abyss',policyTitle:'Out of the Abyss'},
 '122':{book:'cm',title:'Candlekeep Mysteries',policyTitle:'Candlekeep Mysteries'},
 '133':{book:'tftyp',title:'Tales from the Yawning Portal',policyTitle:'Tales from the Yawning Portal'}
};
const altKeys={"fraz-urb'luu":'fraz-urb\u2019luu',"graz'zt":'graz\u2019zt'};
const fragments={'meenlock':'Meenlock','baphomet':'Baphomet','demogorgon':'Demogorgon',"fraz-urb'luu":'FrazUrbluu','yeenoghu':'Yeenoghu','derro savant':'DerroSavant','deathlock wight':'DeathlockWight','duergar kavalrachni':'DuergarKavalrachni','derro':'Derro','female steeder':'FemaleSteeder','choker':'Choker','male steeder':'MaleSteeder',"graz'zt":'Grazzt'};
const validFragment=(name,value)=>new URL(value).hash==='#'+fragments[name];
const selected=g=>g.section==='bestiary'&&g.decision==='define-separate-source-version-units'&&g.members.length>2&&g.members.every(m=>m.sourceIds.length===1);
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function validChapter(book,value){
 const u=new URL(value);if(u.origin!=='https://www.dndbeyond.com'||u.username||u.password||u.search||!u.hash)return false;
 const paths={oota:'/(?:sources/(?:dnd/)?|compendium/adventures/)oota/(?:appendix-c-creatures|appendix-d-demon-lords)/?',cm:'/sources/(?:dnd/)?cm/a-deep-and-creeping-darkness/?',tftyp:'/sources/(?:dnd/)?tftyp/appendix-b-creatures/?'};
 const path=paths[book]??'/(?:sources/(?:dnd/)?|compendium/rules/)'+book+'/(?:bestiary(?:-[a-z]+)?|appendix-a-assorted-beasts|appendix-b-nonplayer-characters)/?';
 return new RegExp('^'+path+'$').test(u.pathname);
}
export function reviewMultibookMonsters(review,policy,evidence,volo,mtf){
 const groups=review.identityGroups.filter(selected),names=groups.map(g=>g.comparisonKey).sort();
 if(groups.length!==13||groups.reduce((n,g)=>n+g.members.length,0)!==40||JSON.stringify(names)!==JSON.stringify(evidence.selectedNames))throw Error('Multi-book scope changed');
 if(evidence.schemaVersion!==1||evidence.status!=='multibook-bestiary-publication-metadata-not-full-rules'||evidence.sources?.length!==6)throw Error('Invalid multi-book evidence');
 for(const [id,title] of [...Object.entries(books).map(([id,b])=>[id,b.policyTitle]),['123','Hunt for the Thessalhydra']]){
  const rows=policy.records.filter(r=>r.sourceId===id);if(rows.length!==1||rows[0].observedTitle!==title||rows[0].disposition!=='eligible-publication-records-need-review')throw Error('Publication policy changed');
 }
 const priorGroups=new Set([...volo.groups,...mtf.groups].map(g=>g.reviewId)),priorObservations=new Set([...volo.groups,...mtf.groups].flatMap(g=>g.units).map(u=>u.observationId));
 const indexes=new Map(),alternates=new Map(),linkAnomalies=new Map(),seenSources=new Set();
 for(const s of evidence.sources){
  const b=books[s.sourceId];if(!b||seenSources.has(s.sourceId)||s.book!==b.book||s.title!==b.title||s.url!=='https://www.dndbeyond.com/sources/dnd/'+b.book||!sha(s.htmlSha256))throw Error('Substituted or duplicate source');seenSources.add(s.sourceId);
  const wanted=groups.filter(g=>g.members.some(m=>m.sourceIds[0]===s.sourceId)).map(g=>g.comparisonKey).sort();
  if(JSON.stringify(wanted)!==JSON.stringify(s.selectedNames))throw Error('Book selected names changed');
  const found=new Map(),missing=new Set();
  for(const r of s.records){
   if(!wanted.includes(r.name)||found.has(r.name)||r.heading.toLowerCase()!==r.name||(!validChapter(b.book,r.targetUrl)||!validFragment(r.name,r.targetUrl)))throw Error('Invalid exact heading');
   found.set(r.name,{kind:'publisher-exact-contents-heading',book:b.title,indexUrl:s.url,heading:r.heading,targetUrl:r.targetUrl,htmlSha256:s.htmlSha256});
  }
  for(const r of s.missing){if(!wanted.includes(r.name)||found.has(r.name)||missing.has(r.name)||!['missing-index-heading','ambiguous-index-heading','label-fragment-mismatch'].includes(r.reason))throw Error('Invalid missing evidence');missing.add(r.name);}
  if(found.size+missing.size!==wanted.length)throw Error('Incomplete book accounting');
  const alternateNames=new Set();
  for(const r of s.alternateSpellings){
   if(!missing.has(r.observedKey)||alternateNames.has(r.observedKey)||!Object.hasOwn(altKeys,r.observedKey)||r.publishedKey!==altKeys[r.observedKey]||r.heading.toLowerCase()!==r.publishedKey||r.acceptedAlias!==false||(!validChapter(b.book,r.targetUrl)||!validFragment(r.observedKey,r.targetUrl)))throw Error('Unapproved spelling cannot become exact evidence');
   alternateNames.add(r.observedKey);alternates.set(s.sourceId+'|'+r.observedKey,{...r,sourceId:s.sourceId,htmlSha256:s.htmlSha256,automaticAlias:false});
  }
  const anomalyNames=new Set();
  for(const r of s.linkAnomalies){
   if(!missing.has(r.name)||anomalyNames.has(r.name)||r.heading.toLowerCase()!==r.name||r.reason!=='publisher-label-fragment-mismatch'||r.expectedFragment!==fragments[r.name]||r.observedFragment!==new URL(r.targetUrl).hash.slice(1)||r.observedFragment===r.expectedFragment||!validChapter(b.book,r.targetUrl)||s.missing.find(m=>m.name===r.name)?.reason!=='label-fragment-mismatch')throw Error('Invalid publisher link anomaly');
   anomalyNames.add(r.name);linkAnomalies.set(s.sourceId+'|'+r.name,{...r,sourceId:s.sourceId,htmlSha256:s.htmlSha256,automaticCorrection:false});
  }
  if(s.missing.some(m=>m.reason==='label-fragment-mismatch'&&!anomalyNames.has(m.name)))throw Error('Missing link anomaly evidence');
  indexes.set(s.sourceId,found);
 }
 const typed=evidence.demogorgonDisambiguation;
 if(typed.url!=='https://www.dndbeyond.com/monsters?filter-search=Demogorgon'||!sha(typed.htmlSha256)||typed.records?.length!==3)throw Error('Invalid disambiguation listing');
 const typedRows=new Map(),urls=new Set();
 for(const r of typed.records){
  if(typedRows.has(r.sourceId)||urls.has(r.cardUrl)||!/^https:\/\/www\.dndbeyond\.com\/monsters\/[0-9]+-[a-z0-9-]+$/.test(r.cardUrl))throw Error('Ambiguous typed identity');
  const small=r.sourceId==='123',title=small?'Hunt for the Thessalhydra':books[r.sourceId]?.title;
  if(!['123','129','158'].includes(r.sourceId)||r.displayedSource!==title||r.digitalName!==(small?'Demogorgon (Monstrosity)':'Demogorgon')||r.type!==(small?'Monstrosity':'Fiend (demon)')||r.size!==(small?'Medium':'Huge')||r.challenge!==(small?'4':'26'))throw Error('Different Demogorgon type, label or publication');
  typedRows.set(r.sourceId,r);urls.add(r.cardUrl);
 }
 const ids=new Set(),observations=new Set();
 const proposals=groups.map(g=>{
  if(ids.has(g.reviewId)||priorGroups.has(g.reviewId))throw Error('Repeated or already reviewed group');ids.add(g.reviewId);
  const sources=new Set();
  const units=g.members.map(m=>{
   const id=m.sourceIds[0];if(observations.has(m.id)||priorObservations.has(m.id)||sources.has(id)||m.section!=='bestiary'||m.observedName.trim().toLowerCase()!==g.comparisonKey)throw Error('Repeated or changed observation');observations.add(m.id);sources.add(id);
   let witness=indexes.get(id)?.get(g.comparisonKey)??null;
   if(id==='123'){
    if(g.comparisonKey!=='demogorgon'||m.id!=='dndsu:bestiary:8033')throw Error('Typed proposal applies only to the explicit observation');
    witness={kind:'publisher-disambiguated-listing-proposal',...typedRows.get('123'),indexUrl:typed.url,htmlSha256:typed.htmlSha256,identityAccepted:false};
   }else if(!Object.hasOwn(books,id))throw Error('Unsupported publication');
   return {observationId:m.id,observedName:m.observedName,sourceIds:[...m.sourceIds],publicationEvidence:witness,
    missingReason:witness?null:'exact-primary-heading-unresolved',literalSpellingProposal:alternates.get(id+'|'+g.comparisonKey)??null,publisherLinkAnomaly:linkAnomalies.get(id+'|'+g.comparisonKey)??null,
    proposedVersionKey:witness?g.reviewId+':source:'+id:null,accepted:false,canonicalId:null,fullRules:'unverified',exactErrataVersion:'unverified',translationReusePermission:'not-established'};
  });
  return {reviewId:g.reviewId,name:g.comparisonKey,proposal:g.comparisonKey==='demogorgon'?'review-distinct-homonym-and-publication-versions':units.every(u=>u.publicationEvidence)?'review-separate-publication-versions':'retain-unresolved-publication-attribution',
   units,disambiguation:g.comparisonKey==='demogorgon'?{distinctObservationId:'dndsu:bestiary:8033',proposedDistinctType:'Monstrosity',contrastedPublisherRows:['129','158'].map(id=>typedRows.get(id)),associationOfSource113WithDemonPrince:'requires-primary-type-review',automaticNameAlias:false}:null,
   accepted:false,canonicalId:null,automaticMerge:false,automaticCharacterMigration:false};
 });
 const witnessed=proposals.filter(g=>g.units.every(u=>u.publicationEvidence));
 return {schemaVersion:1,status:'multibook-bestiary-unit-proposals-awaiting-review',accepted:false,complete:false,approvedDenominator:null,
  summary:{consideredGroups:proposals.length,preservedObservations:observations.size,publicationEvidencedObservations:proposals.flatMap(g=>g.units).filter(u=>u.publicationEvidence).length,groupsWithAllPublicationWitnesses:witnessed.length,proposedPublicationUnitsInWitnessedGroups:witnessed.flatMap(g=>g.units).length,unresolvedGroups:proposals.length-witnessed.length,homonymGroups:1,unapprovedSpellingWitnesses:alternates.size,publisherLabelFragmentAnomalies:linkAnomalies.size,acceptedCanonicalUnits:0},groups:proposals,
  limitations:['Only13 multi-book bestiary groups with40 one-source observations are considered; earlier226 simple pairs remain unchanged.',
   'Unapproved literal apostrophes remain alternate witnesses and never fill an exact-name gap.','Publisher label/fragment mismatches stay unresolved; target links are never silently repaired or exchanged.',
   'The source123 Monstrosity is proposed as distinct from the typed source129/158 fiend; source113 type association remains unverified.',
   'TOC and listing metadata do not establish identical/full rules, errata, translation rights, an accepted denominator or automatic migration.']};
}
export function buildMultibookMonsters(){const raw=files.map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8'));return {...reviewMultibookMonsters(...raw.map(JSON.parse)),inputSha256:Object.fromEntries(files.map((f,i)=>[f,catalogInputHash(raw[i])]))};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.slice(2).some(a=>a!=='--write'))throw Error('Only --write supported');
 const r=buildMultibookMonsters(),text=JSON.stringify(r,null,2)+'\n',target=new URL('../catalog/multibook-monster-unit-proposals-2014.json',import.meta.url);
 if(process.argv.includes('--write'))writeFileSync(target,text);else if(readFileSync(target,'utf8').replace(/\r\n/g,'\n')!==text)throw Error('Stale multi-book proposals');console.log(JSON.stringify(r.summary));
}
