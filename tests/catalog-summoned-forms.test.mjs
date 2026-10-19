import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore} from '../server/store.mjs';
const pack=JSON.parse(readFileSync(new URL('../catalog/srd51-summoned-forms.json',import.meta.url),'utf8'));
test('summoned forms preserve base creature stats and resolve from third-level spell cards',()=>{
 const horse=pack.entries.find(e=>e.name.en==='Riding Horse'),zombie=JSON.parse(readFileSync(new URL('../catalog/srd51-encounter-monsters.json',import.meta.url),'utf8')).entries.find(e=>e.name.en==='Zombie');
 assert.equal(horse.monster.speed.walk,60);assert.equal(horse.monster.hitPoints,13);assert.equal(horse.monster.challenge,'1/4');assert.match(horse.text,/100 футов/);
 assert.equal(zombie.monster.hitPoints,22);assert.equal(zombie.monster.armorClass,8);assert.equal(zombie.monster.speed.walk,20);assert.match(zombie.text,/5 \+ полученный урон/);assert.match(zombie.text,/критического попадания/);
 const s=openStore(':memory:');try{const before=s.read(),p=s.catalog.previewBundled();s.catalog.installBundled({version:p.version});assert.equal(s.catalog.importEntries(pack,{apply:true}).unchanged,1);
 const lookup=slug=>s.catalog.lookup(new URLSearchParams({id:'srd51:2014:spell:'+slug}));
 assert.ok(lookup('phantom-steed').related.some(e=>e.id===horse.id));assert.ok(lookup('animate-dead').related.some(e=>e.id===zombie.id));assert.deepEqual(s.read(),before);
 }finally{s.close();}
});
