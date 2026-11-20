import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
export const proposalFiles=['race-version-unit-proposals-2014','race-other-version-proposals-2014','monster-version-unit-proposals-2014','mtf-monster-version-unit-proposals-2014','multibook-monster-unit-proposals-2014','remaining-bestiary-attribution-proposals-2014','item-publication-attribution-proposals-2014'].map(n=>'catalog/'+n+'.json');
export const overlayFiles=['catalog/genasi-granularity-proposals-2014.json','catalog/bestiary-spelling-alias-proposals-2014.json'];
export const inputFiles=['catalog/effective-m0-review-2014.json',...proposalFiles,...overlayFiles];
function unaccepted(value){
 if(!value||typeof value!=='object')return;
 for(const [key,v] of Object.entries(value)){
  if((['accepted','complete','automaticMerge','automaticCharacterMigration','automaticAlias'].includes(key)&&v===true)||(key==='canonicalId'&&v!=null)||(key==='approvedDenominator'&&v!=null))throw Error('Unexpected acceptance or automatic action');
  unaccepted(v);
 }
}
export function reviewD02Coverage(root,proposals,overlays){
 const target=new Map();
 for(const g of root.identityGroups.filter(g=>g.decision==='define-separate-source-version-units')){
  if(target.has(g.reviewId))throw Error('Duplicate root review ID');
  const ids=g.members.map(m=>m.id);if(new Set(ids).size!==ids.length)throw Error('Duplicate root observation');
  target.set(g.reviewId,g);
 }
 if(Object.keys(proposals).some(p=>!proposalFiles.includes(p))||Object.keys(overlays).some(p=>!overlayFiles.includes(p)))throw Error('Unknown report');
 const represented=new Map();
 function observations(g,units){
  const expected=new Map(g.members.map(m=>[m.id,m.sourceIds]));const seen=new Set();
  for(const u of units){
   const sources=u.sourceIds??u.observedSourceIds??(u.sourceId?[u.sourceId]:null);
   if(!expected.has(u.observationId)||seen.has(u.observationId)||JSON.stringify(sources)!==JSON.stringify(expected.get(u.observationId)))throw Error('Changed or duplicate observation attribution');
   seen.add(u.observationId);
  }
  if(seen.size!==expected.size)throw Error('Missing group observation');
 }
 for(const [path,report] of Object.entries(proposals)){
  unaccepted(report);
  for(const p of report.groups){
   const g=target.get(p.reviewId);
   if(!g)throw Error('Foreign or out-of-scope proposal group');
   if(represented.has(p.reviewId))throw Error('Duplicate proposal group');
   observations(g,p.observations??p.units);represented.set(p.reviewId,path);
  }
 }
 const supplemental=[];
 for(const [path,report] of Object.entries(overlays)){
  unaccepted(report);
  const groups=report.groups??[{reviewId:report.reviewId,units:report.families}];
  for(const p of groups){const g=target.get(p.reviewId);if(!g||!represented.has(p.reviewId))throw Error('Overlay without represented parent');observations(g,p.units);supplemental.push({path,reviewId:p.reviewId,additionalCanonicalUnits:0});}
 }
 const groups=[...target.values()].map(g=>({reviewId:g.reviewId,section:g.section,proposalPath:represented.get(g.reviewId)??null,observations:g.members.map(m=>({observationId:m.id,sourceIds:[...m.sourceIds]})),accepted:false,canonicalId:null}));
 return {schemaVersion:1,status:'structural-proposal-coverage-only',accepted:false,complete:false,approvedDenominator:null,
 summary:{targetGroups:target.size,representedGroups:represented.size,unrepresentedGroups:target.size-represented.size,preservedObservations:groups.reduce((s,g)=>s+g.observations.length,0),preservedSourceAttributions:groups.reduce((s,g)=>s+g.observations.reduce((n,o)=>n+o.sourceIds.length,0),0),supplementalParentReferences:supplemental.length,acceptedCanonicalUnits:0},
 groups,supplemental,limitations:['Structural representation does not accept identity, full rules, source versions, rights, aliases or canonical units.','Supplemental proposals reference existing groups and add zero accepted units.','Other root review decisions and runtime catalog coverage are outside D02; canonical denominator remains unset.']};
}
export function buildD02Coverage(){
 const raw=Object.fromEntries(inputFiles.map(p=>[p,readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n')]));
 const data=Object.fromEntries(Object.entries(raw).map(([p,s])=>[p,JSON.parse(s)]));
 const r=reviewD02Coverage(data[inputFiles[0]],Object.fromEntries(proposalFiles.map(p=>[p,data[p]])),Object.fromEntries(overlayFiles.map(p=>[p,data[p]])));
 r.inputSha256=Object.fromEntries(Object.entries(raw).map(([p,s])=>[p,createHash('sha256').update(s).digest('hex')]));return r;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const r=buildD02Coverage();writeFileSync(new URL('../catalog/d02-proposal-coverage-2014.json',import.meta.url),JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r.summary));
}
