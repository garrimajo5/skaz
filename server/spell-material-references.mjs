import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {AppError} from './state.mjs';
// Independently reviewed subset. Never merged into stored/exported catalog entries.
export const reviewedMaterialSetSha256='16f691e189b6fad283d043960fe4ace458950198672cfca2c0b86132a92dd8c6';
export function readReviewedMaterialSet(text){
 try{const normalized=text.replaceAll('\r\n','\n');if(createHash('sha256').update(normalized).digest('hex')!==reviewedMaterialSetSha256)return null;return JSON.parse(normalized);}catch{return null;}
}
export function loadReviewedMaterialSet(read=readFileSync){
 try{return readReviewedMaterialSet(read(new URL('../catalog/spell-materials.proposal.json',import.meta.url),'utf8'));}catch{return null;}
}
const proposal=loadReviewedMaterialSet();
const references=new Map((proposal?.entries||[]).map(row=>[row.id,row]));
const hash=entry=>createHash('sha256').update(JSON.stringify(entry)).digest('hex');
export function spellMaterialReferences(entries){
 const result=[];
 for(const entry of entries){
  const row=references.get(entry?.id);
  if(!row||entry.kind!=='spell'||entry.ruleset!=='5e-2014'||!entry.spell?.components?.includes('M')||hash(entry)!==row.entrySha256)continue;
  result.push({catalogId:row.id,entrySha256:row.entrySha256,materials:structuredClone(row.materials),source:{url:proposal.source.url+'#page='+row.sourcePages[0],title:'System Reference Document 5.1',ruleset:'5e-2014',pages:[...row.sourcePages],sha256:proposal.source.sha256,bodySha256:row.sourceBodySha256,materialRulePage:proposal.source.materialRulePage,license:proposal.source.license,attribution:proposal.source.attribution,changes:proposal.source.changes},checkedOn:row.checkedOn});
 }
 return result;
}
export function catalogWithMaterialReferences(catalog,params,{lookup=false}={}){
 const query=new URLSearchParams(params),include=query.has('includeMaterials');
 if(include&&(query.getAll('includeMaterials').length!==1||query.get('includeMaterials')!=='1'))throw new AppError(400,'includeMaterials должен быть единственным значением 1');
 query.delete('includeMaterials');
 // Authorization/visibility filtering and input validation run before enrichment.
 const result=lookup?catalog.lookup(query):catalog.search(query);
 if(!include)return result;
 return {...result,materialReferences:spellMaterialReferences(lookup?[result.entry]:result.entries)};
}
