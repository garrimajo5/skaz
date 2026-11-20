import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {decode} from './catalog-additional-discovery.mjs';
const clean=s=>decode(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
// These are explicit content-review selections, not rules inferred from arbitrary prose.
export const changeSpecs=[
 [88,'class-features','ИСПОЛЬЗОВАНИЕ ЗАКЛИНАНИЙ','bard','replace-one-known-on-class-level'],
 [97,'class-features','Использование заклинаний','ranger','replace-one-known-on-class-level'],
 [101,'class-features','Использование заклинаний','sorcerer','replace-one-known-on-class-level'],
 [104,'class-features','МАГИЯ ДОГОВОРА','warlock','replace-one-known-on-class-level'],
 [89,'features','Использование заклинаний','cleric','change-prepared-after-long-rest'],
 [90,'class-features','Использование заклинаний','druid','change-prepared-after-long-rest'],
 [94,'klassovye_umeniya','Использование заклинаний','paladin','change-prepared-after-long-rest'],
 [105,"class-features","Использование заклинаний","wizard","change-prepared-after-long-rest"],
 [137,"class-features","Использование заклинаний","artificer","change-prepared-after-long-rest"],
 [105,'class-features','Формулы заговоров','wizard','optional-replace-one-cantrip-after-long-rest']
];
export function spellChangeProposal(html,feature,{classUrl,classKey,policy}){
 if(!changeSpecs.some(s=>s[4]===policy))throw Error('Unknown reviewed policy');
 html=html.replace(/<!--[\s\S]*?-->/g,'');const start=html.indexOf('class="card__body new-article"'),end=html.indexOf('<div class="card__footer"');if(start<0||end<=start)throw Error('Missing class article');html=html.slice(start,end);
 const heads=[...html.matchAll(/<h([234])\b[^>]*>([\s\S]*?)<\/h\1>/g)].filter(h=>clean(h[2])),h=heads[feature.headingOrdinal-1];if(!h||clean(h[2])!==feature.title)throw Error('Stale change-policy heading');const next=heads.find(n=>n.index>h.index&&Number(n[1])<=Number(h[1]));let body=html.slice(h.index+h[0].length,next?.index),continuationContext=null;
 if(policy==='change-prepared-after-long-rest'&&['wizard','artificer'].includes(classKey)){
  const title=classKey==='wizard'?'ВАША КНИГА ЗАКЛИНАНИЙ':'МАГИЯ ИЗОБРЕТЕНИЙ';
  if(!next||Number(next[1])!==3||clean(next[2])!==title)throw Error('Changed preparation continuation');
  const finish=heads.find(n=>n.index>next.index&&Number(n[1])<=3);
  body=html.slice(next.index+next[0].length,finish?.index);continuationContext={title,headingOrdinal:heads.indexOf(next)+1,basis:'explicit-reviewed-continuation-after-spellcasting'};
 }
 const prepared=policy==='change-prepared-after-long-rest',cantrip=policy==='optional-replace-one-cantrip-after-long-rest';
 const paragraphs=[...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(m=>clean(m[1])).filter(t=>prepared?/изменить (?:свой )?список подготовленных/iu.test(t):cantrip?/заменить один известный вам заговор/iu.test(t):/заменить/iu.test(t)&&/уровень в этом классе/iu.test(t));if(paragraphs.length!==1)throw Error('Missing or ambiguous change-policy evidence');const text=paragraphs[0];
 if(prepared&&(!/продолжительный отдых/iu.test(text)||!/1 минуты (?:за|на) уровень заклинания/iu.test(text)))throw Error('Changed preparation condition');
 if(prepared&&classKey==='wizard'&&!/изучении книги заклинаний/iu.test(text))throw Error('Changed spellbook preparation condition');
 if(cantrip&&(!/продолжительный отдых/iu.test(text)||!/книге заклинаний/iu.test(text)||!feature.sourceIds.includes('117')))throw Error('Changed optional cantrip condition');
 if(!prepared&&!cantrip&&(!/одно из известных/iu.test(text)||!/ячее?й?к/iu.test(text)))throw Error('Changed known-spell condition');
 return {featureId:feature.id,classUrl,classKey,featureTitle:feature.title,sourceIds:feature.sourceIds,continuationContext,policy,trigger:prepared||cantrip?'after-long-rest':'gain-level-in-this-class',optionalFeature:cantrip,selection:prepared?'new-prepared-list':'at-most-one-replacement',resource:prepared?'prepared-spells':cantrip?'known-cantrips':'known-spells',spellList:classKey,requiresSpellbook:cantrip||(prepared&&classKey==='wizard'),selectionPool:prepared&&classKey==='wizard'?'spellbook':'class-spell-list',preparationMinutesPerSpellLevel:prepared?1:null,evidenceTextSha256:createHash('sha256').update(text).digest('hex'),automation:'not-applied',fullRules:'unverified',approval:'awaiting-independent-game-design-review',pending:['eligibility-and-available-spell-levels','multiclass-rules','subclass-grants-and-exceptions','complete-conditions']};
}
export function buildSpellChangeProposals(directory){const read=f=>JSON.parse(readFileSync(new URL('../catalog/'+f,import.meta.url))),proposals=[read('dndsu-bard-scope-proposal.json'),...read('dndsu-reviewed-class-proposals.json').classes];const records=changeSpecs.map(([id,parent,title,classKey,policy])=>{const p=proposals.find(p=>p.classUrl.includes('/'+id+'-'));const fs=p.records.filter(r=>r.parent===parent&&r.title===title);if(fs.length!==1)throw Error('Ambiguous change-policy feature');return spellChangeProposal(readFileSync(directory+'/class-'+id+'.html','utf8'),fs[0],{classUrl:p.classUrl,classKey,policy});});return {schemaVersion:1,status:'partial-spell-change-policy-proposals',summary:{policies:records.length,classLevelReplacement:records.filter(r=>r.trigger==='gain-level-in-this-class').length,longRestPreparation:records.filter(r=>r.resource==='prepared-spells').length,optionalCantripReplacement:records.filter(r=>r.optionalFeature).length},records};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(!process.argv[2]||!process.argv[3])throw Error('Usage: class-directory output.json');const r=buildSpellChangeProposals(process.argv[2]);writeFileSync(process.argv[3],JSON.stringify(r,null,2)+'\n');console.log(r.summary);}
