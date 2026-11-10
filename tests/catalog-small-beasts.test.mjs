import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore} from '../server/store.mjs';
import {validateCatalog} from '../server/catalog.mjs';
const pack=JSON.parse(readFileSync(new URL('../catalog/srd51-small-beasts.json',import.meta.url)));
test('animal appendix additions preserve independently checked statistics and attacks',()=>{
 const entries=validateCatalog(pack);
 const expected=[['medium',12,19,{walk:30,climb:30},[16,14,14,6,12,7],'1/2',100,366],['small',12,3,{walk:30,climb:30},[8,14,11,4,12,6],'0',10,367],['tiny',10,3,{walk:20,burrow:5},[4,11,12,2,12,5],'0',10,367]];
 for(const [i,e]of entries.entries()){const m=e.monster;assert.equal(m.type,'beast');assert.deepEqual([m.size,m.armorClass,m.hitPoints,m.speed,Object.values(m.abilities),m.challenge,m.xp],expected[i].slice(0,7));assert.ok(e.source.url.endsWith('#page='+expected[i][7]));assert.equal(e.source.usage,'cc-by-4.0');}
 assert.match(entries[0].text,/две атаки кулаком/);assert.match(entries[0].text,/25\/50 футов/);assert.match(entries[0].text,/6 \(1d6 \+ 3\)/);
 assert.match(entries[1].text,/в пределах 5 футов от цели/);assert.match(entries[1].text,/не являющийся недееспособным/);assert.match(entries[1].text,/1 \(1d4 − 1\)/);
 assert.match(entries[2].text,/Тёмное зрение 30 футов/);assert.match(entries[2].text,/связанные с обонянием/);assert.match(entries[2].text,/одна цель; 1 колющего урона/);
});
test('beast import repeats without game/history writes and resolves the pack-tactics condition',()=>{
 const s=openStore(':memory:');try{
 const before=s.read(),history=s.history();s.catalog.installBundled({version:s.catalog.previewBundled().version});
 assert.equal(s.catalog.importEntries(pack,{apply:true}).unchanged,3);assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),history);
 const detail=s.catalog.lookup(new URLSearchParams({id:pack.entries[1].id}));assert.ok(detail.related.some(e=>e.id==='srd51:2014:mechanic:incapacitated'));
 }finally{s.close();}
});
