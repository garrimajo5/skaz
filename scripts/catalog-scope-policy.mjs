import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const dispositions = new Map([
 ['publisher-experimental-supplement','excluded-experimental'],
 ['third-party-sourcebook','excluded-third-party'],
 ['author-described-unofficial-material','excluded-unofficial'],
 ['unresolved','needs-official-source-evidence'],
]);
export function applyScopePolicy(boundaries,bibliography){
 const sources=new Map();
 for(const source of bibliography.records){
  if(sources.has(source.id)||!dispositions.has(source.publicationKind))throw Error('Duplicate or unsupported bibliography source');
  sources.set(source.id,source);
 }
 const seen=new Set();
 const records=boundaries.pending.map(section=>{
  const key=section.classUrl+'#heading-'+section.headingOrdinal;
  if(seen.has(key)||!Number.isInteger(section.headingOrdinal)||section.headingOrdinal<0)throw Error('Duplicate or invalid section identity');
  seen.add(key);
  if(!section.bibliographyEvidenceIds?.length)throw Error('Missing section evidence');
  const evidence=section.bibliographyEvidenceIds.map(id=>{
   const source=sources.get(id);if(!source)throw Error('Unknown bibliography evidence');
   return {id,publicationKind:source.publicationKind,disposition:dispositions.get(source.publicationKind)};
  });
  if(new Set(evidence.map(e=>e.id)).size!==evidence.length)throw Error('Duplicate section evidence');
  const kinds=new Set(evidence.map(e=>e.disposition));
  const disposition=kinds.size===1?evidence[0].disposition:'needs-mixed-source-review';
  return {observation:structuredClone(section),disposition,evidence,included:false,exactTextVersion:'unverified',reusePermission:'not-established'};
 });
 const counts={};for(const row of records)counts[row.disposition]=(counts[row.disposition]||0)+1;
 return {schemaVersion:1,policy:{decisionDate:'2026-11-19',basis:'owner-official-wotc-2014-only',experimental:false,thirdParty:false,personalExceptions:'allowed-outside-common-catalog'},coverage:'twelve-explicit-source-sections-only-not-full-catalog',approvedDenominator:null,summary:{sections:records.length,byDisposition:counts},records};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const paths=['catalog/dndsu-class-scope-boundaries.json','catalog/class-source-bibliography.json'];
 const raw=paths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n'));
 const result=applyScopePolicy(...raw.map(s=>JSON.parse(s)));
 result.inputSha256=Object.fromEntries(paths.map((p,i)=>[p,createHash('sha256').update(raw[i]).digest('hex')]));
 writeFileSync(process.argv[2]||new URL('../catalog/class-scope-policy-2014.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result.summary));
}
