import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {npcCoverage} from '../scripts/npc-coverage.mjs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
const inventory=JSON.parse(readFileSync(new URL('../catalog/srd51-npc-inventory.json',import.meta.url)));
const cards=bundledCatalog().bundle.entries;
test('NPC coverage reports the full appendix denominator and explicit remaining gaps',()=>{
 const report=npcCoverage(inventory,cards);
 assert.equal(report.total,21);assert.equal(report.prepared,12);
 assert.deepEqual(report.missing.map(r=>r.nameEn),['Archmage','Assassin','Bandit Captain','Cult Fanatic','Druid','Gladiator','Mage','Noble','Tribal Warrior']);
 // Removing a card decreases actual coverage rather than retaining a claimed status.
 const reduced=npcCoverage(inventory,cards.filter(c=>!c.id.endsWith(':priest')));
 assert.equal(reduced.prepared,11);assert.ok(reduced.missing.some(r=>r.nameEn==='Priest'));
});
test('NPC coverage rejects duplicated headings, editions and incorrect source pages',()=>{
 const duplicate=structuredClone(inventory);duplicate.entries[1]=duplicate.entries[0];assert.throws(()=>npcCoverage(duplicate,cards),/duplicate/);
 const wrong=structuredClone(cards),priest=wrong.find(c=>c.id.endsWith(':priest'));priest.ruleset='5e-2024';assert.throws(()=>npcCoverage(inventory,wrong),/source/);
 priest.ruleset='5e-2014';priest.source.url=priest.source.url.replace('#page=401','#page=402');assert.throws(()=>npcCoverage(inventory,wrong),/source/);
 assert.throws(()=>npcCoverage(inventory,[...cards,cards.find(c=>c.id.endsWith(':priest'))]),/Duplicate/);
});
