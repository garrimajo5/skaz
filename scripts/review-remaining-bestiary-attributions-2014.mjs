import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {catalogInputHash} from './verify-catalog-input-hashes.mjs';
const files=['catalog/effective-m0-review-2014.json','catalog/numeric-source-scope-policy-2014.json','catalog/remaining-bestiary-source-selection-2014.json','catalog/remaining-bestiary-publication-evidence-2014.json','catalog/monster-version-unit-proposals-2014.json','catalog/mtf-monster-version-unit-proposals-2014.json','catalog/multibook-monster-unit-proposals-2014.json'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const fail=message=>{throw new Error(message);};
const fragment=heading=>heading.replace(/[^A-Za-z0-9]/g,'');
function chapter(spec,value,requireFragment=true){
 let u;try{u=new URL(value);}catch{return false;}
 if(u.origin!=='https://www.dndbeyond.com'||u.username||u.password||u.search||(!u.hash&&requireFragment)||!spec.bookCode)return false;
 return new RegExp('^/(?:sources/(?:dnd/)?|compendium/(?:rules|adventures)/)'+spec.bookCode+'/[^?#]+$').test(u.pathname);
}
export function reviewRemainingBestiary(review,policy,selection,evidence,...prior){
 if(selection.accepted!==false||selection.expectedGroups!==18||selection.expectedObservations!==36||selection.expectedPublicationClaims!==50)fail('Unsupported remaining scope');
 const previousGroups=new Set(prior.flatMap(r=>r.groups.map(g=>g.reviewId)));
 const previousObservations=new Set(prior.flatMap(r=>r.groups.flatMap(g=>g.units.map(u=>u.observationId))));
 const groups=review.identityGroups.filter(g=>g.section==='bestiary'&&g.decision==='define-separate-source-version-units'&&!previousGroups.has(g.reviewId));
 if(groups.length!==18||!same(groups.map(g=>g.reviewId).sort(),selection.selectedReviewIds)||!same(evidence.selectedReviewIds,selection.selectedReviewIds))fail('Remaining group selection changed');
 const basis=groups.flatMap(g=>g.members.map(m=>({reviewId:g.reviewId,name:g.comparisonKey,observationId:m.id,observedName:m.observedName,sourceIds:m.sourceIds})));
 if(!same(basis,selection.observationBasis))fail('Observation attribution changed');
 if(basis.length!==36||basis.reduce((n,m)=>n+m.sourceIds.length,0)!==50)fail('Publication claim scope changed');
 if(evidence.schemaVersion!==1||evidence.status!=='remaining-bestiary-publication-witnesses-not-full-rules')fail('Invalid evidence status');
 const specs=new Map(selection.sources.map(s=>[s.sourceId,s]));
 if(specs.size!==25||evidence.sources.length!==25)fail('Publication selection changed');
 const indexes=new Map(),sourceSeen=new Set();
 let parentContexts=0,alternates=0,articleMentions=0,chapterFailures=0;
 for(const source of evidence.sources){
  const spec=specs.get(source.sourceId),p=policy.records.filter(r=>r.sourceId===source.sourceId);
  if(!spec||sourceSeen.has(source.sourceId)||p.length!==1||p[0].observedTitle!==spec.policyTitle||p[0].disposition!=='eligible-publication-records-need-review')fail('Unknown, duplicate or changed source policy');
  sourceSeen.add(source.sourceId);
  if(source.policyTitle!==spec.policyTitle||source.kind!==spec.kind||source.indexUrl!==spec.sourceUrl||!sha(source.htmlSha256))fail('Substituted source evidence');
  if(spec.expectedPublishedTitle!==null&&(!source.literalPublicationTitleVerified||!source.publishedIndexHeadings.includes(spec.expectedPublishedTitle)))fail('Missing literal publication title');
  const wanted=[...new Set(groups.filter(g=>g.members.some(m=>m.sourceIds.includes(source.sourceId))).map(g=>g.comparisonKey))].sort();
  if(!same(source.wantedNames,wanted))fail('Changed source names');
  const found=new Map(),missing=new Set();
  for(const record of source.records){
   if(spec.kind!=='publisher-toc'||source.scopedTocPresent!==true||!wanted.includes(record.name)||found.has(record.name)||record.heading.toLowerCase()!==record.name||record.kind!=='publisher-scoped-toc-heading'||record.publicationPresenceOnly!==true||!chapter(spec,record.targetUrl)||new URL(record.targetUrl).hash!=='#'+fragment(record.heading))fail('Invalid exact publication witness');
   found.set(record.name,{kind:record.kind,indexUrl:source.indexUrl,htmlSha256:source.htmlSha256,heading:record.heading,targetUrl:record.targetUrl,publicationPresenceOnly:true,statBlockIdentityAccepted:false});
  }
  for(const item of source.missing){if(!wanted.includes(item.name)||found.has(item.name)||missing.has(item.name)||!['exact-heading-unresolved','ambiguous-scoped-heading'].includes(item.reason))fail('Invalid missing claim');missing.add(item.name);}
  if(found.size+missing.size!==wanted.length)fail('Incomplete source accounting');
  for(const context of source.parentContexts){if(!spec.contextLabels.includes(context.heading)||!chapter(spec,context.targetUrl,false)||context.relation!=='parent-chapter-only'||context.satisfiesCreatureClaim!==false)fail('Parent chapter cannot become a creature witness');parentContexts++;}
  for(const alt of source.unapprovedAlternates){if(!wanted.includes(alt.observedKey)||!spec.unapprovedAlternates[alt.observedKey]?.includes(alt.heading)||!chapter(spec,alt.targetUrl)||alt.aliasAccepted!==false||alt.usedAsExactWitness!==false)fail('Unapproved spelling cannot fill exact evidence');alternates++;}
  for(const mention of source.articleMentions){if(spec.kind!=='publisher-article'||!wanted.includes(mention.name)||mention.heading.toLowerCase()!==mention.name||mention.acceptedAsPublicationWitness!==false||!/^https:\/\/www\.dndbeyond\.com\/monsters\/[0-9]+-[a-z0-9-]+$/.test(mention.targetUrl))fail('Article mention cannot become a book witness');articleMentions++;}
  for(const anomaly of source.linkAnomalies){if(!wanted.includes(anomaly.name)||anomaly.heading.toLowerCase()!==anomaly.name||!chapter(spec,anomaly.targetUrl)||anomaly.expectedFragment!==fragment(anomaly.heading)||anomaly.automaticCorrection!==false||!missing.has(anomaly.name))fail('Invalid uncorrected publisher anomaly');}
  if(source.chapterAccess){const access=source.chapterAccess;if(access.usedAsCreatureEvidence!==false||!source.parentContexts.some(c=>c.targetUrl.split('#')[0]===access.requestedUrl)||!['unavailable','redirected-chapter-not-read','heading-only-access-not-used-for-identity'].includes(access.status))fail('Chapter access cannot establish identity');if(access.status==='unavailable'||access.status==='redirected-chapter-not-read')chapterFailures++;}
  indexes.set(source.sourceId,found);
 }
 const seenObservations=new Set(),seenClaims=new Set();
 const proposals=groups.map(g=>{
  if(g.members.length!==2||g.accepted!==false||g.canonicalId!==null||g.automaticMerge!==false)fail('Unreviewed group was promoted');
  const observations=g.members.map(m=>{
   if(seenObservations.has(m.id)||previousObservations.has(m.id)||m.section!=='bestiary'||m.observedName.trim().toLowerCase()!==g.comparisonKey||new Set(m.sourceIds).size!==m.sourceIds.length)fail('Repeated or changed observation');seenObservations.add(m.id);
   return {observationId:m.id,observedName:m.observedName,sourceIds:[...m.sourceIds],sourceArrayPreserved:true};
  });
  const claims=observations.flatMap(m=>m.sourceIds.map(sourceId=>{
   const key=m.observationId+'|'+sourceId;if(seenClaims.has(key)||!indexes.has(sourceId))fail('Repeated or unsupported attribution claim');seenClaims.add(key);
   const witness=indexes.get(sourceId).get(g.comparisonKey)??null;
   return {claimKey:key,observationId:m.observationId,sourceId,publicationWitness:witness,missingReason:witness?null:'exact-publication-heading-unresolved',accepted:false,canonicalId:null,fullRules:'unverified',exactErrataVersion:'unverified',translationReusePermission:'not-established'};
  }));
  return {reviewId:g.reviewId,name:g.comparisonKey,kind:observations.some(m=>m.sourceIds.length>1)?'composite-source-attribution':'two-single-source-observations',observations,publicationClaims:claims,allPublicationHeadingsWitnessed:claims.every(c=>c.publicationWitness),accepted:false,canonicalId:null,automaticMerge:false,automaticSourceVersionSplit:false,automaticCharacterMigration:false};
 });
 const composite=proposals.filter(g=>g.kind==='composite-source-attribution'),simple=proposals.filter(g=>g.kind==='two-single-source-observations');
 if(composite.length!==9||simple.length!==9||seenClaims.size!==50||seenObservations.size!==36)fail('Remaining cohort counts changed');
 return {schemaVersion:1,status:'remaining-bestiary-attribution-proposals-awaiting-review',accepted:false,complete:false,approvedDenominator:null,
  summary:{consideredGroups:proposals.length,compositeGroups:composite.length,simpleGroups:simple.length,preservedObservations:seenObservations.size,publicationClaims:seenClaims.size,exactPublicationHeadingClaims:proposals.flatMap(g=>g.publicationClaims).filter(c=>c.publicationWitness).length,groupsWithAllPublicationHeadings:proposals.filter(g=>g.allPublicationHeadingsWitnessed).length,parentContexts,unapprovedAlternates:alternates,publisherArticleMentions:articleMentions,unavailableChapterAttempts:chapterFailures,acceptedCanonicalUnits:0},groups:proposals,
  limitations:['18 remaining groups are disjoint from the previous239 bestiary groups;36 observed pages retain all50 explicit source attributions.',
   'An attribution edge is not an accepted canonical version. Composite observations are never split or reassigned automatically.',
   'Exact scoped headings establish publication presence, not a full stat block, type, identical rules or reuse permission.',
   'Parent chapters, renamed labels and publisher-article mentions stay separate and never fill an exact-heading gap.',
   'Missing/unavailable evidence stays unresolved; no accepted denominator, runtime catalog change or character migration is established.']};
}
export function buildRemainingBestiary(){const raw=files.map(f=>readFileSync(new URL('../'+f,import.meta.url),'utf8'));return {...reviewRemainingBestiary(...raw.map(JSON.parse)),inputSha256:Object.fromEntries(files.map((f,i)=>[f,catalogInputHash(raw[i])]))};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.slice(2).some(a=>a!=='--write'))fail('Only --write is supported');
 const report=buildRemainingBestiary(),text=JSON.stringify(report,null,2)+'\n',target=new URL('../catalog/remaining-bestiary-attribution-proposals-2014.json',import.meta.url);
 if(process.argv.includes('--write'))writeFileSync(target,text);else if(readFileSync(target,'utf8').replace(/\r\n/g,'\n')!==text)fail('Stale remaining bestiary report');console.log(JSON.stringify(report.summary));
}
