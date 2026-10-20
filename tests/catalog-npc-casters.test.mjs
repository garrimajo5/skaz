import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {validateCatalog} from '../server/catalog.mjs';import {bundledCatalog} from '../server/bundled-catalog.mjs';
const cards=validateCatalog(JSON.parse(readFileSync(new URL('../catalog/srd51-npc-casters.json',import.meta.url))));
test('NPC casters link every prepared spell and preserve printed caster levels, slots and conditional armor',()=>{
 const all=new Map(bundledCatalog().bundle.entries.map(e=>[e.id,e]));assert.equal(cards.length,3);
 for(const card of cards){assert.equal(card.source.usage,'cc-by-4.0');assert.equal(card.ruleset,'5e-2014');for(const id of card.links){assert.equal(all.get(id)?.kind,'spell',id);assert.equal(all.get(id).ruleset,'5e-2014');}}
 const cult=cards.find(c=>c.name.en==='Cult Fanatic');assert.equal(cult.links.length,8);assert.equal(cult.monster.armorClass,13);assert.match(cult.text,/Сл 11, атака заклинанием \+3/);assert.match(cult.text,/две рукопашные атаки/);assert.match(cult.text,/2-й уровень, 3 ячейки/);
 const druid=cards.find(c=>c.name.en==='Druid');assert.equal(druid.links.length,9);assert.equal(druid.monster.armorClass,11);assert.equal(druid.monster.hitPoints,27);assert.match(druid.text,/Друидический и ещё два/);assert.match(druid.text,/с дубовой корой — 16/);assert.match(druid.text,/Под действием Shillelagh атака \+4/);assert.match(druid.text,/превращение в зверя.*не указано/);
 const mage=cards.find(c=>c.name.en==='Mage');assert.equal(mage.links.length,16);assert.equal(mage.monster.challenge,'6');assert.equal(mage.monster.armorClass,12);assert.match(mage.text,/Заклинатель 9-го уровня/);assert.match(mage.text,/4-й уровень, 3 ячейки/);assert.match(mage.text,/5-й уровень, 1 ячейка/);assert.match(mage.text,/Мультиатаки нет/);
});
