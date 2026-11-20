import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
import {decode} from './catalog-additional-discovery.mjs';import {pageIdentity} from './catalog-scope-register.mjs';
import {resolveSources} from './catalog-class-headings.mjs';
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/gs)].map(m=>[m[1],decode(m[3])]));
const clean=s=>decode(s.replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/g,'').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();const sha=s=>createHash('sha256').update(s).digest('hex');
const labels={'Класс Доспеха':'armorClass','Хиты':'hitPoints','Скорость':'speed','Спасброски':'savingThrows','Навыки':'skills','Сопротивление урону':'damageResistances','Иммунитет к урону':'damageImmunities','Иммунитет к состоянию':'conditionImmunities','Чувства':'senses','Языки':'languages','Опасность':'challenge','Бонус мастерства':'proficiencyBonus','Местность обитания':'habitat'};

export function outerListItems(html){
 const rows=[];let depth=0,start=null,openEnd=null,attributes=null;
 for(const m of html.matchAll(/<\/?li\b[^>]*>/g)){
  if(m[0].startsWith('</')){if(depth<=0)throw Error('Unbalanced creature list');depth--;if(depth===0){rows.push([html.slice(start,m.index+m[0].length),attributes,html.slice(openEnd,m.index)]);start=null;}}
  else{if(depth===0){start=m.index;openEnd=m.index+m[0].length;attributes=m[0].slice(3,-1);}depth++;}
 }
 if(depth!==0)throw Error('Unclosed creature list');return rows;
}
// Editorial notes are retained in the evidence hash, but are not creature abilities.
function withoutEditorialInfo(fragment){
 let result='',cursor=0,depth=0;
 for(const tag of fragment.matchAll(/<\/?div\b[^>]*>/g)){
  const closing=tag[0].startsWith('</');
  if(!closing){
   if(depth>0)depth++;
   else if(attrs(tag[0]).class?.split(/\s+/).includes('additionalInfo')){result+=fragment.slice(cursor,tag.index);depth=1;}
  }else if(depth>0){depth--;if(depth===0)cursor=tag.index+tag[0].length;}
 }
 if(depth!==0)throw Error('Unclosed editorial block');
 return result+fragment.slice(cursor);
}

