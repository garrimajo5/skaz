import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {companionStatblock} from './catalog-companion-statblocks.mjs';
import {decode} from './catalog-additional-discovery.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const same=isDeepStrictEqual;
const expected=new Map([[5962,'Archelon'],[5963,'Brachiosaurus'],[5965,'Dilophosaurus'],[5966,'Giganotosaurus'],[5970,'Mosasaurus'],[5971,'Nemicolopterus']].map(([id,name])=>['dndsu:bestiary:'+id,name]));
export const alPreviewPaths=['catalog/al-preview-version-evidence-2014.json','catalog/scope-register-2014.json','catalog/adventurers-league-publication-candidates-2014.json'];

export function selectedAlPreviewFields(html,pageId,sources){
 const parsed=companionStatblock(html,{pageId,sources});
 const hp=parsed.fields.hitPoints.raw.match(/^(\d+)\s*\(\s*(\d+)\s*к\s*(\d+)\s*([+-])\s*(\d+)\s*\)$/);
 const ac=parsed.fields.armorClass.raw.match(/^(\d+)(?:\s|$)/);
 if(!hp||!ac)throw Error('Unsupported selected stat shape');
 const selected={armorClass:Number(ac[1]),hitPoints:Number(hp[1]),hitDice:{count:Number(hp[2]),die:Number(hp[3]),modifier:Number(hp[5])*(hp[4]==='-'?-1:1)},abilities:parsed.abilities.map(a=>a.score)};
 if(pageId==='dndsu:bestiary:5963'){
  const body=html.slice(html.indexOf('class="card__body new-article"'),html.indexOf('<div class="card__footer"'));
  const paragraphs=[...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(m=>decode(m[1].replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim());
  const attacks=paragraphs.filter(p=>/^Топот\s*\./.test(p));
  const bonus=attacks.length===1&&attacks[0].match(/оружием:\s*\+(\d+)/);
  if(!bonus)throw Error('Missing or ambiguous stomp attack');selected.stompAttackBonus=Number(bonus[1]);
 }
 return {name:parsed.name,sourceIds:parsed.sourceIds,selected};
}

function validateFields(fields,hasStomp){
 const keys=['armorClass','hitPoints','hitDice','abilities',...(hasStomp?['stompAttackBonus']:[])];
 if(!same(Object.keys(fields).sort(),keys.sort())||!Number.isSafeInteger(fields.armorClass)||fields.armorClass<0||!Number.isSafeInteger(fields.hitPoints)||fields.hitPoints<1||!Array.isArray(fields.abilities)||fields.abilities.length!==6||fields.abilities.some(n=>!Number.isSafeInteger(n)||n<1||n>30))throw Error('Invalid selected fields');
 const d=fields.hitDice;
 if(!d||!same(Object.keys(d).sort(),['count','die','modifier'])||!Number.isSafeInteger(d.count)||d.count<1||![4,6,8,10,12,20].includes(d.die)||!Number.isSafeInteger(d.modifier))throw Error('Invalid hit dice');
 if(hasStomp&&(!Number.isSafeInteger(fields.stompAttackBonus)||fields.stompAttackBonus<0))throw Error('Invalid stomp bonus');
}

export function reviewAlPreview(manifest,scope,publications){
 if(manifest.schemaVersion!==1||manifest.accepted!==false||manifest.complete!==false||manifest.approvedDenominator!==null||manifest.automaticPatch!==false||manifest.rulesEdition!=='5e-2014')throw Error('Promoted evidence boundary');
 const primary=manifest.primaryEvidence,publication=publications.publications.find(p=>p.id===primary.publicationId);
 if(!publication||primary.publicationId!=='DDHC-TOA-3'||primary.url!==publication.evidenceUrl||primary.pages!==4||!/^[a-f0-9]{64}$/.test(primary.sha256)||primary.reusePermission!=='not-established'||primary.publisherStatus!==publication.publisherStatus)throw Error('Primary evidence boundary changed');
 const seen=new Set(),rows=[];
 for(const record of manifest.records){
  const original=scope.records.find(r=>r.id===record.observationId),name=expected.get(record.observationId);
  if(!original||!name||seen.has(record.observationId)||record.name!==name||original.names.en!==name||original.section!=='bestiary'||!same(original.sourceIds,['169'])||record.secondary.url!==original.url||!same(record.secondary.sourceIds,original.sourceIds)||!/^[a-f0-9]{64}$/.test(record.secondary.sha256))throw Error('Observation identity changed');
  if(record.accepted!==false||record.fullRulesVerified!==false||record.wholeStatBlockCompared!==false||record.canonicalId!==null||record.exactPrinting!=='unverified'||record.automaticPatch!==false||record.primary.visualVerified!==true)throw Error('Partial comparison promoted');
  const pdfPage=record.observationId.endsWith(':5966')?3:['dndsu:bestiary:5970','dndsu:bestiary:5971'].includes(record.observationId)?4:2;
  if(record.primary.pdfPage!==pdfPage||record.primary.printedPage!==pdfPage+1)throw Error('Primary locator changed');
  if(!publication.units.some(u=>u.name===name&&u.section==='bestiary'))throw Error('Unlinked primary name');
  const stomp=name==='Brachiosaurus';validateFields(record.primary.selected,stomp);validateFields(record.secondary.selected,stomp);
  const differences=Object.keys(record.primary.selected).filter(k=>!same(record.primary.selected[k],record.secondary.selected[k])).map(field=>({field,primary:record.primary.selected[field],secondary:record.secondary.selected[field]}));
  const averageWarnings=[];
  for(const side of ['primary','secondary']){
   const f=record[side].selected,average=Math.floor(f.hitDice.count*(f.hitDice.die+1)/2+f.hitDice.modifier);
   if(average!==f.hitPoints)averageWarnings.push({side,printedHitPoints:f.hitPoints,computedDiceAverage:average,action:'retain-source-observation-no-patch'});
  }
  rows.push({observationId:record.observationId,name,differences,averageWarnings,result:differences.length?'selected-field-differences':'selected-fields-match-not-full-equivalence',accepted:false,canonicalId:null,automaticPatch:false,fullRulesVerified:false});seen.add(record.observationId);
 }
 if(seen.size!==expected.size)throw Error('Incomplete selected preview coverage');
 return {schemaVersion:1,status:'selected-preview-comparison-not-version-acceptance',accepted:false,complete:false,automaticPatch:false,approvedDenominator:null,summary:{observations:rows.length,withDifferences:rows.filter(r=>r.differences.length).length,differingFields:rows.reduce((n,r)=>n+r.differences.length,0),diceAverageWarnings:rows.reduce((n,r)=>n+r.averageWarnings.length,0)},rows};
}

export function verifyAlPreviewCaptures(manifest,sources,captures){
 if(sha(captures.get('primary.pdf')??'')!==manifest.primaryEvidence.sha256)throw Error('Changed primary capture');
 for(const record of manifest.records){
  const bytes=captures.get(record.observationId);
  if(!bytes||sha(bytes)!==record.secondary.sha256)throw Error('Changed secondary capture');
  const parsed=selectedAlPreviewFields(bytes.toString('utf8'),record.observationId,sources);
  if(!parsed.name.endsWith('['+record.name+']')||!same(parsed.sourceIds,record.secondary.sourceIds)||!same(parsed.selected,record.secondary.selected))throw Error('Secondary selected evidence changed');
 }
 return {verifiedSecondaryCaptures:manifest.records.length,primaryHashVerified:true,primaryManualTranscription:'requires-visual-review'};
}

export function alPreviewReview(){
 const raw=alPreviewPaths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n'));
 const result=reviewAlPreview(...raw.map(JSON.parse));
 result.inputSha256=Object.fromEntries(alPreviewPaths.map((p,i)=>[p,sha(raw[i])]));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=alPreviewReview();writeFileSync(process.argv[2]||new URL('../catalog/al-preview-version-review-2014.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(result.summary);}
