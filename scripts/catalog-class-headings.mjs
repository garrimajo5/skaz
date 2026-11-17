import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {decode} from './catalog-additional-discovery.mjs';
export function resolveSources(titles,sources){
 const normalize=s=>s.normalize('NFKC').replace(/\p{Cf}/gu,'').replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim().toLowerCase();
 const aliases={"Dungeon Master Guide":"Dungeon Master's Guide"};
 return titles.flatMap(title=>{const parts=title.split(/,\s*/);if(!sources.some(s=>normalize(s.title)===normalize(title))&&parts.length>1&&parts.every(part=>sources.filter(s=>normalize(s.title)===normalize(part)).length===1))return resolveSources(parts,sources).map(s=>({...s,originalLabel:title,resolutionBasis:'explicit-known-title-list'}));const resolvedTitle=aliases[title]||title;const matches=sources.filter(s=>normalize(s.title)===normalize(resolvedTitle));return {title,resolutionBasis:aliases[title]?'explicit-title-alias':'normalized-title',sourceIds:matches.map(s=>s.sourceId),status:matches.length===1?'source-identified':matches.length?'ambiguous-source':'unresolved-source'};});
}
export function annotateClassSources(headings,sources){
 let excludedBySource=false,sourceSectionAnchor=null;
 return headings.map(h=>{
  const sourceResolution=resolveSources(h.explicitSources,sources);
  const ownExcluded=sourceResolution.some(r=>r.sourceIds.some(id=>sources.some(s=>s.sourceId===id&&s.group==='Homebrew')));
  if(h.level===2){excludedBySource=ownExcluded;sourceSectionAnchor=h.sectionAnchor;}else if(h.sectionAnchor!==sourceSectionAnchor)excludedBySource=false;
  return {...h,sourceResolution,...(excludedBySource||ownExcluded?{inclusion:'excluded-homebrew',exclusionBasis:'source-group-Homebrew'}:{})};
 });
}
export function classHeadings(html){
 const start=html.search(/<div\b[^>]*class="card__body new-article"[^>]*>/),end=html.indexOf('<div class="card__footer"',start);
 if(start<0||end<start)throw Error('Missing class article boundary');
 const body=html.slice(start,end),matches=[...body.matchAll(/<h([234])\b[^>]*>([\s\S]*?)<\/h\1>/g)];
 const rows=[];let sectionAnchor=null,sectionPlaytest=false,emptyHeadingCount=0;
 for(const [index,m] of matches.entries()){
  const level=Number(m[1]),title=decode(m[2].replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
  if(!title){emptyHeadingCount++;if(level===2){sectionAnchor=null;sectionPlaytest=false;}continue;}
  const anchors=[...m[2].matchAll(/\bid\s*=\s*(["'])(.*?)\1/g)].map(a=>decode(a[2]));
  if(level===2)sectionAnchor=anchors[0]||null;
  const evidence=[sectionAnchor,...anchors].filter(Boolean).join(' ');

  const following=body.slice(m.index+m[0].length,matches[index+1]?.index??body.length);
  const explicitSources=[...following.matchAll(/<strong>\s*Источники?:\s*([\s\S]*?)<\/strong>/g)].flatMap(s=>{const label=decode(s[1].replace(/<[^>]*>/g,'')).trim();const quoted=[...label.matchAll(/«([^»]+)»/g)].map(m=>m[1]);return quoted.length?quoted:[label];}).filter(Boolean);
  if(level===2)sectionPlaytest=explicitSources.some(s=>/Unearthed Arcana/i.test(s));
  const inclusion=/(^|[ .])hb[.]/i.test(evidence)?'excluded-homebrew':sectionPlaytest||/(^|[ .])ua[.]/i.test(evidence)?'needs-playtest-review':'needs-section-source-review';
  const intro=following.match(/^\s*<p[^>]*>\s*<(?:em|i)>([\s\S]*?)<\/(?:em|i)>\s*<\/p>/)?.[1]||'';
  const levelEvidence=/уров/i.test(intro)?[...intro.replace(/<[^>]*>/g,'').matchAll(/(\d+)-[йя]/g)].map(m=>Number(m[1])):[];
  const optionalSourceTags=[...intro.matchAll(/tooltip-for=["']option\.([^"']+)["']/g)].map(m=>m[1]);
  rows.push({levelEvidence,optionalSourceTags,explicitSources,ordinal:rows.length+1,level,title,anchors,sectionAnchor,inclusion,recordType:'heading-not-certified-feature',fullRules:'unverified'});
 }
 if(!rows.length)throw Error('Empty class headings');return {headings:rows,emptyHeadingCount};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [,,directory,date,output]=process.argv;if(!directory||!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!output)throw Error('Usage: input-directory YYYY-MM-DD output.json');
 const classes=JSON.parse(readFileSync(new URL('../catalog/dndsu-class-discovery.json',import.meta.url))).rows.filter(r=>r.group==='classes');
 const sources=JSON.parse(readFileSync(new URL('../catalog/dndsu-source-register.json',import.meta.url))).sources;
 const pages=classes.map(c=>{const bytes=readFileSync(directory+'/class-'+c.url.match(/\/class\/(\d+)/)[1]+'.html');return {url:c.url,className:c.ru,rawSha256:createHash('sha256').update(bytes).digest('hex'),...classHeadings(bytes.toString('utf8'))};});
 for(const page of pages)page.headings=annotateClassSources(page.headings,sources);
 writeFileSync(output,JSON.stringify({schemaVersion:1,observedOn:date,status:'navigation-evidence-not-feature-denominator',pages},null,2)+'\n');console.log({classes:pages.length,headings:pages.reduce((n,p)=>n+p.headings.length,0),homebrew:pages.flatMap(p=>p.headings).filter(h=>h.inclusion==='excluded-homebrew').length});
}
