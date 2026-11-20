import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {catalogInputHash} from './verify-catalog-input-hashes.mjs';
const files=['catalog/effective-m0-review-2014.json','catalog/race-publication-identity-evidence-2014.json','catalog/numeric-source-scope-policy-2014.json','catalog/goliath-publication-reference-2014.json','catalog/vgm-mtf-selected-errata-2014.json'];
const output=new URL('../catalog/race-version-unit-proposals-2014.json',import.meta.url);
const publications={'111':"Volo's Guide to Monsters",'158':'Mordenkainen Presents: Monsters of the Multiverse'};

export function proposeRaceVersions(review,evidence,policy,goliath,errata) {
  if(evidence.schemaVersion!==1 || evidence.url!=='https://www.dndbeyond.com/species' || !/^[a-f0-9]{64}$/.test(evidence.htmlSha256) || evidence.faq?.url!=='https://www.dndbeyond.com/posts/1201-faq-for-mordenkainen-presents-monsters-of-the') throw Error('Unexpected primary identity evidence');
  for(const [sourceId,title] of Object.entries(publications)){
    const matches=policy.records.filter(record=>record.sourceId===sourceId);
    if(matches.length!==1 || matches[0].observedTitle?.toLowerCase()!==title.toLowerCase()) throw Error('Publication mapping changed');
  }
  const referenceAvailable=goliath!==null;
  if(referenceAvailable && (goliath.name!=='Goliath' || goliath.sourceId!=='111' || goliath.bookPage!==109 || goliath.pdfPage!==1 || goliath.anchor!=='Goliath Traits (p. 109)' || goliath.errataVersion!=='3.0' || goliath.url!==errata.sources.vgtm.url || goliath.sha256!==errata.sources.vgtm.sha256 || goliath.url!=='https://media.wizards.com/2021/dnd/downloads/VGtM-Errata.pdf')) throw Error('Unverified publication reference');
  const primary=new Map(), primaryUrls=new Set();
  for(const record of evidence.records){
    if(typeof record.name!=='string' || typeof record.publication!=='string' || !/^https:\/\/www\.dndbeyond\.com\/species\/[0-9]+-[a-z0-9-]+$/.test(record.url)) throw Error('Invalid primary identity');
    const key=record.name.trim().toLowerCase()+'|'+record.publication;
    if(primary.has(key) || primaryUrls.has(record.url)) throw Error('Ambiguous primary identity');
    primaryUrls.add(record.url);
    primary.set(key,record);
  }
  const groups=[], seen=new Set(), observations=new Set();
  for(const group of review.identityGroups){
    if(group.section!=='race' || group.decision!=='define-separate-source-version-units' || group.members.length!==2 || group.members.some(member=>member.sourceIds.length!==1) || group.members.map(member=>member.sourceIds[0]).sort().join(',')!=='111,158') continue;
    if(seen.has(group.reviewId)) throw Error('Duplicate review identity'); seen.add(group.reviewId);
    const units=[]; const missing=[];
    for(const member of group.members){
      if(member.section!=='race' || typeof member.id!=='string' || observations.has(member.id)) throw Error('Invalid or reused observation');
      observations.add(member.id);
      const sourceId=member.sourceIds[0], title=publications[sourceId];
      const name=member.observedName.trim().toLowerCase();
      if(name!==group.comparisonKey) throw Error('Observed identity changed');
      const indexMatch=primary.get(name+'|'+title);
      const fallback=referenceAvailable && name==='goliath' && sourceId==='111';
      const match=indexMatch ?? (fallback?{url:goliath.url+'#page=1'}:null);
      if(!match) missing.push({observationId:member.id,sourceId,reason:'no-exact-primary-name-and-publication-match',otherListedPublications:evidence.records.filter(record=>record.name.trim().toLowerCase()===name).map(record=>record.publication)});
      units.push({observationId:member.id,sourceId,primaryIdentityUrl:match?.url??null,
        identityEvidenceKind:indexMatch?'publisher-index':fallback?'publisher-errata-publication-reference':'missing',
        bookPage:fallback?109:null,
        proposedVersionKey:group.reviewId+':source:'+sourceId,exactErrataVersion:'unverified',
        fullRules:'unverified',translationReusePermission:'not-established'});
    }
    groups.push({reviewId:group.reviewId,name:group.comparisonKey,
      proposal:missing.length?'retain-unresolved-publication-attribution':'keep-separate-publication-versions',
      basis:missing.length?'A publisher listing for another book is not proof of this source attribution.':'Primary publication identities are evidenced by the publisher index or a precise errata reference; FAQ preserves old and new versions.',
      units, missingEvidence:missing,accepted:false,canonicalId:null,automaticMerge:false,automaticCharacterMigration:false});
  }
  const proposed=groups.filter(group=>!group.missingEvidence.length).length;
  return {schemaVersion:1,status:'version-unit-proposals-awaiting-independent-review',accepted:false,complete:false,approvedDenominator:null,
    summary:{consideredGroups:groups.length,proposedSeparateVersionGroups:proposed,unresolvedGroups:groups.length-proposed,
      preservedObservations:observations.size,proposedVersionUnits:proposed*2,acceptedCanonicalUnits:0},groups,
    limitations:['Only race groups with exactly one Volo and one MotM source are considered; no inference for other books, monsters or unlabelled subraces.',
      'Separate publisher identities are evidence for proposed version units, not verification of full rules or exact errata.',
      'The Goliath Volo publication is evidenced by errata page 109, not by substituting the index entry for Elemental Evil.',
      'Legacy is not a 2024 exclusion rule: the publisher also labels some MotM versions legacy after later updates.',
      'No source observation, current profile, runtime catalog, license status or accepted denominator is changed.']};
}
export function buildRaceVersionProposals(){
  const raw=files.map(file=>readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  return {...proposeRaceVersions(...raw.map(JSON.parse)),inputSha256:Object.fromEntries(files.map((file,i)=>[file,catalogInputHash(raw[i])]))};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.slice(2).some(arg=>arg!=='--write')) throw Error('Use --write only after input review');
  const report=buildRaceVersionProposals(),text=JSON.stringify(report,null,2)+'\n';
  if(process.argv.includes('--write')) writeFileSync(output,text);
  else if(readFileSync(output,'utf8').replace(/\r\n/g,'\n')!==text) throw Error('Stale version proposals');
  console.log(JSON.stringify(report.summary));
}
