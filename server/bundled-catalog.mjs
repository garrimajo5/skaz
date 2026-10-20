import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {AppError} from './state.mjs';

// Explicit allowlist: personal files and coverage manifests are never imported.
const files=['references.json','srd51-spells.json','srd51-utility-spells.json','srd51-cantrips.json','srd51-level-one-support.json','srd51-level-one-combat.json','srd51-level-one-exploration.json','srd51-level-two.json','srd51-level-three.json','srd51-level-four.json','srd51-level-five-support.json','srd51-level-five.json','srd51-level-six.json','srd51-level-seven.json','srd51-level-eight.json','srd51-level-nine.json','srd51-elementals.json','srd51-created-undead.json','srd51-humanoid-encounters.json','srd51-encounter-threats.json','srd51-stone-encounters.json','srd51-dungeon-encounters.json','srd51-dungeon-crawlers.json','srd51-oozes.json','srd51-forest.json','srd51-animated-objects.json','srd51-utility-constructs.json','srd51-golems.json','srd51-shadow-undead.json','srd51-spirits.json','srd51-undead-variants.json','srd51-undead-elites.json','srd51-undead-rulers.json','srd51-common-npcs.json','srd51-npc-roles.json','srd51-npc-leaders.json','srd51-npc-casters.json','srd51-npc-specialists.json','srd51-celestials.json','srd51-equipment-rules.json','srd51-protective-items.json','srd51-wands.json','srd51-wonder.json','srd51-exploration.json','srd51-items.json','srd51-travel-items.json','srd51-monsters.json','srd51-encounter-monsters.json','srd51-familiar-forms.json','srd51-steeds.json','srd51-summoned-forms.json','srd51-conditions.json','srd51-core-rules.json','srd51-combat-rules.json','srd51-artifacts.json'];
export function bundledCatalog() {
  const bundle={schemaVersion:1,entries:files.flatMap(file=>JSON.parse(readFileSync(new URL('../catalog/'+file,import.meta.url),'utf8')).entries)};
  const upgrades=JSON.parse(readFileSync(new URL('../catalog/bundled-upgrades.json',import.meta.url),'utf8'));
  if(!Array.isArray(upgrades)||upgrades.some(rule=>!rule||Object.keys(rule).sort().join(',')!=='fromSha256,id,reason,toSha256'||typeof rule.id!=='string'||typeof rule.reason!=='string'||!rule.reason.trim()||rule.reason.length>1000||![rule.fromSha256,rule.toSha256].every(hash=>typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash))||rule.fromSha256===rule.toSha256))throw new AppError(500,'Неверный список обновлений подборки');
  const version=createHash('sha256').update(JSON.stringify({bundle,upgrades})).digest('hex');
  const categories=Object.fromEntries(['mechanic','spell','monster','item','artifact'].map(kind=>[kind,bundle.entries.filter(e=>e.kind===kind).length]));
  return {bundle,version,categories,upgrades};
}
export function validateBundledInstall(request,version) {
  if(!request || typeof request!=='object' || Array.isArray(request) || Object.keys(request).length!==1 || typeof request.version!=='string')throw new AppError(422,'Нужна версия просмотренной подборки');
  if(request.version!==version)throw new AppError(409,'Подборка обновилась. Открой предпросмотр заново.');
}
