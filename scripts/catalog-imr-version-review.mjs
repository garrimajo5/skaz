import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const labels={'111':"Volo's Guide to Monsters",'113':'Mordenkainen’s Tome of Foes','158':'Mordenkainen Presents: Monsters of the Multiverse'};
const names=new Set(['Adult Oblex','Boggle','Eidolon','Girallon','Redcap','Trapper','Warlord','Warlock of the Fiend','Warlock of the Great Old One']);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function unique(rows,key){const m=new Map();for(const row of rows){if(m.has(row[key]))throw Error('Repeated '+key);m.set(row[key],row);}return m;}
export function reviewImrVersions(manifest,index,scope){
 if(manifest.rulesEdition!=='5e-2014'||manifest.accepted!==false||manifest.complete!==false||manifest.automaticPatch!==false||manifest.approvedDenominator!==null||!equal(manifest.sourceLabels,labels))throw Error('Evidence boundary changed');
 const originals=unique(scope.records,'id'),cards=unique(index.pages.flatMap(p=>p.rows),'cardUrl');
 const observations=unique(manifest.observations,'observationId'),groups=new Map();
 for(const o of observations.values()){
  const original=originals.get(o.observationId);
  if(!original||original.section!=='bestiary'||original.names.en!==o.observedName||original.url!==o.originalUrl||!equal(original.sourceIds,o.sourceIds)||o.sourceIds.length!==1||!labels[o.sourceIds[0]]||!names.has(o.observedName))throw Error('Observation identity/source changed');
  const expectedRead=o.sourceIds[0]==='158'?o.originalUrl.replace('/bestiary/','/multiverse/bestiary/'):o.originalUrl;
  if(o.readUrl!==expectedRead||o.evidenceKind!=='secondary-observation'||o.primaryFullRulesRead!==false||o.fullStatBlockCompared!==false||o.automaticPatch!==false)throw Error('Secondary evidence promoted');
  const f=o.selectedFields,keys=['armorClass','hitPoints','challengeRating','passivePerception','walkingSpeedFeet'];
  const warlock=o.observedName.startsWith('Warlock of ');if(warlock)keys.push('armorClassWithMageArmor');
  if(!equal(Object.keys(f).sort(),keys.sort())||typeof f.challengeRating!=='string'||!/^\d+(?:\/[1-9]\d*)?$/.test(f.challengeRating))throw Error('Missing or invalid selected fields');
  for(const key of keys.filter(k=>k!=='challengeRating'))if(!Number.isSafeInteger(f[key])||f[key]<0||(key==='hitPoints'&&f[key]===0))throw Error('Invalid numeric field');
  if(warlock&&f.armorClassWithMageArmor<f.armorClass)throw Error('Invalid conditional armor class');
  if(!groups.has(o.observedName))groups.set(o.observedName,[]);groups.get(o.observedName).push(o);
 }
 if(groups.size!==9||observations.size!==18)throw Error('Incomplete selected group set');
 const groupRows=[...groups].map(([name,members])=>{
  const expected=name==='Adult Oblex'||name==='Eidolon'?['113','158']:['111','158'];
  if(members.length!==2||!equal(members.map(o=>o.sourceIds[0]).sort(),expected))throw Error('Missing distinct source versions');
  const fields=Object.keys(members[0].selectedFields);const differingFields=fields.filter(k=>!equal(members[0].selectedFields[k],members[1].selectedFields[k]));
  return {name,members:members.map(o=>structuredClone(o)),differingFields,identityDecision:'unresolved',canonicalId:null,automaticMerge:false,fullRulesVerified:false};
 });
 const expectedCards=[...cards.values()].filter(c=>names.has(c.digitalName));
 const selected=unique(manifest.primaryRows,'cardUrl');
 if(selected.size!==11||expectedCards.length!==11||expectedCards.some(c=>!selected.has(c.cardUrl)))throw Error('Incomplete primary selected rows');
 const rows=[...selected.values()].map(row=>{
  const card=cards.get(row.cardUrl),sourceId=Object.keys(labels).find(k=>labels[k]===row.displayedSource);
  if(!card||card.digitalName!==row.digitalName||card.displayedSource!==row.displayedSource||!sourceId||row.canonicalId!==null||row.automaticMerge!==false||row.access.fullTextRead!==false)throw Error('Primary identity changed');
  const multi=sourceId==='158';
  if(row.access.result!==(multi?'redirect-to-marketplace':'redirect-to-legacy')||row.access.destination!==(multi?'https://marketplace.dndbeyond.com/category/mordenkainen-presents-monsters-of-the-multiverse':'https://www.dndbeyond.com/legacy'))throw Error('Access observation changed');
  const candidates=groups.get(row.digitalName).map(o=>({observationId:o.observationId,sourceIds:[...o.sourceIds],relation:o.sourceIds.includes(sourceId)?'source-label-compatible-candidate':'different-declared-source-version'}));
  return {...structuredClone(row),candidates,identityDecision:'unresolved',primaryFullRulesRead:false};
 });
 return {schemaVersion:1,status:'source-version-candidates-not-canonical-mapping',accepted:false,complete:false,approvedDenominator:null,automaticPatch:false,summary:{selectedPrimaryRows:rows.length,distinctNames:groups.size,secondaryObservations:observations.size,selectedSecondaryFields:[...observations.values()].reduce((n,o)=>n+Object.keys(o.selectedFields).length,0),groupsWithSelectedDifferences:groupRows.filter(r=>r.differingFields.length).length,sourceCompatibleCandidateLinks:rows.flatMap(r=>r.candidates).filter(c=>c.relation==='source-label-compatible-candidate').length,primaryFullStatBlocksRead:0},rows,groups:groupRows};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const paths=['catalog/imr-version-boundaries-2014.json','catalog/infernal-machine-public-index-2014.json','catalog/scope-register-2014.json'];
 const raw=paths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n')),data=raw.map(JSON.parse);
 for(let i=1;i<paths.length;i++)if(data[0].inputSha256[paths[i]]!==createHash('sha256').update(raw[i]).digest('hex'))throw Error('Pinned input changed');
 const report=reviewImrVersions(...data);report.inputSha256=Object.fromEntries(paths.map((p,i)=>[p,createHash('sha256').update(raw[i]).digest('hex')]));
 writeFileSync(process.argv[2]||new URL('../catalog/imr-version-review-2014.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));
}
