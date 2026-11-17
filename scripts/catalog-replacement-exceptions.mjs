import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {decode} from './catalog-additional-discovery.mjs';
const clean=s=>decode(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
export const officialEvidence={url:'https://media.wizards.com/2018/dnd/downloads/PH-Errata.pdf',document:'Errata: Player’s Handbook',version:'2.0.2',copyrightYear:2020,pdfPage:1,reviewedOn:'2026-11-17',method:'manual-review-of-publisher-PDF',replacementOriginLevels:[3,8,14,20]};
export function replacementExceptionAudit(html,feature,{classUrl,bookPage}){
 html=html.replace(/<!--[\s\S]*?-->/g,'');const start=html.indexOf('class="card__body new-article"'),end=html.indexOf('<div class="card__footer"');if(start<0||end<=start)throw Error('Missing class article');html=html.slice(start,end);
 const heads=[...html.matchAll(/<h([234])\b[^>]*>([\s\S]*?)<\/h\1>/g)].filter(h=>clean(h[2])),h=heads[feature.headingOrdinal-1];if(!h||clean(h[2])!==feature.title)throw Error('Stale replacement heading');
 const next=heads.find(n=>n.index>h.index&&Number(n[1])<=Number(h[1]));const body=html.slice(h.index+h[0].length,next?.index);
 const paragraphs=[...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(m=>clean(m[1])).filter(t=>/замен/iu.test(t)&&/школ/iu.test(t)&&/20/iu.test(t));if(paragraphs.length!==1)throw Error('Missing or ambiguous replacement paragraph');
 const text=paragraphs[0],exception=text.match(/(?:кроме|исключени|за исключением|если только)[\s\S]*$/iu)?.[0];if(!exception)throw Error('Missing exception clause');const levels=[...exception.matchAll(/\d+/g)].map(m=>Number(m[0]));if(!levels.length||new Set(levels).size!==levels.length||levels.some(n=>n<1||n>20))throw Error('Invalid origin levels');
 return {featureId:feature.id,classUrl,featureTitle:feature.title,parent:feature.parent,sourceIds:feature.sourceIds,referenceParagraphSha256:createHash('sha256').update(text).digest('hex'),referenceOriginLevels:levels,publisherEvidence:{...officialEvidence,bookPage},missingFromReference:officialEvidence.replacementOriginLevels.filter(n=>!levels.includes(n)),unexpectedInReference:levels.filter(n=>!officialEvidence.replacementOriginLevels.includes(n)),status:JSON.stringify(levels)===JSON.stringify(officialEvidence.replacementOriginLevels)?'matches-publisher-erratum':'source-discrepancy-needs-review',proposal:'Track the origin of the replaced spell; current character level alone does not establish the school exception.',approval:'awaiting-independent-game-design-review',automation:'not-applied',fullRules:'unverified'};
}
export function buildReplacementExceptionAudit(directory){
 const proposals=JSON.parse(readFileSync(new URL('../catalog/dndsu-reviewed-class-proposals.json',import.meta.url))).classes;
 const records=[[91,'archetype.eldritch-knigh',75],[99,'archetype.arcane-trickster',98]].map(([id,parent,bookPage])=>{const p=proposals.find(p=>p.classUrl.includes('/'+id+'-'));const fs=p.records.filter(r=>r.parent===parent&&r.title==='ИСПОЛЬЗОВАНИЕ ЗАКЛИНАНИЙ');if(fs.length!==1)throw Error('Ambiguous spellcasting feature');return replacementExceptionAudit(readFileSync(directory+'/class-'+id+'.html','utf8'),fs[0],{classUrl:p.classUrl,bookPage});});
 return {schemaVersion:1,status:'two-reviewed-replacement-exceptions-not-full-replacement-rules',summary:{features:records.length,sourceDiscrepancies:records.filter(r=>r.status==='source-discrepancy-needs-review').length},records};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(!process.argv[2]||!process.argv[3])throw Error('Usage: class-directory output.json');const result=buildReplacementExceptionAudit(process.argv[2]);writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n');console.log(result.summary);}
