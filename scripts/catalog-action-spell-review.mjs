import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const explicitSpellings = new Map([
  ['Mordenkainen’s sword', {id:'dndsu:spells:166',observedName:"Mordenkainen's sword"}],
  ['Otiluke’s resilient sphere', {id:'dndsu:spells:216',observedName:"Otiluke's resilient sphere"}],
]);
export function reviewActionSpellReferences(primary,scope) {
  if(primary.accepted||primary.fullRulesVerified||primary.automaticPatch||primary.approvedDenominator!==null)throw Error('Unaccepted evidence required');
  const observations=new Map();
  for(const row of scope.records){if(!row.id||observations.has(row.id))throw Error('Duplicate observation identity');observations.set(row.id,row);}
  const units=new Set();const records=[];
  for(const action of primary.actions){
    if(!action.unitId||units.has(action.unitId)||action.canonicalId!==null||action.wholeStatBlockCompared)throw Error('Invalid action identity');
    units.add(action.unitId);const seen=new Set();
    for(const group of action.groups){
      if(!['At will','1/day each','2/day each','not-stated'].includes(group.frequency))throw Error('Unknown frequency scope');
      for(const spell of group.spells){
        if(!spell.name||seen.has(spell.name))throw Error('Duplicate spell in one action');seen.add(spell.name);
        const candidates=scope.records.filter(r=>r.section==='spells'&&typeof r.names?.en==='string'&&r.names.en.toLowerCase()===spell.name.toLowerCase()).map(r=>({observationId:r.id,observedName:r.names.en,originalSourceIds:[...r.sourceIds],match:r.names.en===spell.name?'exact-name':'capitalization-only-name-candidate'}));
        const explicit=explicitSpellings.get(spell.name);
        if(explicit){const row=observations.get(explicit.id);if(!row||row.section!=='spells'||row.names.en!==explicit.observedName||candidates.some(c=>c.observationId===row.id))throw Error('Pinned explicit spelling changed');candidates.push({observationId:row.id,observedName:row.names.en,originalSourceIds:[...row.sourceIds],match:'explicit-apostrophe-spelling-candidate'});}
        records.push({actionId:action.unitId,actor:action.actor,spellName:spell.name,frequency:group.frequency,
          actionLocalOverride:spell.override===null?null:structuredClone(spell.override),candidates,
          status:candidates.length===1?'name-linked-full-spell-version-unverified':candidates.length?'multiple-versions-need-review':'no-name-candidate',
          canonicalSpellId:null,accepted:false,automaticLearn:false,automaticPrepare:false,automaticResourceCreation:false,baseSpellOverride:false});
      }
    }
  }
  return {schemaVersion:1,status:'action-spell-name-references-not-automation',accepted:false,summary:{actions:units.size,spellEntries:records.length,distinctSpellNames:new Set(records.map(r=>r.spellName)).size,entriesWithOneCandidate:records.filter(r=>r.candidates.length===1).length,unresolvedEntries:records.filter(r=>r.candidates.length!==1).length},records};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const paths=['catalog/skt-spellcasting-action-evidence-2014.json','catalog/scope-register-2014.json'];
 const raw=paths.map(p=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(readFileSync(new URL('../'+p,import.meta.url))).replace(/\r\n/g,'\n'));
 const data=raw.map(JSON.parse);
 if(data[0].inputSha256[paths[1]]!==createHash('sha256').update(raw[1]).digest('hex'))throw Error('Pinned scope changed');
 const report=reviewActionSpellReferences(...data);report.inputSha256=Object.fromEntries(paths.map((p,i)=>[p,createHash('sha256').update(raw[i]).digest('hex')]));
 writeFileSync(process.argv[2]||new URL('../catalog/skt-action-spell-references-2014.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));
}
