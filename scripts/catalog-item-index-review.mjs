import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export function reviewItemIndex(index,scope){
 if(index.accepted!==false||index.complete!==false||index.approvedDenominator!==null||index.fullRulesVerified!==false||index.publicIndexTraversalComplete!==true)throw Error('Invalid evidence boundary');
 if(index.pages.length!==2||index.pages[0].page!==1||index.pages[0].nextPage!==2||index.pages[1].page!==2||index.pages[1].nextPage!==null)throw Error('Incomplete page chain');
 const rows=index.pages.flatMap(p=>p.rows),urls=new Set();
 for(const r of rows){let u;try{u=new URL(r.cardUrl);}catch{throw Error('Invalid item URL');}if(u.origin!=='https://www.dndbeyond.com'||!/^\/magic-items\/\d+-[a-z0-9-]+$/.test(u.pathname)||u.search||u.hash||urls.has(r.cardUrl)||!r.digitalName||!r.rarityLabel||!r.typeLabel||!r.attunementLabel)throw Error('Invalid item row');urls.add(r.cardUrl);}
 if(rows.length!==index.digitalRowCount)throw Error('Row count changed');
 const byId=new Map();for(const r of scope.records){if(!r.id||byId.has(r.id)||!Array.isArray(r.sourceIds))throw Error('Invalid observation');byId.set(r.id,r);}
 const families=new Map();for(const f of index.familyCandidates||[]){if(!urls.has(f.cardUrl)||families.has(f.cardUrl)||byId.get(f.parentObservationId)?.section!=='items'||!f.reason)throw Error('Invalid family candidate');families.set(f.cardUrl,f);}
 const aliases=new Map();for(const a of index.explicitNameCandidates||[]){if(!urls.has(a.cardUrl)||aliases.has(a.cardUrl)||byId.get(a.observationId)?.section!=='items'||!a.reason)throw Error('Invalid explicit name candidate');aliases.set(a.cardUrl,a);}
 const records=rows.map(row=>{
  const exact=scope.records.filter(r=>r.section==='items'&&r.names?.en===row.digitalName);
  const f=families.get(row.cardUrl);if(f&&exact.some(r=>r.id===f.parentObservationId))throw Error('Family cannot equal exact card');
  const candidates=exact.map(r=>({observationId:r.id,observedName:r.names.en,originalSourceIds:[...r.sourceIds],relation:'exact-name-candidate'}));
  const a=aliases.get(row.cardUrl);if(a){if(candidates.some(c=>c.observationId===a.observationId)||f?.parentObservationId===a.observationId)throw Error('Redundant explicit name');const r=byId.get(a.observationId);candidates.push({observationId:r.id,observedName:r.names.en,originalSourceIds:[...r.sourceIds],relation:'explicit-name-candidate',reason:a.reason});}
  if(f){const r=byId.get(f.parentObservationId);candidates.push({observationId:r.id,observedName:r.names.en,originalSourceIds:[...r.sourceIds],relation:'variant-of-observed-family-candidate',reason:f.reason});}
  return {...row,observationCandidates:candidates,status:candidates.length?'name-or-family-candidate-needs-review':'no-observed-name-needs-review',canonicalId:null,accepted:false,fullRules:'unverified',automaticMerge:false,automaticAttunementRule:false};
 });
 const target=scope.records.filter(r=>r.section==='items'&&r.sourceIds.includes(index.sourceId));const linked=new Set(records.flatMap(r=>r.observationCandidates.map(c=>c.observationId)));
 return {schemaVersion:1,status:'item-index-family-candidates-not-runtime-gaps',sourceId:index.sourceId,accepted:false,complete:false,approvedDenominator:null,summary:{digitalRows:rows.length,exactNameRows:records.filter(r=>r.observationCandidates.some(c=>c.relation==='exact-name-candidate')).length,familyCandidateRows:families.size,explicitNameCandidateRows:aliases.size,rowsWithoutObservedName:records.filter(r=>!r.observationCandidates.length).length,originalSourceItemObservations:target.length,originalSourceItemWithCandidate:target.filter(r=>linked.has(r.id)).length},records};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const paths=['catalog/infernal-machine-item-index-2014.json','catalog/scope-register-2014.json'];const raw=paths.map(p=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(readFileSync(new URL('../'+p,import.meta.url))).replace(/\r\n/g,'\n'));
 const data=raw.map(JSON.parse);if(data[0].inputSha256[paths[1]]!==createHash('sha256').update(raw[1]).digest('hex'))throw Error('Pinned scope changed');
 const result=reviewItemIndex(...data);result.inputSha256=Object.fromEntries(paths.map((p,i)=>[p,createHash('sha256').update(raw[i]).digest('hex')]));writeFileSync(process.argv[2]||new URL('../catalog/infernal-machine-item-review-2014.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.summary));
}
