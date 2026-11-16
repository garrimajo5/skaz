import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
const sections=['spells','bestiary','items'];
export function pageIdentity(url){
 const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='dnd.su'||u.search||u.hash)throw Error('Unexpected reference URL');
 const m=u.pathname.match(/^\/(homebrew\/)?(spells|bestiary|items|class)\/(\d+)-[a-z0-9_-]+\/$/);if(!m)throw Error('Unsupported reference path');
 return {id:'dndsu:'+m[2]+':'+m[3],section:m[2],homebrew:!!m[1]};
}
export function buildRegister({index,sources,classIndex,entries,acceptedArt=[]}){
 const sourceMap=new Map();for(const s of sources.sources){if(sourceMap.has(s.sourceId))throw Error('Duplicate source');sourceMap.set(s.sourceId,s);}
 const local=new Map(entries.map(e=>[e.id,e]));if(local.size!==entries.length)throw Error('Duplicate catalog ID');
 const art=new Set(acceptedArt),seen=new Set(),records=[];
 function add(row,section,extra={}){
  const identity=pageIdentity(row.url);if(identity.section!==(section==='classes'?'class':section))throw Error('Section mismatch');
  if(seen.has(identity.id))throw Error('Duplicate page identity');seen.add(identity.id);
  const ids=[...(row.candidateIds||[])];if(new Set(ids).size!==ids.length||ids.some(id=>!local.has(id)))throw Error('Unknown or duplicate candidate ID');
  const sourceIds=row.sources||[];const unresolvedSources=sourceIds.filter(id=>!sourceMap.has(id));
  const homebrew=identity.homebrew||extra.group==='excluded-homebrew';
  const inclusion=homebrew?'excluded-homebrew':unresolvedSources.length||!sourceIds.length?'needs-source-review':'candidate-2014';
  records.push({id:identity.id,section,url:row.url,names:{ru:row.ru,en:row.en},sourceIds,...extra,inclusion,...(unresolvedSources.length?{unresolvedSources}:{}),candidateIds:ids,match:row.status||'not-compared',coverage:{record:ids.length?'candidate-present':'not-matched',fullRules:'unverified',metadata:row.fields?'partial-snapshot-fields':'unverified',automation:'not-audited',art:ids.length?ids.every(id=>art.has(id))?'accepted-for-local-candidates':'not-covered-for-all-candidates':'not-applicable-before-match'},reusePermission:'not-established-for-reference-text'});
 }
 for(const section of sections){if(!index.sections[section]?.rows?.length)throw Error('Missing section '+section);for(const row of index.sections[section].rows)add(row,section);}
 for(const row of classIndex.rows){const source=sources.sources.find(s=>s.title===row.sourceTitle);add({...row,sources:source?[source.sourceId]:[]},'classes',{group:row.group,sourceTitle:row.sourceTitle});}
 records.sort((a,b)=>a.id.localeCompare(b.id,'en'));
 const summary={observedPages:records.length,bySection:{},inclusion:{},candidateMatchedPages:0,fullRulesVerified:0,complete:false,approvedDenominator:null};
 for(const r of records){summary.bySection[r.section]=(summary.bySection[r.section]||0)+1;summary.inclusion[r.inclusion]=(summary.inclusion[r.inclusion]||0)+1;if(r.candidateIds.length)summary.candidateMatchedPages++;}
 return {schemaVersion:1,rulesetTarget:'5e-2014',status:'discovery-not-approved-full-catalog',inputs:{referenceSnapshotDate:'2026-11-15',sourceMetadataDate:sources.observedOn,classIndexDate:classIndex.observedOn},summary,unindexedScopes:['subclasses-and-features','races-and-origins','backgrounds','feats','ordinary-equipment','mechanics','bestiary-classic-variant'],records,localCatalog:entries.map(e=>({id:e.id,kind:e.kind,sourceUrl:e.source.url,usage:e.source.usage,fullRules:'not-certified-by-this-register',art:art.has(e.id)?'accepted':'not-in-accepted-art-manifest'})).sort((a,b)=>a.id.localeCompare(b.id,'en'))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
 const inputPaths=['catalog/dndsu-rule-index-2026-11-15.json','catalog/dndsu-source-register.json','catalog/dndsu-class-discovery.json','catalog/art-coverage.json'];
 const [index,sources,classIndex,art]=inputPaths.map(read),{bundle}=bundledCatalog();const output=buildRegister({index,sources,classIndex,entries:bundle.entries,acceptedArt:art.statuses.accepted});
 output.inputSha256=Object.fromEntries(inputPaths.map(p=>[p,createHash('sha256').update(readFileSync(new URL('../'+p,import.meta.url))).digest('hex')]));
 output.catalogSha256=createHash('sha256').update(JSON.stringify(bundle)).digest('hex');
 writeFileSync(process.argv[2]||new URL('../catalog/scope-register-2014.json',import.meta.url),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output.summary));
}
