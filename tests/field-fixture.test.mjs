import test from 'node:test';
import assert from 'node:assert/strict';
import {createFieldFixture} from '../scripts/field-fixture.mjs';
import {openStore} from '../server/store.mjs';
import {randomUUID} from 'node:crypto';
const counts=s=>({items:s.inventory().entries.length,spells:s.spellbook().entries.length,journal:s.read().state.journal.length,quests:s.quests().quests.length,places:s.places().places.length});
test('field fixture provides the exact filled synthetic workload',()=>{const s=createFieldFixture();try{assert.deepEqual(counts(s),{items:30,spells:20,journal:50,quests:10,places:15});assert.equal(new Set(s.inventory().entries.map(x=>x.catalogId)).size,30);assert.equal(s.read().state.hp,40);assert(s.spellbook().entries.some(x=>x.catalogId==='srd51:2014:spell:shield'));assert.equal(s.read().state.profile.name,'Тестовый странник');}finally{s.close();}});
test('field fixture export/import preserves workload in a separate RAM store',()=>{const a=createFieldFixture(),b=openStore(':memory:');try{const file=a.exportActive(12);b.importActive({mutationId:randomUUID(),expectedRevision:b.read().revision,destination:'new-campaign',file});assert.deepEqual(counts(b),counts(a));assert.notEqual(b.read().context.campaignId,a.read().context.campaignId);assert.equal(b.read().state.profile.name,'Тестовый странник');}finally{a.close();b.close();}});

import {createManualFieldFixture} from '../scripts/field-fixture.mjs';
test('manual non-bard fixture retains explicit counters across transfer',()=>{const a=createManualFieldFixture(),b=openStore(':memory:');try{const file=a.exportActive(12);b.importActive({mutationId:randomUUID(),expectedRevision:b.read().revision,destination:'new-campaign',file});assert.deepEqual(b.read().sheet?.counters??b.read().characterSheet?.counters,[{id:'qa-manual-counter',name:'Ручной тестовый ресурс',current:2,max:3}]);assert.deepEqual(counts(b),counts(a));}finally{a.close();b.close();}});
