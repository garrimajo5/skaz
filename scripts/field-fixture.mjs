import {openStore} from '../server/store.mjs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';

// Fixed synthetic dataset in RAM only. No database or network options.
// Load test coverage is not a legal class build or physical-device acceptance.
export function createFieldFixture() {
 const store=openStore(':memory:');
 try {
  store.catalog.installBundled({version:store.catalog.previewBundled().version});
  const command=fields=>({mutationId:randomUUID(),expectedRevision:store.read().revision,...fields});
  const {characterId,campaignId}=store.read().context;
  const bundle=bundledCatalog();
  const entries=bundle.entries??bundle.bundle?.entries;
  const itemPriority='srd51:2014:item:potion-of-healing';
  const items=entries.filter(e=>['item','artifact'].includes(e.kind)).sort((a,b)=>(b.id===itemPriority?1:0)-(a.id===itemPriority?1:0)||a.id.localeCompare(b.id)).slice(0,30);
  const priority=['srd51:2014:spell:shield','srd51:2014:spell:healing-word'];
  const spells=entries.filter(e=>e.kind==='spell').sort((a,b)=>(priority.includes(b.id)?1:0)-(priority.includes(a.id)?1:0)||a.id.localeCompare(b.id)).slice(0,20);
  if(items.length!==30||spells.length!==20||priority.some(id=>!spells.some(e=>e.id===id)))throw Error('Bundled fixture sources missing');
  for(const item of items)store.addInventory(command({characterId,catalogId:item.id,quantity:1}));
  for(const spell of spells)store.setSpell(command({characterId,catalogId:spell.id,status:'prepared'}));
  for(let i=0;i<10;i++)store.saveQuest(command({campaignId,questId:randomUUID(),operation:'create',quest:{title:`Вымышленное задание ${i+1}`,description:'Только нагрузочная QA-репетиция',status:'active',steps:[{id:randomUUID(),title:'Проверочный этап',done:false}]}}));
  for(let i=0;i<15;i++)store.savePlace(command({campaignId,placeId:randomUUID(),operation:'create',place:{title:`Вымышленное место ${i+1}`,description:'Только нагрузочная QA-репетиция',x:5+i*6,y:50,visited:i%2===0}}));
  const current=store.read().state;
  store.update(command({label:'Синтетический нагрузочный профиль #79',state:{...current,hp:40,maxHp:40,slots:{1:4,2:3,3:2},profile:{name:'Тестовый странник',tagline:'Вымышленная нагрузочная QA-репетиция',campaign:'Синтетическая кампания'},journal:Array.from({length:50},(_,i)=>({title:`Вымышленная запись ${i+1}`,text:'Проверка заполненного журнала; не данные игрока.',at:1700000000000+i*1000,time:'12:00'}))}}));
  return store;
 } catch(error){store.close();throw error;}
}

// Separate manual-sheet variant; it must not substitute the bard slot scenario.
export function createManualFieldFixture() {
 const store=createFieldFixture();
 try {
  const current=store.read();
  store.saveCharacterSheet({mutationId:randomUUID(),expectedRevision:current.revision,characterId:current.context.characterId,sheet:{ruleset:'5e-2014',ancestry:'',className:'Тестовый воин',subclass:'',level:5,counters:[{id:'qa-manual-counter',name:'Ручной тестовый ресурс',current:2,max:3}]}});
  return store;
 }catch(error){store.close();throw error;}
}


if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const {values: {output, manual}} = parseArgs({
    options: {output: {type: 'string'}, manual: {type: 'boolean'}},
  });
  if (!output?.toLowerCase().endsWith('.json')) {
    console.error('Использование: node scripts/field-fixture.mjs --output <новый файл.json> [--manual]');
    process.exitCode = 1;
  } else {
    const store = manual ? createManualFieldFixture() : createFieldFixture();
    try {
      const snapshot = JSON.stringify(store.exportActive(15));
      writeFileSync(output, snapshot + '\n', {encoding: 'utf8', flag: 'wx'});
    } finally {
      store.close();
    }
  }
}
