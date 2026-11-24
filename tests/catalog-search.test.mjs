import test from 'node:test';import assert from 'node:assert/strict';import {openStore} from '../server/store.mjs';
import {createSearchRank} from '../server/catalog-search.mjs';
test('catalog search handles reordered Russian and English words, word forms and yo',()=>{const s=openStore(':memory:');try{s.catalog.installBundled({version:s.catalog.previewBundled().version});const names=q=>s.catalog.search(new URLSearchParams({q,limit:'100'})).entries.map(e=>e.name.en);for(const q of ['огонь','огненн']){assert.ok(names(q).includes('Fireball'));assert.ok(names(q).includes('Fire Bolt'));}assert.ok(names('шар огн').includes('Fireball'));assert.ok(names('лечение').includes('Healing Word'));assert.ok(names('hand mage').includes('Mage Hand'));assert.deepEqual(names('полет'),names('полёт'));assert.equal(names('щита')[0],'Shield');assert.equal(names('огонь несуществующееслово').length,0);}finally{s.close();}});

test('prepared ranks preserve the catalog search precedence and description scope', () => {
 const cards = [
  { name: { ru: 'Огонь', en: 'Fire' } },
  { name: { ru: 'Огонь заката', en: 'Sunset fire' } },
  { name: { ru: 'Синий огонь', en: 'Blue fire' } },
  { name: { ru: 'Синий_огонь', en: 'Blue fire joined' } },
  { name: { ru: 'Водопад', en: 'Waterfall' }, text: 'Синий огонь отражается в воде.' },
  { name: { ru: 'Вулкан', en: 'Volcano' } },
 ];
 const fullTextRank = createSearchRank('Синий_огонь', true);
 assert.equal(fullTextRank(cards[3]), 0);
 assert.equal(fullTextRank(cards[2]), Infinity);
 const ordered = cards.map(createSearchRank('огонь', true));
 assert.deepEqual(ordered, [0, 1, 2, 2, 4, Infinity]);
 assert.equal(createSearchRank('огонь')(cards[4]), Infinity);
 assert.equal(createSearchRank('огонь')({name:{ru:'Болотогонь',en:'Marshlight'}}), 3);
 assert.equal(createSearchRank('  ')(cards[5]), 0);
});
