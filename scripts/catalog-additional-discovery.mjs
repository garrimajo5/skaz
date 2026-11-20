import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export function decode(value){return value.replace(/&(#x[\da-f]+|#\d+|quot|apos|amp|lt|gt|nbsp);/gi,(_,key)=>key[0]==='#'?String.fromCodePoint(key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1))):({quot:'"',apos:"'",amp:'&',lt:'<',gt:'>',nbsp:' '}[key.toLowerCase()]));}
function attrs(tag){return Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/gs)].map(m=>[m[1],decode(m[3])]));}
const text=s=>decode(s.replace(/<[^>]*>/g,'')).trim();
export function parseDiscovery(html,section){
 if(!['feats','backgrounds'].includes(section))throw Error('Unsupported index section');
 const sourceInput=[...html.matchAll(/<input\b[^>]*>/gs)].map(m=>attrs(m[0])).find(a=>a.name==='source');
 if(!sourceInput?.['data-list'])throw Error('Missing source selector');
 const sources=[];
 for(const group of Object.values(JSON.parse(sourceInput['data-list'])))for(const source of Object.values(group.list))sources.push({sourceId:String(source.value),title:source.title,group:group.title});
 const rows=[],seen=new Set();
 for(const m of html.matchAll(/<div\b([^>]*\bdata-id\s*=\s*["'][^"']+["'][^>]*)>\s*<a\b([^>]*)>([\s\S]*?)<\/a>/g)){
  const a=attrs(m[1]),link=attrs(m[2]);if(!a.class?.split(/\s+/).includes('for_filter'))continue;
  const match=link.href?.match(new RegExp('^/(homebrew/|multiverse/)?'+section+'/(\\d+)-[a-z0-9_-]+/$'));
  if(!match||match[2]!==a['data-id'])throw Error('Unexpected item identity: '+a['data-id']+' '+link.href);
  if(seen.has(a['data-id']))throw Error('Duplicate item');seen.add(a['data-id']);
  const title=m[3].match(/<div\b[^>]*class=["']list-item-title["'][^>]*>([\s\S]*?)<\/div>/);
  if(!title||!a['data-source'])throw Error('Missing item metadata');
  const names=a['data-search']?.split(',')||[];
  rows.push({url:'https://dnd.su'+link.href,ru:text(title[1]),en:names[1]?.trim()||'',sources:a['data-source'].split(',').map(x=>x.trim()).filter(Boolean),candidateIds:[],status:'not-compared'});
 }
 const declared=[...html.matchAll(/<div\b[^>]*>/g)].map(m=>attrs(m[0])).filter(a=>a.class?.split(/\s+/).includes('for_filter')&&a['data-id']).length;
 if(declared!==rows.length)throw Error('Incomplete discovery: markup changed');
 if(!rows.length)throw Error('Empty discovery');
 return {rows,sources};
}
export function parseRaces(html){
 const rows=[],seen=new Set();
 for(const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)){
  const a=attrs(m[1]);if(!a.class?.split(/\s+/).includes('race'))continue;
  if(!/^\/(homebrew\/|multiverse\/)?race\/\d+-[a-z0-9_-]+\/$/.test(a.href||''))throw Error('Unexpected race path');
  if(seen.has(a.href))throw Error('Duplicate race');seen.add(a.href);
  const fields={};for(const span of m[2].matchAll(/<span\b([^>]*)>([\s\S]*?)<\/span>/g)){const b=attrs(span[1]);fields[b.class]={text:text(span[2]),title:b.title};}
  if(!fields.article_title?.text||!fields.article_source?.title)throw Error('Missing race metadata');
  rows.push({url:'https://dnd.su'+a.href,ru:fields.article_title.text,en:fields.article_title_en?.text||'',sourceTitle:fields.article_source.title,candidateIds:[],status:'not-compared'});
 }
 if(!rows.length)throw Error('Empty race discovery');return rows;
}
export function parseInventoryLinks(html,section='inventory'){
 if(!['inventory','mechanics'].includes(section))throw Error('Unsupported article section');
 const links=new Map();
 for(const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)){
  const a=attrs(m[1]);if(a.class!=='item-link')continue;
  const match=a.href?.match(/^\/articles\/(inventory|mechanics)\/(\d+)-[a-z0-9_-]+\/$/);if(!match||match[1]!==section)continue;
  if(links.has(match[2]))throw Error('Duplicate article');
  links.set(match[2],{id:'dndsu:article:'+match[2],url:'https://dnd.su'+a.href,title:text(m[2]),recordType:section==='inventory'?'article-not-item':'article-not-rule',enumeration:'not-audited',...(section==='inventory'?{itemEnumeration:'not-audited'}:{}),reusePermission:'not-established-for-reference-text'});
 }
 if(!links.size)throw Error('Empty article discovery');return [...links.values()];
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [,,directory,observedOn,outputPath]=process.argv;
 if(!directory||!/^\d{4}-\d{2}-\d{2}$/.test(observedOn||'')||!outputPath)throw Error('Usage: node script input-directory YYYY-MM-DD output.json');
 const result={schemaVersion:1,observedOn,sections:{}};
 for(const section of ['feats','backgrounds','inventory','race','mechanics']){
  const bytes=readFileSync(directory+'/source-'+section+'.html'),html=bytes.toString('utf8');
  result.sections[section]={url:'https://dnd.su/'+(['inventory','mechanics'].includes(section)?'articles/'+section:section)+'/',rawSha256:createHash('sha256').update(bytes).digest('hex'),...(['inventory','mechanics'].includes(section)?{articles:parseInventoryLinks(html,section)}:section==='race'?{rows:parseRaces(html)}:parseDiscovery(html,section))};
 }
 writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n');console.log(Object.fromEntries(Object.entries(result.sections).map(([k,v])=>[k,(v.rows||v.articles).length])));
}
