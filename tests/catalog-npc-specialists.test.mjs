import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {validateCatalog} from '../server/catalog.mjs';import {bundledCatalog} from '../server/bundled-catalog.mjs';
const cards=validateCatalog(JSON.parse(readFileSync(new URL('../catalog/srd51-npc-specialists.json',import.meta.url))));
test('final Appendix B specialists preserve conditional defenses, action limits and complete spell references',()=>{
 assert.equal(cards.length,3);const all=new Map(bundledCatalog().bundle.entries.map(e=>[e.id,e]));
 for(const card of cards){assert.equal(card.source.usage,'cc-by-4.0');assert.equal(card.ruleset,'5e-2014');for(const id of card.links)assert.equal(all.get(id)?.kind,'spell',id);}
 const arch=cards.find(c=>c.name.en==='Archmage');assert.equal(arch.monster.challenge,'12');assert.equal(arch.monster.armorClass,12);assert.equal(arch.links.length,27);assert.match(arch.text,/Заклинатель 18-го уровня/);assert.match(arch.text,/9-й уровень, 1 ячейка/);assert.match(arch.text,/Disguise Self.*Invisibility.*без ограничения/);assert.match(arch.text,/указано как эффект Stoneskin/);assert.match(arch.text,/Mage Armor, Stoneskin и Mind Blank.*до боя/);
 const assassin=cards.find(c=>c.name.en==='Assassin');assert.equal(assassin.monster.hitPoints,78);assert.match(assassin.text,/один раз за ход/);assert.match(assassin.text,/две атаки коротким мечом, не две арбалетные/);assert.match(assassin.text,/24 \(7d6\) ядом.*половина при успехе/);assert.match(assassin.text,/нет помехи/);
 const gladiator=cards.find(c=>c.name.en==='Gladiator');assert.equal(gladiator.monster.hitPoints,112);assert.match(gladiator.text,/уже включена.*не добавляй её повторно/);assert.match(gladiator.text,/три рукопашные либо две дальнобойные/);assert.match(gladiator.text,/Среднего или меньшего размера.*Силы Сл 15/);assert.match(gladiator.text,/\+3 КД.*видит атакующего и держит рукопашное оружие/);
});
