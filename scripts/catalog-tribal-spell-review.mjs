import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export function reconstructTribalSpells(input) {
  if (input.accepted || input.fullRulesVerified || input.automaticPatch || input.canonicalId !== null) throw Error('Unaccepted research boundary required');
  if (input.primaryClaimSpellsPerTribe !== 2 || input.tribes.length !== 11) throw Error('Unexpected primary claim or tribe set');
  const names = new Set();
  const rows = input.tribes.map(tribe => {
    if (!tribe.name || names.has(tribe.name) || tribe.accepted) throw Error('Duplicate tribe or premature acceptance');
    names.add(tribe.name);
    if (!tribe.observedSpells.length || new Set(tribe.observedSpells).size !== tribe.observedSpells.length) throw Error('Invalid observed spell set');
    let spells = [...tribe.observedSpells];
    if (tribe.replaceWith !== null) {
      if (tribe.remove.length || tribe.add.length || !tribe.replaceWith.length) throw Error('Ambiguous replacement');
      spells = [...tribe.replaceWith];
    } else {
      for (const name of tribe.remove) {
        if (!spells.includes(name)) throw Error('Removal not present in observed list');
        spells = spells.filter(spell => spell !== name);
      }
      for (const addition of tribe.add) {
        if (spells.includes(addition.spell) || !spells.includes(addition.before)) throw Error('Invalid anchored insertion');
        spells.splice(spells.indexOf(addition.before), 0, addition.spell);
      }
    }
    if (new Set(spells).size !== spells.length || spells.some(name => typeof name !== 'string' || !name.trim())) throw Error('Invalid reconstructed list');
    for (const name of Object.keys(tribe.primaryOverrides)) if (!spells.includes(name)) throw Error('Override outside reconstructed list');
    return {tribe:tribe.name, observedSpellCount:tribe.observedSpells.length,
      candidateSpells:spells, candidateSpellCount:spells.length,
      countMatchesPrimaryClaim:spells.length === input.primaryClaimSpellsPerTribe,
      primaryOverrides:structuredClone(tribe.primaryOverrides),
      status:spells.length === 2 ? 'count-matches-only-full-primary-list-unverified' : 'count-conflict-needs-primary-list',
      accepted:false, canonicalId:null, automaticDeletion:false, automaticLearn:false};
  });
  for (const restriction of input.secondaryOnlyRestrictions) {
    const tribe = input.tribes.find(x => x.name === restriction.tribe);
    if (!tribe || !tribe.observedSpells.includes(restriction.spell)) throw Error('Secondary restriction has no observed source');
  }
  return {schemaVersion:1,status:'diagnostic-reconstruction-not-canonical-spell-lists',accepted:false,
    summary:{tribes:rows.length,observedSpellEntries:rows.reduce((sum,r)=>sum+r.observedSpellCount,0),
      candidateSpellEntries:rows.reduce((sum,r)=>sum+r.candidateSpellCount,0),
      primaryClaimEntries:rows.length*input.primaryClaimSpellsPerTribe,
      tribesWithCountConflict:rows.filter(r=>!r.countMatchesPrimaryClaim).map(r=>r.tribe)},
    unresolvedChoice:'Do not choose a spell to remove merely to meet the advertised count.',rows};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path='catalog/skt-tribal-spell-reconstruction-2014.json';
  const raw=readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const report=reconstructTribalSpells(JSON.parse(raw));
  report.inputSha256={[path]:createHash('sha256').update(raw).digest('hex')};
  writeFileSync(process.argv[2]||new URL('../catalog/skt-tribal-spell-review-2014.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report.summary));
}
