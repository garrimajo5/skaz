import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
import {decode} from './catalog-additional-discovery.mjs';import {classifySpellReference} from './catalog-feature-spell-references.mjs';
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/gs)].map(m=>[m[1],decode(m[3])]));const clean=s=>decode(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();const sha=s=>createHash('sha256').update(s).digest('hex');
export function choiceContainersWithBody(html){
 const found=[];let current=null,depth=0;
 for(const tag of html.matchAll(/<\/?div\b[^>]*>/g)){
  if(tag[0].startsWith('</')){if(current&&--depth===0){found.push({...current,body:html.slice(current.bodyStart,tag.index)});current=null;}continue;}
  const attributes=attrs(tag[0]);if(current){if(attributes['data-sort']==='element')throw Error('Nested choice container');depth++;}else if(attributes['data-sort']==='element'){current={attributes,bodyStart:tag.index+tag[0].length};depth=1;}
 }
 if(current)throw Error('Unclosed choice container');return found;
}
export function choiceSpellReferences(html,{classUrl,section,endSection,choices,knownSpells}){
 html=html.replace(/<!--[\s\S]*?-->/g,'');const articleStart=html.indexOf('class="card__body new-article"'),articleEnd=html.indexOf('<div class="card__footer"',articleStart);if(articleStart<0||articleEnd<articleStart)throw Error('Missing choice article');html=html.slice(articleStart,articleEnd);
 const anchors=[...html.matchAll(/\bid\s*=\s*(["'])(.*?)\1/g)],start=anchors.find(a=>a[2]===section)?.index,end=anchors.find(a=>a[2]===endSection)?.index;if(start===undefined||end===undefined||end<=start)throw Error('Missing choice section bounds');
 const records=[],seen=new Set();
 for(const c of choiceContainersWithBody(html.slice(start,end))){const title=c.attributes['data-rname']||clean(c.body.match(/<h[34]\b[^>]*>([\s\S]*?)<\/h[34]>/)?.[1]||''),matches=choices.filter(r=>r.classUrl===classUrl&&r.section===section&&r.title===title);if(matches.length!==1)throw Error('Unmapped choice body: '+title);const choice=matches[0];if(seen.has(choice.id))throw Error('Duplicate choice body');seen.add(choice.id);
  const references=[...c.body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(m=>({href:attrs(m[1]).href,label:m[2]})).filter(r=>/\/spells(?:\/|\?|$)/.test(r.href||'')).map(r=>classifySpellReference(r.href,r.label,classUrl,knownSpells));
  records.push({choiceObservationId:choice.id,classUrl,section,title,sourceId:choice.sourceId,filterLevel:choice.filterLevel,prerequisiteMetadata:choice.prerequisiteMetadata,references,evidenceTextSha256:sha(clean(c.body)),relationship:'choice-reference-not-an-automatic-grant',fullRules:'unverified',automation:'not-applied'});
 }
 if(records.length!==choices.filter(r=>r.classUrl===classUrl&&r.section===section).length)throw Error('Choice reference coverage mismatch');return records;
}
export function buildChoiceSpellReferences(directory){const read=f=>JSON.parse(readFileSync(new URL('../catalog/'+f,import.meta.url))),choices=read('dndsu-class-choice-metadata.json').groups.flatMap(g=>g.records),knownSpells=new Map(read('dndsu-spell-index-metadata.json').records.map(r=>[r.pageId,r])),records=[];
 for(const [id,section,endSection] of [[104,'invocations','patrons'],[137,'infusions','specialists'],[93,'tradition.four-elements','tradition.long-death']]){const classUrl=choices.find(r=>r.section===section).classUrl;records.push(...choiceSpellReferences(readFileSync(directory+'/class-'+id+'.html','utf8'),{classUrl,section,endSection,choices,knownSpells}));}
 const refs=records.flatMap(r=>r.references);return {schemaVersion:1,status:'partial-choice-spell-reference-evidence',summary:{choices:records.length,choicesWithReferences:records.filter(r=>r.references.length).length,references:refs.length,uniqueSpellPages:new Set(refs.filter(r=>r.pageId).map(r=>r.pageId)).size,unresolvedReferences:refs.filter(r=>r.kind!=='spell-page'||r.registryStatus!=='observed-in-spell-index').length},records};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [,,directory,output]=process.argv;if(!directory||!output)throw Error('Usage: class-html-directory output.json');const result=buildChoiceSpellReferences(directory);writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(result.summary);}
