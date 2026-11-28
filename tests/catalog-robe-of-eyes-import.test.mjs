import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {openStore} from '../server/store.mjs';

const read = name => JSON.parse(readFileSync(new URL('../catalog/'+name,import.meta.url),'utf8'));

test('Robe of Eyes imports once with 2014 vision and two distinct blindness triggers',()=>{
  const pack=read('srd51-robe-of-eyes.json');
  const [entry]=pack.entries;
  const coverage=read('srd51-robe-of-eyes.coverage.json');
  const evidence=read('rest-spellcasting-source-comparison-2014.json').units.find(row=>row.key==='robe-of-eyes-selected');
  const store=openStore(':memory:');
  try {
    const bundle=bundledCatalog().bundle;
    const earlier={...bundle,entries:bundle.entries.filter(row=>row.id!==entry.id)};
    store.catalog.importEntries(earlier,{apply:true});
    const before=store.read();
    const lookup=id=>store.catalog.lookup(new URLSearchParams({id})).entry;
    assert.throws(()=>lookup(entry.id),{status:404});
    const bundleReview=store.catalog.previewBundled();
    assert.equal(bundleReview.added,1);
    assert.equal(store.catalog.importEntries(pack).added,1);
    assert.throws(()=>lookup(entry.id),{status:404});
    assert.equal(store.catalog.importEntries(pack,{apply:true}).added,1);
    assert.equal(store.catalog.importEntries(pack,{apply:true}).unchanged,1);
    assert.equal(store.catalog.installBundled({version:bundleReview.version}).added,0);
    const robe=lookup(entry.id);
    assert.deepEqual(robe.item,{type:'wondrous',rarity:evidence.facts.rarity,attunement:evidence.facts.requiresAttunement});
    assert.equal(robe.source.usage,'cc-by-4.0');
    assert.equal(robe.source.url,coverage.sourceUrl+'#page='+evidence.pdfPage);
    assert.deepEqual(coverage.entries,[{id:robe.id,nameEn:robe.name.en,pages:[evidence.pdfPage]}]);
    assert.match(robe.text,/преимуществом.*Восприятие.*зрение/);
    assert.match(robe.text,/120 футов.*невидимые существа и предметы.*Эфирный план/);
    assert.match(robe.text,/Глаза мантии нельзя закрыть или отвести/);
    assert.match(robe.text,/«Свет», наложенное на мантию.*«Дневной свет».*5 футов.*1 минуту/);
    assert.match(robe.text,/В конце каждого своего хода.*Телосложения.*СЛ 11 для «Света», СЛ 15 для «Дневного света»/);
    assert.doesNotMatch(robe.text,/истинное зрение|заряд/iu);
    assert.deepEqual(new Set(robe.links.map(id=>lookup(id).name.en)),new Set([
      'Attunement','Wearing and Wielding Items','Blinded','Light','Daylight'
    ]));
    assert.deepEqual(store.read(),before);
    store.addInventory({
      mutationId:randomUUID(),expectedRevision:before.revision,
      characterId:before.context.characterId,catalogId:robe.id,quantity:1
    });
    const instance=store.inventory().entries.find(row=>row.catalogId===robe.id);
    assert.equal(instance.quantity,1);
    assert.equal(instance.chargeCounts,undefined);
    assert.deepEqual(store.read().state,before.state);
  } finally {
    store.close();
  }
});
