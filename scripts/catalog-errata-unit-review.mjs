import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const individual=new Set(['named-stat-block','named-stat-block-variant']);
const other=new Set(['lore-correction','template-and-example-correction','player-template-rule','stat-block-family']);
export function reviewErrataUnits(inventory,scope){
 if(inventory.accepted!==false||inventory.completeBookInventory!==false||inventory.approvedDenominator!==null||inventory.sourceId!=='103'||inventory.rulesEdition!=='5e-2014')throw Error('Unsupported source acceptance');
 const all=new Map(scope.records.map(r=>[r.id,r])),seen=new Set();
 const aliases=new Map();
 for(const a of inventory.explicitNameCandidates){
  const r=all.get(a.observationId);
  if(!r||r.section!=='bestiary'||!r.sourceIds.includes(inventory.sourceId)||r.names.en!==a.observedName||aliases.has(a.primaryName)||!a.reason)throw Error('Invalid explicit candidate');
  aliases.set(a.primaryName,a);
 }
 const records=inventory.records.map(unit=>{
  if(seen.has(unit.primaryName)||unit.accepted!==false||(!individual.has(unit.unitKind)&&!other.has(unit.unitKind)))throw Error('Invalid correction unit');
  seen.add(unit.primaryName);
  const alias=aliases.get(unit.primaryName);
  if(alias&&!individual.has(unit.unitKind))throw Error('Cannot alias a family/lore unit to one creature');
  const candidates=individual.has(unit.unitKind)?scope.records.filter(r=>r.section==='bestiary'&&r.sourceIds.includes(inventory.sourceId)&&(r.names.en.toLowerCase()===unit.primaryName.toLowerCase()||alias?.observationId===r.id)).map(r=>({observationId:r.id,observedName:r.names.en,sourceIds:[...r.sourceIds],match:alias?.observationId===r.id?'explicit-name-candidate':'case-insensitive-name-candidate'})):[];
  return {...unit,observationCandidates:candidates,fullRulesVerified:false,canonicalId:null,automaticMerge:false};
 });
 if([...aliases.keys()].some(name=>!seen.has(name)))throw Error('Orphan explicit candidate');
 const summary={correctionHeadings:records.length,namedStatBlockHeadings:records.filter(r=>r.unitKind==='named-stat-block').length,namedVariantHeadings:records.filter(r=>r.unitKind==='named-stat-block-variant').length,nonIndividualUnits:records.filter(r=>other.has(r.unitKind)).length};
 for(const k of Object.keys(summary))if(inventory.summary[k]!==summary[k])throw Error('Unit counts changed');
 return {schemaVersion:1,status:'errata-unit-name-candidates-not-full-book-coverage',accepted:false,approvedDenominator:null,summary:{...summary,individualUnitsWithOneCandidate:records.filter(r=>individual.has(r.unitKind)&&r.observationCandidates.length===1).length,individualUnitsNeedingNameReview:records.filter(r=>individual.has(r.unitKind)&&r.observationCandidates.length!==1).length},records};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const paths=['catalog/mm-errata-unit-inventory-2014.json','catalog/scope-register-2014.json'];
 const raw=paths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n'));const data=raw.map(JSON.parse);
 if(data[0].inputSha256[paths[1]]!==createHash('sha256').update(raw[1]).digest('hex'))throw Error('Pinned scope changed');
 const report=reviewErrataUnits(...data);report.inputSha256=Object.fromEntries(paths.map((p,i)=>[p,createHash('sha256').update(raw[i]).digest('hex')]));
 writeFileSync(process.argv[2]||new URL('../catalog/mm-errata-unit-review-2014.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));
}
