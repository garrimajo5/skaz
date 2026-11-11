import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {bundledCatalog} from '../server/bundled-catalog.mjs';

export const normalizeName = value => value.normalize('NFKC').toLowerCase().replace(/[’']/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const decode = text => text.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi,s=>({ '&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>' }[s] ?? String.fromCodePoint(parseInt(s.slice(s[2].toLowerCase()==='x'?3:2,-1),s[2].toLowerCase()==='x'?16:10))));
export function jsonAssignment(text,name){
 const marker=new RegExp('(?:window\\.)?'+name+'\\s*=\\s*').exec(text);
 if(!marker)throw new Error('Missing JSON assignment: '+name);
 const start=marker.index+marker[0].length;
 if(text[start]!=='{')throw new Error('Expected JSON object');
 let depth=0,quoted=false,escaped=false;
 for(let i=start;i<text.length;i++){
  const c=text[i];
  if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}
  else if(c==='"')quoted=true;
  else if(c==='{')depth++;
  else if(c==='}'&&!--depth)return JSON.parse(text.slice(start,i+1));
 }
 throw new Error('Truncated JSON assignment');
}
export function parseIndex(text,section){
 let rows;
 if(section==='spells'){
  const list=jsonAssignment(text,'LIST');
  if(list.category!=='spells'||!Array.isArray(list.cards))throw new Error('Unexpected spell index');
  rows=list.cards.map(c=>({ru:c.title,en:c.title_en,url:c.link,sources:c.filter_source}));
 }else{
  if(!['items','bestiary'].includes(section))throw new Error('Unsupported section');
  const filters=jsonAssignment(text,'filterItems');
  rows=[...text.matchAll(/<div\b[^>]*\bdata-search=(['"])(.*?)\1\s+data-id=(['"])(\d+)\3[^>]*>\s*<a\b[^>]*href=(['"])(.*?)\5/gs)].map(m=>{
   const names=decode(m[2]).replace(/,+$/,'').split(',');
   // Localized names may contain commas; English portion starts with a Latin letter.
   const split=names.findIndex((n,i)=>i>0&&/[A-Za-z]/.test(n));
   if(split<1)throw new Error('Cannot separate bilingual names: '+m[4]);
   const metadata=filters[m[4]];
   if(!metadata||!Array.isArray(metadata.source))throw new Error('Missing source metadata: '+m[4]);
   return {ru:names.slice(0,split).join(',').trim(),en:names.slice(split).join(',').split(/,(?=\s*[А-Яа-яЁё])/)[0].trim(),url:decode(m[6]),sources:metadata.source};
  });
  if(rows.length!==Object.keys(filters).length)throw new Error('Index/filter cardinality differs: '+rows.length+'/'+Object.keys(filters).length);
 }
 if(!rows.length)throw new Error('Empty index');
 const seen=new Set();
 for(const r of rows){if(!r.ru||!r.en||!new RegExp('^/'+section+'/[0-9]+-[a-z0-9_-]+/$').test(r.url)||seen.has(r.url)||!Array.isArray(r.sources))throw new Error('Invalid or duplicate index row: '+r.url);seen.add(r.url);r.url='https://dnd.su'+r.url;r.sources=r.sources.map(String);}
 return rows;
}
export function compareNames(rows,entries,aliases=[]){
 const byName=new Map();
 for(const e of entries){const key=normalizeName(e.name.en);byName.set(key,[...(byName.get(key)||[]),e.id]);}
 const ids=new Set(entries.map(e=>e.id));
 const mappings=new Map();
 for(const a of aliases){if(mappings.has(a.url)||!a.reason||!a.ids.length||new Set(a.ids).size!==a.ids.length||a.ids.some(id=>!ids.has(id))||!rows.some(r=>r.url===a.url))throw new Error('Invalid alias: '+a.url);mappings.set(a.url,a);}
 return rows.map(r=>{const alias=mappings.get(r.url),candidates=alias?.ids||byName.get(normalizeName(r.en))||[];return {...r,candidateIds:candidates,status:alias?'alias-candidate':candidates.length===1?'name-match':'needs-review',...(alias?{matchNote:alias.reason}:{})};});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const folder=process.argv[2]||'data',output=process.argv[3]||'catalog/dndsu-name-audit.json';
 const {bundle,version}=bundledCatalog();
 const sections={};
 const aliases=JSON.parse(readFileSync(new URL('../catalog/dndsu-name-aliases.json',import.meta.url),'utf8'));
 for(const [section,kinds] of [['spells',['spell']],['bestiary',['monster']],['items',['item','artifact']]]){
  const raw=readFileSync(folder+'/dndsu-'+section+'-list.txt','utf8'),entries=bundle.entries.filter(e=>kinds.includes(e.kind));
  const rows=compareNames(parseIndex(raw,section),entries,aliases.filter(a=>a.url.startsWith('https://dnd.su/'+section+'/')));
  sections[section]={indexUrl:'https://dnd.su/'+section+'/',payloadUrl:'https://dnd.su/piece/'+section+'/index-list/'+(section==='bestiary'?'?content=multiverse':''),indexVariant:section==='bestiary'?'multiverse':'official',rawSha256:createHash('sha256').update(raw).digest('hex'),catalogCount:entries.length,indexCount:rows.length,nameMatches:rows.filter(r=>r.status==='name-match').length,aliasCandidates:rows.filter(r=>r.status==='alias-candidate').length,needsReview:rows.filter(r=>r.status==='needs-review').length,unmatchedCatalog:entries.filter(e=>!rows.some(r=>r.candidateIds.includes(e.id))).map(e=>({id:e.id,en:e.name.en})),rows};
 }
 const classAudit=JSON.parse(readFileSync(new URL('../catalog/class-scope.json',import.meta.url),'utf8'));
 const report={schemaVersion:1,classAudit,checkedAt:new Date().toISOString(),ruleset:'5e-2014',catalogVersion:version,scope:'Public official index only; no Homebrew, 2024, private pages or full descriptions. Bestiary uses the site default multiverse list; classic-only versions are not counted. Name matches are candidates, NOT verified rules equivalence or imported full content.',sections};
 writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(Object.fromEntries(Object.entries(sections).map(([k,v])=>[k,{catalog:v.catalogCount,index:v.indexCount,nameMatches:v.nameMatches,unmatchedCatalog:v.unmatchedCatalog.length}]))));
}
