import {createHash} from 'node:crypto';
export const materialSourceSha256='2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0';
export const digest=value=>createHash('sha256').update(value).digest('hex');
const fail=message=>{throw new Error(message);};
function exact(value,keys,label){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))fail(`Invalid ${label}`);}
function text(value,max=1000){if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>max)fail('Invalid material text');}
export function validateMaterials(value){
 exact(value,['description','price','consumption','note'],'materials');text(value.description);text(value.note);
 exact(value.price,['kind','text'],'material price');
 if(!['unknown','not-stated','stated'].includes(value.price.kind))fail('Invalid price kind');
 if(value.price.kind==='stated')text(value.price.text);else if(value.price.text!==undefined)fail('Unknown or unstated price cannot claim a value');
 exact(value.consumption,['kind','text'],'material consumption');
 if(!['unknown','retained','consumed','partial','conditional'].includes(value.consumption.kind))fail('Invalid consumption kind');
 if(value.consumption.kind==='unknown'){if(value.consumption.text!==undefined)fail('Unknown consumption cannot claim a rule');}
 else text(value.consumption.text);
 return structuredClone(value);
}
export function validateMaterialProposal(proposal,catalog,source){
 exact(proposal,['schemaVersion','kind','ruleset','status','source','scope','entries'],'proposal');
 if(proposal.schemaVersion!==1||proposal.kind!=='spell-material-reference-proposal'||proposal.ruleset!=='5e-2014'||proposal.status!=='review')fail('Not a review proposal');
 exact(proposal.source,['url','sha256','license','attribution','changes','materialRulePage'],'source');
 if(proposal.source.url!=='https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf'||proposal.source.sha256!==materialSourceSha256||proposal.source.license!=='CC-BY-4.0'||proposal.source.materialRulePage!==102)fail('Unpinned source');
 text(proposal.source.attribution,2000);text(proposal.source.changes,2000);
 exact(proposal.scope,['catalogSpellCount','reviewedCount','complete'],'scope');
 const spells=catalog.filter(e=>e.kind==='spell'),byId=new Map(spells.map(e=>[e.id,e]));
 if(!Array.isArray(proposal.entries)||!proposal.entries.length||proposal.entries.length>1000||proposal.scope.reviewedCount!==proposal.entries.length||proposal.scope.catalogSpellCount!==spells.length||proposal.scope.complete!==false)fail('Invalid partial coverage');
 if(source&&(source.sourceSha256!==materialSourceSha256||source.sourceUrl!==proposal.source.url||!Array.isArray(source.entries)))fail('Unpinned review extraction');
 const seen=new Set();
 for(const row of proposal.entries){
  exact(row,['id','name','entrySha256','sourcePages','sourceBodySha256','checkedOn','materials'],'entry');
  const entry=byId.get(row.id);
  if(!entry||seen.has(row.id)||entry.ruleset!=='5e-2014'||!entry.spell?.components.includes('M'))fail('Missing, duplicate or non-material spell');
  seen.add(row.id);
  if(JSON.stringify(entry.name)!==JSON.stringify(row.name)||digest(JSON.stringify(entry))!==row.entrySha256)fail('Catalog entry changed: '+row.id);
  if(!/^[a-f0-9]{64}$/.test(row.sourceBodySha256)||!/^\d{4}-\d{2}-\d{2}$/.test(row.checkedOn))fail('Invalid review provenance');
  if(!Array.isArray(row.sourcePages)||!row.sourcePages.length||new Set(row.sourcePages).size!==row.sourcePages.length||row.sourcePages.some(p=>!Number.isInteger(p)||p<114||p>194))fail('Invalid source pages');
  validateMaterials(row.materials);
  if(source){const original=source.entries.filter(e=>e.id===row.id);if(original.length!==1||digest(original[0].body)!==row.sourceBodySha256||JSON.stringify(original[0].pages)!==JSON.stringify(row.sourcePages))fail('Review text changed: '+row.id);}
 }
 return {proposal:true,installed:false,reviewed:seen.size,total:spells.length,remaining:spells.length-seen.size,materialTotal:spells.filter(e=>e.spell?.components.includes('M')).length,unreviewedMaterials:spells.filter(e=>e.spell?.components.includes('M')&&!seen.has(e.id)).length,sourceBodiesCompared:Boolean(source)};
}
