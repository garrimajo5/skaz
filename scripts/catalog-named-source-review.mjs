import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {buildSourceReviewQueue} from './catalog-source-review-queue.mjs';
const expected=new Map([
 ['dndsu:race:169',{bibliographyId:'bibliography:one-grung-above',title:'One Grung Above',disposition:'needs-official-rules-status-review'}],
 ['dndsu:race:178',{bibliographyId:'bibliography:locathah-rising',title:'Locathah Rising',disposition:'eligible-publication-records-need-review'}],
 ['dndsu:race:184',{bibliographyId:'bibliography:the-tortle-package',title:'The Tortle Package',disposition:'eligible-publication-records-need-review'}],
]);
export function buildNamedSourceReview(scope,numericPolicy,bibliography,namedPolicy){
 const base=buildSourceReviewQueue(scope,numericPolicy),effective=structuredClone(base);
 if(namedPolicy.schemaVersion!==1||namedPolicy.policy!=='official-wotc-2014-named-race-publications'||namedPolicy.complete!==false||namedPolicy.approvedDenominator!==null||namedPolicy.records.length!==3)throw Error('Unexpected named-source policy boundary');
 const pages=new Map(scope.records.map(p=>[p.id,p])),bib=new Map();
 for(const row of bibliography.records){if(bib.has(row.id))throw Error('Duplicate bibliography identity');bib.set(row.id,row);}
 const seen=new Set(),decisions=[];
 for(const row of namedPolicy.records){
  const definition=expected.get(row.observationId),page=pages.get(row.observationId),source=bib.get(row.bibliographyId);
  if(!definition||!page||!source||seen.has(row.observationId))throw Error('Unmapped or duplicate named-source observation');seen.add(row.observationId);
  if(row.bibliographyId!==definition.bibliographyId||row.title!==definition.title||source.title!==row.title||page.sourceTitle!==row.title||page.bibliographyEvidenceId!==row.bibliographyId||page.url!==row.observationUrl)throw Error('Named-source attribution mismatch');
  if(page.section!=='race'||page.inclusion!=='needs-source-review'||page.sourceIds.length||row.numericDndsuSourceId!==null||source.numericDndsuSourceId!==null)throw Error('Named-source policy must not replace numeric evidence');
  if(source.publisher!=='Wizards of the Coast'||row.publisher!==source.publisher||row.publisherEvidenceUrl!==source.publisherEvidenceUrl||row.disposition!==definition.disposition)throw Error('Publication status mismatch');
  if(row.exactTextVersion!=='unverified'||row.reusePermission!=='not-established'||row.canonicalId!==null||row.fullRulesVerified!==false)throw Error('Publication decision promoted to rule acceptance');
  if(!Number.isInteger(row.originalEraEvidence.year)||row.originalEraEvidence.year<2014||row.originalEraEvidence.year>=2024||!row.originalEraEvidence.url.startsWith('https://'))throw Error('Missing 2014-era evidence');
  const origin='needs-source-identification',target=row.disposition==='eligible-publication-records-need-review'?'ready-for-version-and-rights-review':origin;
  if(!base.pageGroups[origin].includes(page.id))throw Error('Unexpected prior routing');
  if(target!==origin){effective.pageGroups[origin]=effective.pageGroups[origin].filter(id=>id!==page.id);effective.pageGroups[target].push(page.id);}
  decisions.push({observationId:page.id,bibliographyId:row.bibliographyId,title:row.title,originalSourceIds:[],from:origin,to:target,disposition:row.disposition,canonicalId:null,fullRulesVerified:false,reusePermission:'not-established'});
 }
 const all=Object.values(effective.pageGroups).flat();
 if(all.length!==scope.records.length||new Set(all).size!==scope.records.length)throw Error('Observation partition changed');
 for(const [group,ids] of Object.entries(effective.pageGroups))effective.summary.byDisposition[group]=ids.length;
 return {schemaVersion:1,status:'named-publication-review-routing-not-catalog-acceptance',complete:false,approvedDenominator:null,originalSummary:base.summary,summary:effective.summary,pageGroups:effective.pageGroups,namedSourceDecisions:decisions,sourceReviewPriority:base.sourceReviewPriority,
 limitations:['Only exact named bibliography links are considered; numeric source IDs are never fabricated.','Two eligible publications do not certify their race text, version, rights or canonical identity.','Grung remains pending official-rules-status review, not automatically excluded by AL restrictions.','Original observations and numeric-source routing artifacts are preserved.','Source eligibility is separate from name correction and canonical unit counting.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const paths=['catalog/scope-register-2014.json','catalog/numeric-source-scope-policy-2014.json','catalog/source-bibliography-evidence.json','catalog/named-race-source-policy-2014.json'];
 const raw=paths.map(p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n'));
 const result=buildNamedSourceReview(...raw.map(JSON.parse));result.inputSha256=Object.fromEntries(paths.map((p,i)=>[p,createHash('sha256').update(raw[i]).digest('hex')]));
 writeFileSync(process.argv[2]||new URL('../catalog/named-source-review-2014.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({before:result.originalSummary.byDisposition,after:result.summary.byDisposition}));
}
