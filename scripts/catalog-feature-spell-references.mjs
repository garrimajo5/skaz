import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {decode} from './catalog-additional-discovery.mjs';
import {classHeadings,annotateClassSources} from './catalog-class-headings.mjs';
import {normalizeName} from './audit-dndsu-names.mjs';
import {spellReference} from './catalog-subclass-spell-tables.mjs';
const clean=s=>decode(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const sha=s=>createHash('sha256').update(s).digest('hex');
export function classifySpellReference(href,label,classUrl,knownSpells){
   const url=new URL(href,classUrl);if(url.origin!=='https://dnd.su'||url.username||url.password)throw Error('Foreign spell feature reference');
   let reference;if(/^\/spells\/\d+-[^/]+\/$/.test(url.pathname)){reference={kind:'spell-page',...spellReference(href,label,classUrl,knownSpells)};}
   else if(url.pathname==='/spells/'&&!url.hash){const search=url.searchParams.get('search')?.trim();reference={kind:search?'spell-search-navigation':'spell-list-navigation',url:url.href,label:clean(label),pageId:null,...(search?{search,candidatePageIds:[...knownSpells.entries()].filter(([,r])=>normalizeName(r.ru)===normalizeName(search)||normalizeName(r.en)===normalizeName(search)).map(([id])=>id),identityResolution:'unresolved-search-not-page-identity'}:{}),fullRules:'unverified'};}
   else throw Error('Unsupported feature spell reference');
 return reference;
}
export function featureSpellReferences(html,{proposal,knownSpells,sources}){
 html=html.replace(/<!--[\s\S]*?-->/g,'');
 const navigation=annotateClassSources(classHeadings(html).headings,sources);
 const start=html.search(/<div\b[^>]*class="card__body new-article"[^>]*>/),end=html.indexOf('<div class="card__footer"',start);
 const body=html.slice(start,end),heads=[...body.matchAll(/<h([234])\b[^>]*>([\s\S]*?)<\/h\1>/g)].filter(h=>clean(h[2]));
 const records=[];
 for(const feature of proposal.records.filter(r=>['base-feature','subclass-feature'].includes(r.kind))){
  const heading=heads[feature.headingOrdinal-1];
  if(!heading||clean(heading[2])!==feature.title)throw Error('Feature heading no longer matches proposal');
  const next=heads.find(h=>h.index>heading.index&&Number(h[1])<=Number(heading[1]));
  const segment=body.slice(heading.index+heading[0].length,next?.index),tables=[...segment.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/g)];
  const links=[...segment.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];let occurrence=0;
  for(const link of links){
   if(tables.some(t=>link.index>=t.index&&link.index<t.index+t[0].length))continue;
   const href=decode(link[1].match(/\bhref\s*=\s*(["'])(.*?)\1/s)?.[2]||'');if(!/\/spells(?:\/|\?|$)/.test(href))continue;
   const reference=classifySpellReference(href,link[2],proposal.classUrl,knownSpells),url=new URL(reference.url);
   const absolute=heading.index+heading[0].length+link.index,context=heads.filter(h=>h.index<=absolute).at(-1),contextOrdinal=heads.indexOf(context)+1,contextEvidence=navigation[contextOrdinal-1];
   if(contextEvidence.inclusion!=='needs-section-source-review')throw Error('Excluded child context inside feature');
   const before=segment.slice(0,link.index),pStart=before.lastIndexOf('<p'),pEnd=segment.indexOf('</p>',link.index),evidence=pStart>=0&&pEnd>=0?segment.slice(pStart,pEnd+4):segment;
   records.push({id:'feature-spell-ref:'+sha(feature.id+'\n'+(++occurrence)+'\n'+url.href).slice(0,20),identityStatus:'occurrence-observation-not-canonical',classUrl:proposal.classUrl,featureId:feature.id,featureTitle:feature.title,parent:feature.parent,featureSourceIds:feature.sourceIds,sourceBasis:'containing-feature-not-certification-of-link-rule',contextHeading:contextEvidence.title,contextOrdinal,contextExplicitSourceIds:contextEvidence.sourceResolution.flatMap(s=>s.sourceIds),contextOptionalSourceTags:contextEvidence.optionalSourceTags,reference,evidenceTextSha256:sha(clean(evidence)),relationship:'unclassified-reference-not-a-grant',fullRules:'unverified',automation:'not-applied'});
  }
 }
 return {classUrl:proposal.classUrl,records};
}
export function buildFeatureReferences(directory){
 const read=f=>JSON.parse(readFileSync(new URL('../catalog/'+f,import.meta.url)));
 const sources=read('dndsu-source-register.json').sources,proposals=[read('dndsu-bard-scope-proposal.json'),read('dndsu-barbarian-scope-proposal.json'),...read('dndsu-reviewed-class-proposals.json').classes],knownSpells=new Map(read('dndsu-spell-index-metadata.json').records.map(r=>[r.pageId,r]));
 const classes=proposals.map(proposal=>{const bytes=readFileSync(directory+'/class-'+proposal.classUrl.match(/\/class\/(\d+)/)[1]+'.html');return {...featureSpellReferences(bytes.toString('utf8'),{proposal,knownSpells,sources}),rawSha256:sha(bytes)};});
 const records=classes.flatMap(c=>c.records),pages=records.filter(r=>r.reference.kind==='spell-page');
 return {schemaVersion:1,status:'non-table-feature-references-not-spell-grants',summary:{classes:classes.length,references:records.length,spellPageReferences:pages.length,listNavigationReferences:records.filter(r=>r.reference.kind==='spell-list-navigation').length,searchNavigationReferences:records.filter(r=>r.reference.kind==='spell-search-navigation').length,uniqueSpellPages:new Set(pages.map(r=>r.reference.pageId)).size,blankLabels:pages.filter(r=>!r.reference.label).length,unknownPages:pages.filter(r=>r.reference.registryStatus!=='observed-in-spell-index').length,nameConflicts:pages.filter(r=>r.reference.nameEvidence==='index-name-differs').length},classes};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [,,directory,output]=process.argv;if(!directory||!output)throw Error('Usage: class-html-directory output.json');const result=buildFeatureReferences(directory);writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(result.summary);}