export function companionStatblock(html,{pageId,sources}){
 if(!/^dndsu:bestiary:\d+$/.test(pageId))throw Error('Unexpected creature page ID');
 html=html.replace(/<!--[\s\S]*?-->/g,'');const start=html.indexOf('class="card__body new-article"'),end=html.indexOf('<div class="card__footer"',start);if(start<0||end<start)throw Error('Missing creature article');
 const prefix=html.slice(0,start),cards=[...prefix.matchAll(/<div\b[^>]*\bdata-id\s*=\s*(["'])(bestiary:\d+)\1[^>]*>/g)];if(cards.at(-1)?.[2]!=='bestiary:'+pageId.split(':').at(-1))throw Error('Unexpected creature card identity');
 const header=prefix.slice(cards.at(-1).index),name=attrs(header.match(/<span\b[^>]*data-copy=[^>]*>/)?.[0]||'')['data-copy'];if(!name)throw Error('Missing creature name');
 const titles=[...header.matchAll(/<span\b([^>]*)>/g)].map(m=>attrs(m[1])).filter(a=>a.class?.split(' ').includes('source-plaque')).map(a=>a.title);if(!titles.length||titles.some(t=>!t))throw Error('Missing creature source plaques');const sourceResolution=resolveSources(titles,sources);if(sourceResolution.some(s=>s.status!=='source-identified'))throw Error('Unresolved creature source');const sourceIds=[...new Set(sourceResolution.flatMap(s=>s.sourceIds))];if(sourceIds.some(id=>sources.find(s=>s.sourceId===id)?.group==='Homebrew'))throw Error('Excluded creature source');
 const body=html.slice(start,end),rows=outerListItems(body),fields={},abilities=[],unknownFields=[];let sizeType=null;
 for(const row of rows){const a=attrs(row[1]);if(a.class?.split(' ').includes('subsection'))continue;
  if(a.class==='size-type-alignment'){sizeType=clean(row[2]);continue;}
  if(a.class==='abilities'){const matches=[...row[2].matchAll(/<div\b[^>]*class=['"]stat['"][^>]*>/g)];for(let i=0;i<matches.length;i++){const m=matches[i],attribute=attrs(m[0]),chunk=row[2].slice(m.index+m[0].length,matches[i+1]?.index),value=clean(chunk).match(/(\d+)\s*\(\s*([+−-]?\d+)\s*\)/);if(!value)throw Error('Unknown creature ability shape');const score=Number(value[1]),modifier=Number(value[2].replace('−','-'));if(Math.floor((score-10)/2)!==modifier)throw Error('Creature ability modifier mismatch');abilities.push({name:attribute.title,score,modifier});}continue;}
  const label=row[2].match(/^\s*<strong\b[^>]*>([\s\S]*?)<\/strong>/);if(!label){if(clean(row[2]))unknownFields.push({label:null});continue;}const labelText=clean(label[1]),inlineBonus=labelText.match(/^Бонус мастерства\s+([+−-]\d+)$/),key=inlineBonus?'proficiencyBonus':labels[labelText];if(!key){unknownFields.push({label:clean(label[1])});continue;}if(key in fields)throw Error('Duplicate creature field');const raw=inlineBonus?inlineBonus[1]:clean(row[2].slice(label[0].length));if(!raw)throw Error('Empty creature field');fields[key]={raw,interpretation:'not-evaluated'};
 }
 if(!sizeType||!fields.armorClass||!fields.hitPoints||!fields.speed||abilities.length!==6||new Set(abilities.map(a=>a.name)).size!==6||abilities.some(a=>!['Сила','Ловкость','Телосложение','Интеллект','Мудрость','Харизма'].includes(a.name)))throw Error('Incomplete creature statblock');
 const sections=rows.filter(r=>attrs(r[1]).class?.split(' ').includes('subsection')).map(r=>{
  const rules=withoutEditorialInfo(r[2]);
  const heading=clean(rules.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/)?.[1]||'traits');
  const names=[...rules.matchAll(/<p\b[^>]*>\s*(?:<em\b[^>]*>\s*)?<strong\b[^>]*>([\s\S]*?)<\/strong>/g)].map(m=>clean(m[1]).replace(/[.]+$/,'').trim());
  const kind=heading==='Описание'?'narrative':heading==='Полтергейст'?'variant-statblock':['traits','Действия','Реакции','Бонусные действия','Легендарные действия'].includes(heading)?'base-statblock':'unclassified-section';
  return {heading,kind,names:names.filter(Boolean),emptyNameMarkers:names.filter(n=>!n).length,evidenceTextSha256:sha(clean(r[2]))};
 });
 return {pageId,name,sourceIds,sourceResolution,sizeType,fields,abilities,sections,unknownFields,fullRules:'unverified',formulaEvaluation:'not-implemented',automation:'not-applied',approval:'awaiting-independent-review'};
}

export function validateCreatureEvidence(record){
 if(pageIdentity(record.requestedUrl).id!==record.pageId||pageIdentity(record.finalUrl).id!==record.pageId||pageIdentity(record.requestedUrl).homebrew||pageIdentity(record.finalUrl).homebrew)throw Error('Evidence URL identity mismatch');
 if(!Array.isArray(record.redirects)||record.redirects.length>2)throw Error('Invalid evidence redirect chain');let current=record.requestedUrl;const visited=new Set([current]);
 for(const hop of record.redirects){if(hop.from!==current||![301,302,303,307,308].includes(hop.status)||pageIdentity(hop.to).id!==record.pageId||pageIdentity(hop.to).homebrew||visited.has(hop.to))throw Error('Invalid evidence redirect hop');visited.add(hop.to);current=hop.to;}
 if(current!==record.finalUrl)throw Error('Incomplete evidence redirect chain');
}
export function buildCompanionStatblocks(directory){const read=f=>JSON.parse(readFileSync(new URL('../catalog/'+f,import.meta.url))),sources=read('dndsu-source-register.json').sources,manifest=JSON.parse(readFileSync(directory+'/fetch-manifest.json')),expected=new Set(read('dndsu-companion-discovery.json').records.flatMap(r=>r.references.map(x=>x.pageId)));if(manifest.results.length!==expected.size||new Set(manifest.results.map(r=>r.pageId)).size!==expected.size)throw Error('Incomplete companion fetch manifest');const records=manifest.results.map(r=>{if(!expected.has(r.pageId)||r.file!==r.pageId.replaceAll(':','-')+'.html')throw Error('Unexpected evidence filename');validateCreatureEvidence(r);const bytes=readFileSync(directory+'/'+r.file);if(sha(bytes)!==r.rawSha256)throw Error('Changed companion evidence bytes');return {...companionStatblock(bytes.toString('utf8'),{pageId:r.pageId,sources}),requestedUrl:r.requestedUrl,finalUrl:r.finalUrl,redirects:r.redirects,rawSha256:r.rawSha256};});return {schemaVersion:1,observedOn:manifest.observedOn,status:'partial-companion-statblock-metadata',records};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [,,directory,output]=process.argv;if(!directory||!output)throw Error('Usage: evidence-directory output.json');const result=buildCompanionStatblocks(directory);writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(result.records.map(r=>({id:r.pageId,name:r.name,unknown:r.unknownFields,sources:r.sourceIds,hp:r.fields.hitPoints.raw,ac:r.fields.armorClass.raw})));}
