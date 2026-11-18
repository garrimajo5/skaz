import test from 'node:test';
import assert from 'node:assert/strict';
import {compareVariants} from '../scripts/catalog-bestiary-variants.mjs';
const row=(id,en)=>({url:`https://dnd.su/bestiary/${id}-sample/`,en});
test('different versions with same name remain separate records and unverified family',()=>{const r=compareVariants([row(1,'Goblin'),row(3,'Owl')],[row(2,'Goblin'),row(3,'Owl')]);assert.equal(r.sharedPages,1);assert.deepEqual(r.classicOnly,[row(1).url]);assert.deepEqual(r.multiverseOnly,[row(2).url]);assert.equal(r.nameFamilies.length,1);assert.equal(r.nameFamilies[0].rulesEquivalence,'unverified');assert.equal(r.approvedRecordCount,null);});
test('slug rename does not count as new bestiary page',()=>{const r=compareVariants([row(1,'Goblin')],[{...row(1,'Goblin'),url:'https://dnd.su/bestiary/1-new-name/'}]);assert.equal(r.sharedPages,1);assert.equal(r.classicOnly.length,0);});
test('duplicate numerical identity aborts a variant snapshot',()=>{assert.throws(()=>compareVariants([row(1,'A'),row(1,'B')],[]),/Duplicate/);});
test('ordering and slug edits alone do not create differing rule families',()=>{const a=[row(1,'Same'),row(2,'Same')];const b=[row(2,'Same'),{...row(1,'Same'),url:'https://dnd.su/bestiary/1-renamed/'}];assert.equal(compareVariants(a,b).nameFamilies.length,0);});
