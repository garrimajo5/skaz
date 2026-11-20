import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const nonempty=s=>typeof s==='string'&&s.trim().length>0;
const cardUrl=s=>{try{const u=new URL(s);return u.origin==='https://www.dndbeyond.com'&&/^\/monsters\/\d+-[a-z0-9-]+$/.test(u.pathname)&&!u.search&&!u.hash;}catch{return false;}};
export function reviewPrimaryIndex(index,scope){
 if(index.accepted!==false||index.complete!==false||index.approvedDenominator!==null||index.historicalBookInventoryComplete!==false||index.fullStatBlocksRead!==false)throw Error('Unsupported acceptance boundary');
 if(!nonempty(index.observedSourceId)||!nonempty(index.title)||!index.publicIndexTraversalComplete||!Array.isArray(index.pages)||!index.pages.length||index.pages.length!==index.publicIndexPagesCaptured)throw Error('Incomplete index traversal');
 if(index.allowBlankChallengeRatings===true&&index.blankChallengeRatingMeaning!=='not shown in public index; never infer zero')throw Error('Missing blank CR semantics');
 const observations=new Map();for(const r of scope.records){if(!nonempty(r.id)||observations.has(r.id)||!Array.isArray(r.sourceIds))throw Error('Invalid observation identity');observations.set(r.id,r);}
 const seen=new Set(),rows=[],sourceCounts={};
 for(const [i,page]of index.pages.entries()){
  if(page.page!==i+1||page.nextPage!==(i===index.pages.length-1?null:i+2)||!Array.isArray(page.rows)||!page.rows.length||page.rows.length>20)throw Error('Broken pagination chain');
  for(const r of page.rows){
   if(!nonempty(r.digitalName)||!nonempty(r.displayedSource)||!cardUrl(r.cardUrl)||seen.has(r.cardUrl)||(!/^\d+(?:\/\d+)?$/.test(r.challengeRating)&&!(index.allowBlankChallengeRatings===true&&r.challengeRating==='')))throw Error('Invalid digital row');
   seen.add(r.cardUrl);sourceCounts[r.displayedSource]=(sourceCounts[r.displayedSource]||0)+1;rows.push({...r,indexPage:page.page});
  }
 }
 if(rows.length!==index.summary.digitalRows||JSON.stringify(Object.entries(sourceCounts).sort())!==JSON.stringify(Object.entries(index.summary.displayedSourceCounts).sort()))throw Error('Index counts changed');
 const blankCR=rows.filter(r=>r.challengeRating==='').length;
 if(index.allowBlankChallengeRatings===true&&index.summary.blankChallengeRatingRows!==blankCR)throw Error('Blank CR count changed');
 const aliases=new Map();for(const a of index.explicitNameCandidates||[]){
  if(!seen.has(a.cardUrl)||aliases.has(a.cardUrl)||!nonempty(a.reason)||!Array.isArray(a.observationIds)||!a.observationIds.length||new Set(a.observationIds).size!==a.observationIds.length||a.observationIds.some(id=>!observations.has(id)||observations.get(id).section!=='bestiary'))throw Error('Invalid explicit name candidate');
  aliases.set(a.cardUrl,a);
 }
 const records=rows.map(row=>{
  const exact=[...observations.values()].filter(r=>r.section==='bestiary'&&r.names?.en===row.digitalName);
  const explicit=aliases.get(row.cardUrl);const candidates=new Map(exact.map(r=>[r.id,{r,match:'exact-name'}]));
  for(const id of explicit?.observationIds||[]){if(candidates.has(id))throw Error('Redundant explicit alias');candidates.set(id,{r:observations.get(id),match:'explicit-name-candidate',reason:explicit.reason});}
  return {...row,...(index.allowBlankChallengeRatings===true?{challengeRatingStatus:row.challengeRating===''?'not-shown':'shown'}:{}),scopeKind:row.displayedSource===index.title?'displayed-own-source':'displayed-reference-source',observationCandidates:[...candidates.values()].map(({r,match,reason})=>({observationId:r.id,observedName:r.names.en,originalSourceIds:[...r.sourceIds],match,...(reason?{reason}:{})})),status:!candidates.size?'no-observed-name-needs-review':candidates.size>1?'multiple-observed-names-need-version-review':'name-candidate-needs-identity-review',canonicalId:null,accepted:false,fullRules:'unverified',exactTextVersion:'unverified',automaticSourceReplacement:false};
 });
 const target=[...observations.values()].filter(r=>r.section==='bestiary'&&r.sourceIds.includes(index.observedSourceId));
 const covered=new Set(records.flatMap(r=>r.observationCandidates.map(c=>c.observationId)));
 return {schemaVersion:1,status:'public-index-candidates-not-missing-runtime-records',sourceId:index.observedSourceId,accepted:false,complete:false,approvedDenominator:null,summary:{digitalRows:rows.length,...(index.allowBlankChallengeRatings===true?{blankChallengeRatingRows:blankCR}:{}),distinctDigitalNames:new Set(rows.map(r=>r.digitalName)).size,displayedOwnSourceRows:records.filter(r=>r.scopeKind==='displayed-own-source').length,displayedReferenceRows:records.filter(r=>r.scopeKind==='displayed-reference-source').length,rowsWithoutObservedName:records.filter(r=>!r.observationCandidates.length).length,originalSourceBestiaryObservations:target.length,originalSourceBestiaryWithNameCandidate:target.filter(r=>covered.has(r.id)).length},originalSourceBestiaryWithoutNameCandidate:target.filter(r=>!covered.has(r.id)).map(r=>r.id),records};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const paths=['catalog/infernal-machine-public-index-2014.json','catalog/scope-register-2014.json'];
 const raw=paths.map(p=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(readFileSync(new URL('../'+p,import.meta.url))).replace(/\r\n/g,'\n'));
 const data=raw.map(JSON.parse);if(data[0].inputSha256[paths[1]]!==createHash('sha256').update(raw[1]).digest('hex'))throw Error('Pinned scope changed');
 const result=reviewPrimaryIndex(...data);result.inputSha256=Object.fromEntries(paths.map((p,i)=>[p,createHash('sha256').update(raw[i]).digest('hex')]));
 writeFileSync(process.argv[2]||new URL('../catalog/infernal-machine-index-review-2014.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.summary));
}
