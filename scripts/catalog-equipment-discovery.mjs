import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {decode} from './catalog-additional-discovery.mjs';
const clean=s=>decode(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
export function equipmentRows(html,url){
 const start=html.search(/<div\b[^>]*class="card__body new-article"[^>]*>/),end=html.indexOf('<div class="card__footer"',start);
 if(start<0||end<start)throw Error('Missing article boundary');html=html.slice(start,end);
 const source=html.match(/<li><strong>Источники?:<\/strong>([\s\S]*?)<\/li>/);
 if(!source)throw Error('Missing equipment source');
 const sourceTitles=[...source[1].matchAll(/<span>([^<]+)<\/span>/g)].map(m=>clean(m[1])).filter(Boolean);
 if(!sourceTitles.length)throw Error('Empty equipment source evidence');
 const records=[],seen=new Set();let selectedTables=0;
 for(const table of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/g)){
  const rows=[...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(m=>[...m[1].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/g)].map(c=>({text:clean(c[2]),span:Number(c[1].match(/colspan=["'](\d+)["']/)?.[1]||1)})));
  const header=rows[0]||[];const starts=[];
  for(let i=0;i<header.length-1;i++)if(/^(Предмет|Доспех|Название)$/.test(header[i].text)&&/^(Стоимость|Цена)$/.test(header[i+1].text))starts.push(i);
  if(!starts.length)continue;selectedTables++;
  for(const row of rows.slice(1)){
   const expanded=[];for(const cell of row){expanded.push(cell);for(let n=1;n<cell.span;n++)expanded.push(null);}
   for(const start of starts){
    const name=expanded[start],price=expanded[start+1];
    if(!name||name.span>1||!name.text||!price?.text)continue;
    if(!/^(\d|—|–|-)/.test(price.text))throw Error('Unexpected equipment price');
    const key=name.text.toLocaleLowerCase('ru');if(seen.has(key))throw Error('Duplicate equipment name');seen.add(key);
    records.push({observationId:'equipment:'+createHash('sha256').update(url+'\n'+key).digest('hex').slice(0,20),name:name.text,sourceUrl:url,sourceTitles:[...new Set(sourceTitles)],priceText:price.text,status:'table-observation-not-approved-record',canonicalCatalogId:null,fullRules:'unverified',reusePermission:'not-established-for-reference-text'});
   }
  }
 }
 if(!records.length)throw Error('Empty equipment discovery');return {selectedTables,records};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [,,directory,date,output]=process.argv;if(!directory||!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!output)throw Error('Usage: input-directory YYYY-MM-DD output.json');
 const discovery=JSON.parse(readFileSync(new URL('../catalog/dndsu-additional-discovery.json',import.meta.url))),articles=[];
 for(const id of [95,96,98,100]){
  const article=discovery.sections.inventory.articles.find(a=>a.id==='dndsu:article:'+id),bytes=readFileSync(directory+'/equipment-'+id+'.html');
  articles.push({url:article.url,rawSha256:createHash('sha256').update(bytes).digest('hex'),...equipmentRows(bytes.toString('utf8'),article.url)});
 }
 writeFileSync(output,JSON.stringify({schemaVersion:1,observedOn:date,status:'partial-equipment-tables',articles},null,2)+'\n');console.log(articles.map(a=>({url:a.url,rows:a.records.length,tables:a.selectedTables})));
}
