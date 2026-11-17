import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {decode} from './catalog-additional-discovery.mjs';
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/gs)].map(m=>[m[1],decode(m[3])]));
const clean=s=>decode(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
export function choiceContainers(html,{section,endSection,classUrl,defaultSource,expectedTitles,titleAttribute=false},sources){
 const anchors=[...html.matchAll(/\bid\s*=\s*(["'])(.*?)\1/g)];const start=anchors.find(m=>m[2]===section)?.index,end=anchors.find(m=>m[2]===endSection)?.index;
 if(start===undefined||end===undefined||end<=start)throw Error('Missing choice section boundary');
 const body=html.slice(start,end),starts=[...body.matchAll(/<div\b[^>]*>/g)].filter(m=>attrs(m[0])['data-sort']==='element'),records=[],seen=new Set();
 const sourceTitles={PH:"Player's Handbook",XGE:"Xanathar's Guide to Everything",TCE:"Tasha's Cauldron of Everything"};
 for(let i=0;i<starts.length;i++){
  const m=starts[i],metadata=attrs(m[0]),content=body.slice(m.index+m[0].length,starts[i+1]?.index??body.length);const heading=content.match(/<h([34])\b[^>]*>([\s\S]*?)<\/h\1>/);
  const label=titleAttribute?content.match(/<p>\s*(?:<em>\s*)?<strong\b[^>]*>([\s\S]*?)<\/strong>/):null;
  if(!heading&&!label)throw Error('Missing choice heading');
  const title=titleAttribute?metadata['data-rname']:clean(heading[2]);
  if(titleAttribute&&(!title||!label||clean(label[1]).replace(/\s*\(требуется \d+ уровень\)\s*\.?$/, '').replace(/\s*\.$/,'').trim()!==title))throw Error('Mismatched choice label');if(seen.has(title))throw Error('Duplicate choice');seen.add(title);
  if(!expectedTitles.includes(title))throw Error('Unexpected choice title');
  const code=metadata['data-source']||defaultSource,source=sources.find(s=>s.title===sourceTitles[code]);if(!source)throw Error('Unresolved choice source');
  const level=metadata['data-level'];const labelLevel=label?clean(label[1]).match(/\(требуется (\d+) уровень\)/)?.[1]:null;if(labelLevel!=null&&Number(labelLevel)!==Number(level))throw Error('Contradictory choice level');if(level===undefined||!/^\d+$/.test(level)||Number(level)>20)throw Error('Unexpected choice level');
  const prerequisites=Object.fromEntries(Object.entries(metadata).filter(([k])=>k.startsWith('data-')&&!['data-sort','data-source','data-level'].includes(k)));
  records.push({id:'scope-choice:'+createHash('sha256').update(classUrl+'#'+section+'\n'+title).digest('hex').slice(0,20),title,classUrl,section,sourceId:source.sourceId,sourceBasis:metadata['data-source']?'explicit-container-source':'class-page-source',filterLevel:Number(level),prerequisiteMetadata:prerequisites,canonicalCatalogId:null,fullRules:'unverified',eligibility:'not-computed-from-filter',inclusion:'proposed-2014-awaiting-review'});
 }
 if(records.length!==expectedTitles.length)throw Error('Incomplete choice enumeration');return records;
}
export function headingChoices(page,anchor,sources){
 const start=page.headings.findIndex(h=>h.anchors.includes(anchor));
 if(start<0)throw Error('Missing choice parent');
 const records=[],seen=new Set();
 for(let i=start+1;i<page.headings.length&&page.headings[i].level>3;i++){
  const h=page.headings[i];if(h.level!==4)throw Error('Unexpected choice heading level');
  if(seen.has(h.title))throw Error('Duplicate heading choice');seen.add(h.title);
  const tags=h.optionalSourceTags||[];
  if(tags.some(t=>t!=='TCE'))throw Error('Unresolved optional choice source');
  const source=sources.find(s=>s.title===(tags.includes('TCE')?"Tasha's Cauldron of Everything":"Player's Handbook"));
  if(!source)throw Error('Missing heading choice source');
  records.push({id:'scope-choice:'+createHash('sha256').update(page.url+'#'+anchor+'\n'+h.title).digest('hex').slice(0,20),title:h.title,classUrl:page.url,section:anchor,sourceId:source.sourceId,sourceBasis:tags.includes('TCE')?'explicit-optional-heading':'base-class-page-source',filterLevel:null,prerequisiteMetadata:{},canonicalCatalogId:null,fullRules:'unverified',eligibility:'not-computed-from-filter',inclusion:'proposed-2014-awaiting-review'});
 }
 if(!records.length)throw Error('Empty heading choices');return records;
}
export function maneuverChoices(html,classUrl,sources){
 const anchors=[...html.matchAll(/\bid\s*=\s*(["'])(.*?)\1/g)];const start=anchors.find(m=>m[2]==='maneuvers')?.index,end=anchors.find(m=>m[2]==='martial-archetypes')?.index;
 if(start===undefined||end===undefined||end<=start)throw Error('Missing maneuver boundaries');
 const body=html.slice(start,end),split=body.match(/<h3\b[^>]*>Варианты приёмов<\/h3>/);
 if(!split||!body.slice(split.index,split.index+300).includes('option.TCE'))throw Error('Missing optional maneuver source');
 const records=[],seen=new Set();
 for(const m of body.matchAll(/<p>\s*<strong\b[^>]*>([\s\S]*?)<\/strong>/g)){
  const title=clean(m[1]).replace(/\s*\.$/,'').trim();if(!title||seen.has(title))throw Error('Invalid maneuver title');seen.add(title);
  const optional=m.index>split.index,source=sources.find(s=>s.title===(optional?"Tasha's Cauldron of Everything":"Player's Handbook"));if(!source)throw Error('Missing maneuver source');
  records.push({id:'scope-choice:'+createHash('sha256').update(classUrl+'#maneuvers\n'+title).digest('hex').slice(0,20),title,classUrl,section:'maneuvers',sourceId:source.sourceId,sourceBasis:optional?'explicit-optional-section':'base-class-page-source',filterLevel:null,prerequisiteMetadata:{},canonicalCatalogId:null,fullRules:'unverified',eligibility:'not-computed-from-filter',inclusion:'proposed-2014-awaiting-review'});
 }
 if(!records.length)throw Error('Empty maneuvers');return records;
}
export function paragraphChoices(html,{classUrl,parentAnchor,headingTitle,sourceTitle,expectedTitles},sources){
 const heads=[...html.matchAll(/<h([234])\b[^>]*>([\s\S]*?)<\/h\1>/g)];
 const parent=heads.findIndex(h=>[...h[2].matchAll(/\bid\s*=\s*(["'])(.*?)\1/g)].some(a=>a[2]===parentAnchor));
 if(parent<0)throw Error('Missing choice subclass');let stop=parent+1;while(stop<heads.length&&Number(heads[stop][1])>2)stop++;
 const candidates=heads.slice(parent+1,stop).filter(h=>clean(h[2])===headingTitle);if(candidates.length!==1)throw Error('Missing or ambiguous choice heading');
 const h=candidates[0],index=heads.indexOf(h);let end=index+1;while(end<stop&&Number(heads[end][1])>Number(h[1]))end++;
 const body=html.slice(h.index+h[0].length,heads[end]?.index??html.length),source=sources.find(s=>s.title===sourceTitle);if(!source)throw Error('Missing paragraph choice source');
 const labels=[...body.matchAll(/<strong\b[^>]*>([\s\S]*?)<\/strong>/g)].map(m=>clean(m[1]));
 const records=[];for(const title of expectedTitles){const matches=labels.filter(label=>label.replace(/\s*\(\d+-й уровень или выше\)\s*\.?$/,'').replace(/\s*\.$/,'').trim()===title);if(matches.length!==1)throw Error('Missing or duplicate expected paragraph choice');
 records.push({id:'scope-choice:'+createHash('sha256').update(classUrl+'#'+parentAnchor+'\n'+title).digest('hex').slice(0,20),title,classUrl,section:parentAnchor,sourceId:source.sourceId,sourceBasis:'explicit-subclass-source',filterLevel:null,prerequisiteMetadata:{observedLabel:matches[0]},canonicalCatalogId:null,fullRules:'unverified',eligibility:'not-computed-from-filter',inclusion:'proposed-2014-awaiting-review'});
 }return records;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [,,directory,output]=process.argv;if(!directory||!output)throw Error('Usage: class-html-directory output.json');const read=f=>JSON.parse(readFileSync(new URL('../catalog/'+f,import.meta.url)));const navigation=read('dndsu-class-headings.json'),sources=read('dndsu-source-register.json').sources;
 const groups=[];for(const config of [{id:104,section:'invocations',endSection:'patrons',defaultSource:null,level:3},{id:137,section:'infusions',endSection:'specialists',defaultSource:'TCE',level:4}]){
  const page=navigation.pages.find(p=>p.url.includes('/'+config.id+'-')),bytes=readFileSync(directory+'/class-'+config.id+'.html'),expectedTitles=page.headings.filter(h=>h.sectionAnchor===config.section&&h.level===config.level).map(h=>h.title);
  groups.push({classUrl:page.url,rawSha256:createHash('sha256').update(bytes).digest('hex'),records:choiceContainers(bytes.toString('utf8'),{...config,classUrl:page.url,expectedTitles},sources)});
 }
 {
  const page=navigation.pages.find(p=>p.url.includes('/93-'));const bytes=readFileSync(directory+'/class-93.html');
  const expectedTitles=['Водяной кнут','Гонг на вершине горы','Дыхание зимы','Земляной вал','Зубы огненной змеи','Испепеляющий удар','Кулак четырёх громов','Натиск штормовых духов','Несокрушимый воздушный кулак','Объятья северного ветра','Осёдланный ветер','Пламя феникса','Прочность вечных гор','Река голодного пламени','Родство со стихией','Туманная стойка','Формирование текущей реки'];
  groups.push({classUrl:page.url,rawSha256:createHash('sha256').update(bytes).digest('hex'),records:choiceContainers(bytes.toString('utf8'),{section:'tradition.four-elements',endSection:'tradition.long-death',classUrl:page.url,defaultSource:'PH',expectedTitles,titleAttribute:true},sources)});
 }
 for(const id of [91,94,97,101]){const page=navigation.pages.find(p=>p.url.includes('/'+id+'-'));const bytes=readFileSync(directory+'/class-'+id+'.html');groups.push({classUrl:page.url,rawSha256:createHash('sha256').update(bytes).digest('hex'),records:headingChoices(page,id===101?'feature.metamagic':'feature.fighting-style',sources)});}
 {const page=navigation.pages.find(p=>p.url.includes('/91-'));const bytes=readFileSync(directory+'/class-91.html');groups.push({classUrl:page.url,rawSha256:createHash('sha256').update(bytes).digest('hex'),records:maneuverChoices(bytes.toString('utf8'),page.url,sources)});}
 {const page=navigation.pages.find(p=>p.url.includes('/91-'));const bytes=readFileSync(directory+'/class-91.html');for(const config of [
 {parentAnchor:'archetype.arcane-archer',headingTitle:'ВАРИАНТЫ МАГИЧЕСКОГО ВЫСТРЕЛА',sourceTitle:"Xanathar's Guide to Everything",expectedTitles:['Взрывная стрела','Изгоняющая стрела','Ищущая стрела','Обманная стрела','Ослабляющая стрела','Пронзающая стрела','Сжимающая стрела','Теневая стрела']},
 {parentAnchor:'archetype.rune-knight',headingTitle:'Известные руны',sourceTitle:"Tasha's Cauldron of Everything",expectedTitles:['Каменная руна','Ледяная руна','Облачная руна','Огненная руна','Холмовая руна','Штормовая руна']}
 ]){const parent=page.headings.find(h=>h.anchors.includes(config.parentAnchor));if(!parent.sourceResolution.some(s=>s.status==='source-identified'&&s.sourceIds.includes(sources.find(x=>x.title===config.sourceTitle)?.sourceId)))throw Error('Missing paragraph parent source evidence');groups.push({classUrl:page.url,rawSha256:createHash('sha256').update(bytes).digest('hex'),enumeration:'explicit-reviewed-labels-not-all-bold-text',records:paragraphChoices(bytes.toString('utf8'),{...config,classUrl:page.url},sources)});}}
 writeFileSync(output,JSON.stringify({schemaVersion:1,observedOn:navigation.observedOn,status:'partial-choice-metadata-awaiting-review',groups},null,2)+'\n');console.log(groups.map(g=>({url:g.classUrl,choices:g.records.length})));
}

