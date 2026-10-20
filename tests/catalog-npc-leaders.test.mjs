import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateCatalog} from '../server/catalog.mjs';
const bundle=JSON.parse(readFileSync(new URL('../catalog/srd51-npc-leaders.json',import.meta.url)));
const manifest=JSON.parse(readFileSync(new URL('../catalog/srd51-npc-leaders.coverage.json',import.meta.url)));
test('NPC leaders retain source pages, base statistics and specific attack constraints',()=>{
 const cards=validateCatalog(bundle);assert.equal(cards.length,3);assert.equal(manifest.expectedSubsetCount,3);
 for(const card of cards){const row=manifest.entries.find(x=>x.id===card.id);assert.ok(row);assert.equal(card.source.url.split('#page=')[1],String(row.pages[0]));assert.equal(card.source.usage,'cc-by-4.0');}
 const captain=cards.find(c=>c.name.en==='Bandit Captain');assert.equal(captain.monster.hitPoints,65);assert.equal(captain.monster.challenge,'2');assert.match(captain.text,/две скимитаром и одна кинжалом/);assert.match(captain.text,/две дальнобойные атаки/);
 const noble=cards.find(c=>c.name.en==='Noble');assert.equal(noble.monster.hitPoints,9);assert.equal(noble.monster.armorClass,15);assert.match(noble.text,/видит атакующего и держит рукопашное оружие/);
 const warrior=cards.find(c=>c.name.en==='Tribal Warrior');assert.equal(warrior.monster.challenge,'1/8');assert.deepEqual(manifest.entries.find(e=>e.id===warrior.id).pages,[402,403]);assert.match(warrior.text,/не недееспособен/);assert.match(warrior.text,/не повышает урон броска/);
});
