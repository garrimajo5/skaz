import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
import {decode} from './catalog-additional-discovery.mjs';import {pageIdentity} from './catalog-scope-register.mjs';
const clean=s=>decode(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();const sha=s=>createHash('sha256').update(s).digest('hex');
export const companionSpecs=[
 {classId:88,parent:'college.creation',title:'Оживляющее выступление',ids:[3989],relation:'animated-item-statblock'},
 {classId:137,parent:'infusions',title:'СЛУГА-ГОМУНКУЛ',ids:[3987],relation:'infusion-servant-statblock',choice:true},
 {classId:137,parent:'specialist.battlesmith',title:'СТАЛЬНОЙ ЗАЩИТНИК',ids:[3988],relation:'defender-statblock'},
 {classId:90,parent:'circle.wildfire',title:'Призыв духа дикого огня',ids:[4235],relation:'summoned-spirit-statblock'},
 {classId:97,parent:'archetype.beast-master',title:'Первичный спутник',ids:[4311,4312,4313],relation:'choose-one-replacement-companion'},
 {classId:97,parent:'archetype.drakewarden',title:'Дрейк-компаньон',ids:[4842],relation:'initial-drake-statblock'},
 {classId:97,parent:'archetype.drakewarden',title:'Единство клыков и чешуи',ids:[14130],relation:'later-drake-statblock-reference'},
 {classId:97,parent:'archetype.drakewarden',title:'Превосходная связь',ids:[14131],relation:'later-drake-statblock-reference'},
 {classId:101,parent:'origin.shadow',title:'ГОНЧАЯ ДУРНОГО ЗНАМЕНИЯ',ids:[2017,297],relation:'hound-and-base-wolf-references'},
 {classId:104,parent:'patron.hexblade',title:'ПРОКЛЯТЫЙ СПЕКТР',ids:[294],relation:'base-specter-with-feature-modifications'}
];
export function companionDiscovery(directory,proposals,choiceRecords,index,specs=companionSpecs){
 const known=new Map(index.map(r=>[pageIdentity(r.url).id,r])),records=[];
 for(const spec of specs){const p=proposals.find(p=>Number(p.classUrl.match(/\/class\/(\d+)/)[1])===spec.classId);if(!p)throw Error('Missing companion class');
  const matches=(spec.choice?choiceRecords:p.records).filter(r=>r.classUrl===p.classUrl||!r.classUrl).filter(r=>(spec.choice?r.section:r.parent)===spec.parent&&r.title===spec.title);if(matches.length!==1)throw Error('Missing or ambiguous companion feature');const feature=matches[0];
  let html=readFileSync(directory+'/class-'+spec.classId+'.html','utf8').replace(/<!--[\s\S]*?-->/g,'');const start=html.indexOf('class="card__body new-article"'),end=html.indexOf('<div class="card__footer"',start);if(start<0||end<start)throw Error('Missing companion article');html=html.slice(start,end);
  const heads=[...html.matchAll(/<h([234])\b[^>]*>([\s\S]*?)<\/h\1>/g)].filter(h=>clean(h[2]));let h;if(spec.choice){const hs=heads.filter(h=>Number(h[1])===4&&clean(h[2])===spec.title);if(hs.length!==1)throw Error('Ambiguous infusion heading');h=hs[0];}else h=heads[feature.headingOrdinal-1];if(!h||clean(h[2])!==spec.title)throw Error('Stale companion feature');const next=heads.find(n=>n.index>h.index&&Number(n[1])<=Number(h[1])),body=html.slice(h.index+h[0].length,next?.index),links=[...body.matchAll(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/g)].filter(m=>/\/bestiary\//.test(m[2]));
  const refs=links.map(m=>{const url=new URL(decode(m[2]),p.classUrl).href,identity=pageIdentity(url);if(identity.section!=='bestiary'||identity.homebrew)throw Error('Invalid companion reference');const target=known.get(identity.id);return {pageId:identity.id,url,label:clean(m[3]),indexStatus:target?'observed-in-bestiary-index':'not-in-bestiary-index',...(target?{indexSourceIds:target.sources}:{}),canonicalCatalogId:null,fullRules:'unverified'};});
  if(JSON.stringify([...new Set(refs.map(r=>Number(r.pageId.split(':').at(-1))))].sort((a,b)=>a-b))!==JSON.stringify([...spec.ids].sort((a,b)=>a-b)))throw Error('Companion links differ from reviewed list');
  records.push({classUrl:p.classUrl,featureId:feature.id,featureTitle:feature.title,parent:spec.parent,sourceIds:spec.choice?[feature.sourceId]:feature.sourceIds,relationship:spec.relation,optionalReplacement:feature.optionalReplacement||false,...(feature.replacementForObservationId?{replacementForObservationId:feature.replacementForObservationId}:{}),references:refs,evidenceTextSha256:sha(clean(body)),approval:'awaiting-independent-game-design-review',fullRules:'unverified',automation:'not-applied',pending:['complete-statblock-and-scaling','feature-specific-modifications','commands-costs-and-replacement-conditions']});
 }
 return {schemaVersion:1,status:'companion-references-not-runtime-creatures',summary:{features:records.length,references:records.reduce((n,r)=>n+r.references.length,0),uniqueCreaturePages:new Set(records.flatMap(r=>r.references.map(x=>x.pageId))).size,missingIndexPages:[...new Set(records.flatMap(r=>r.references.filter(x=>x.indexStatus==='not-in-bestiary-index').map(x=>x.pageId)))]},records};
}
export function buildCompanionDiscovery(directory){const read=f=>JSON.parse(readFileSync(new URL('../catalog/'+f,import.meta.url)));const variants=read('dndsu-bestiary-variants.json').variants;const index=[...new Map(Object.values(variants).flatMap(v=>v.rows).map(r=>[pageIdentity(r.url).id,r])).values()];return companionDiscovery(directory,[read('dndsu-bard-scope-proposal.json'),read('dndsu-barbarian-scope-proposal.json'),...read('dndsu-reviewed-class-proposals.json').classes],read('dndsu-class-choice-metadata.json').groups.flatMap(g=>g.records),index);}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [,,directory,output]=process.argv;if(!directory||!output)throw Error('Usage: class-html-directory output.json');const result=buildCompanionDiscovery(directory);writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(result.summary);}
