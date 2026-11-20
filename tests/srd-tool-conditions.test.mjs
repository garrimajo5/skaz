import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const manifest=JSON.parse(read('catalog/srd51-tool-conditions-2014.json'));
const identitiesPath='catalog/equipment-identity-reconciliation.json';
const identities=JSON.parse(read(identitiesPath));
const rule=suffix=>manifest.records.find(r=>r.proposalId==='srd51:2014:tool-rule:'+suffix);

test('tool rules link35 unique existing SRD identities without adding Basic Rules examples',()=>{
 assert.equal(manifest.ruleset,'5e-2014');
 assert.equal(manifest.records.length,9);
 assert.equal(new Set(manifest.records.map(r=>r.proposalId)).size,9);
 assert.deepEqual(manifest.inputSha256,{[identitiesPath]:createHash('sha256').update(read(identitiesPath)).digest('hex')});
 const links=manifest.records.flatMap(r=>r.candidateItemIds);
 assert.equal(links.length,35);assert.equal(new Set(links).size,35);
 for(const id of links){
  assert.match(id,/^srd51:2014:item:/);
  assert.equal(identities.records.filter(r=>r.proposedCanonicalId===id).length,1);
 }
 assert.equal(rule('artisan-tools').candidateItemIds.length,17);
 assert.equal(rule('gaming-set').candidateItemIds.length,2);
 assert.equal(rule('musical-instrument').candidateItemIds.length,10);
 assert.ok(!links.some(id=>/dragonchess|three-dragon/.test(id)));
});

test('proficiency does not force an ability, grant success or share proficiency across types',()=>{
 assert.equal(manifest.generalRule.ability,'task-dependent');
 assert.equal(manifest.generalRule.automaticAbility,'none');
 assert.equal(manifest.generalRule.automaticSuccess,false);
 assert.equal(manifest.generalRule.automaticProficiencyGrant,false);
 for(const id of ['artisan-tools','gaming-set','musical-instrument']) assert.equal(rule(id).separateProficiencyPerType,true);
 assert.equal(manifest.applicationBoundary.ruleDeviation,'warn-and-allow-manual-override');
 assert.equal(manifest.applicationBoundary.automaticBonusApplication,false);
 assert.equal(manifest.applicationBoundary.automaticInventoryGrant,false);
 assert.equal(manifest.applicationBoundary.automaticResourceSpend,false);
 assert.equal(manifest.accepted,false);assert.equal(manifest.complete,false);assert.equal(manifest.approvedDenominator,null);
 assert.ok(manifest.records.every(r=>r.accepted===false&&r.runtimeImported===false&&r.proficiencyCheck&&[70,71].includes(r.sourcePage)));
});

test('herbal crafting prerequisite stays advisory and bard focus is not a spell grant',()=>{
 const craft=rule('herbalism-kit').craftingPrerequisite;
 assert.equal(craft.normalRule,'proficiency-with-herbalism-kit');
 assert.deepEqual(craft.products,['antitoxin','potions-of-healing']);
 assert.equal(craft.deviationHandling,'warn-and-allow-manual-override');
 assert.equal(craft.duration,null);assert.equal(craft.cost,null);assert.equal(craft.automaticCrafting,false);
 const focus=rule('musical-instrument').spellcastingFocus;
 assert.equal(focus.class,'bard');assert.equal(focus.automaticSpellGrant,false);
 assert.equal(focus.otherSpellcastingConditions,'not-verified-by-this-excerpt');
 assert.equal(rule('navigators-tools').proficiencyCheck,'avoid-getting-lost-at-sea');
 assert.equal(rule('thieves-tools').proficiencyCheck,'disarm-traps-or-open-locks');
});
