import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {buildCorrectedNameReview} from './catalog-corrected-name-review.mjs';
import {buildM0ExitReview} from './catalog-m0-exit-review.mjs';
import {reviewObservedNames} from './catalog-observed-name-review.mjs';
export const inputPaths=['catalog/scope-register-2014.json','catalog/baldur-background-name-corrections-2014.json','catalog/numeric-source-scope-policy-2014.json','catalog/background-adaptation-page-review-2014.json','catalog/source-bibliography-evidence.json','catalog/named-race-source-policy-2014.json'];
export function buildEffectiveM0Review(texts){
 if(texts.length!==inputPaths.length)throw Error('Incomplete effective-review input set');
 const [scope,,numericPolicy,background,bibliography,namedPolicy]=texts.map(JSON.parse);
 const correctionReview=buildCorrectedNameReview(...texts.slice(0,4));
 const effective=structuredClone(scope),byId=new Map(effective.records.map(p=>[p.id,p]));
 for(const c of correctionReview.corrections)byId.get(c.observationId).names.en=c.effectiveEnglishName;
 const result=buildM0ExitReview(effective,numericPolicy,reviewObservedNames(effective),background,{bibliography,policy:namedPolicy});
 result.status='effective-m0-review-with-explicit-overlays-not-catalog-acceptance';
 result.overlayBasis={nameCorrections:correctionReview.corrections.map(c=>c.observationId),namedPublicationDecisions:namedPolicy.records.map(r=>r.observationId),mixedScriptNameProposalsApplied:false,demonIdentitiesAccepted:false,originalSnapshotChanged:false};
 result.inputSha256=Object.fromEntries(inputPaths.map((p,i)=>[p,createHash('sha256').update(texts[i].replace(/\r\n/g,'\n')).digest('hex')]));
 result.limitations.push('This explicit research view combines thirteen proposed name corrections with three named-publication decisions; historical reports retain their original bases.','Mixed-script name evidence and demon source witnesses are not accepted identity assignments or automatically applied corrections.');
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=buildEffectiveM0Review(inputPaths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8')));
 writeFileSync(process.argv[2]||new URL('../catalog/effective-m0-review-2014.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.summary));
}
