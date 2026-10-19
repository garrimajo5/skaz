import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../client/catalog.js', import.meta.url), 'utf8');
function harness(protocol = 'http:') {
  const handlers = {}, requests = [], tasks = [], additions = [];
  const region = { innerHTML: '', setAttribute() {} };
  let dialog = '', isOpen=true;
  const context = vm.createContext({
    location: { protocol }, page: 'library', URL, URLSearchParams, AbortSignal,
    queueMicrotask: task => tasks.push(task),
    fetch: url => new Promise((resolve, reject) => requests.push({ url, resolve, reject })),
    document: { addEventListener: (name, fn) => handlers[name] = fn, getElementById: id => id==='dialog'?{open:isOpen}:id==='catalog-detail-title'?(dialog.includes('catalog-detail-title')?region:null):id==='spell-inventory'?(dialog.includes('spell-inventory')?region:null):id==='bundled-catalog'?(dialog.includes('bundled-catalog')?region:null):region, querySelector: () => null },
    FormData: class { constructor(form) { this.form = form; } get(key) { return this.form[key] || ''; } },
    render:()=>{}, modal: html => dialog = html, SkazStorage: { addInventory: entry => additions.push(entry), editSpell: entry => additions.push(entry) },
  });
  vm.runInContext(source, context);
  const view = () => vm.runInContext('SkazCatalog.view()', context);
  return { view, requests, tasks, region, additions, dialog: () => dialog,
    click: (id,dataset={}) => handlers.click({target:{closest:()=>({id,dataset,hasAttribute:()=>false})}}), close:()=>isOpen=false, otherModal:()=>dialog='<h2>Other</h2>',
    submit: (q,filters={}) => handlers.submit({ target: { id: 'catalog-search', q,...filters }, preventDefault() {} }),
    inventorySubmit:(q,status,level='')=>handlers.submit({target:{id:'spell-inventory-search',q,status,level},preventDefault(){}}),
    draft:(name,value)=>handlers.input({target:{name,value,form:{id:'catalog-search'}}}),
    changeKind:value=>handlers.change({target:{name:'kind',value,form:{id:'catalog-search'}}}),
    detail: () => handlers.click({ target: { closest: () => ({ hasAttribute: () => true, dataset: { catalogEntry: '0' } }) } }),
  };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
function respond(request, payload) { request.resolve({ ok: true, json: async () => payload }); }
const entry = { kind: 'mechanic', name: { ru: '<img src=x onerror=alert(1)>', en: 'Test' }, source: { title: 'Fixture', usage: 'personal', url: 'javascript:alert(1)', version: '1', terms: '<script>unsafe</script>' }, text: '<b>plain text</b>' };
const coverage = { total: 1, referenceOnly: 0, personal: 1 };

test('CC material shows license, escaped attribution and translation changes', async () => {
  const h = harness(); h.submit('');
  const licensed = { ...entry, source: { ...entry.source, usage: 'cc-by-4.0', attribution: '<b>Author</b>', changes: '<script>Translation</script>' } };
  respond(h.requests[0], { entries: [licensed], total: 1 }); respond(h.requests[1], { ...coverage, personal: 0, openlyLicensed: 1 });
  await settle(); h.detail();
  assert.match(h.region.innerHTML, /Открытый материал · CC BY 4.0/);
  assert.match(h.view(), /CC BY 4.0: 1/);
  assert.match(h.dialog(), /&lt;b&gt;Author/);
  assert.match(h.dialog(), /&lt;script&gt;Translation/);
  assert.doesNotMatch(h.dialog(), /<script>|Личный импорт|Только ссылка/);
});

test('late catalog responses cannot replace newer search results', async () => {
  const h = harness(); h.submit('old'); h.submit('new');
  respond(h.requests[2], { entries: [entry], total: 1 }); respond(h.requests[3], coverage);
  await settle();
  const current = h.region.innerHTML;
  respond(h.requests[0], { entries: [], total: 0 }); respond(h.requests[1], coverage);
  await settle();
  assert.equal(h.region.innerHTML, current);
  assert.match(current, /&lt;img/);
  assert.doesNotMatch(current, /<img/);
  h.detail();
  assert.match(h.dialog(), /&lt;b&gt;plain text/);
  assert.doesNotMatch(h.dialog(), /href=|<script>/);
});

test('catalog failure offers retry; empty search differs from empty database; file demo does not fetch', async () => {
  const h = harness(); h.submit('missing');
  h.requests[0].reject(new Error('offline')); respond(h.requests[1], coverage);
  await settle(); assert.match(h.region.innerHTML, /Повторить/);
  h.submit('missing'); respond(h.requests[2], { entries: [], total: 0 }); respond(h.requests[3], coverage);
  await settle(); assert.match(h.region.innerHTML, /Ничего не найдено/);
  h.submit(''); respond(h.requests[4], { entries: [], total: 0 }); respond(h.requests[5], coverage);
  await settle(); assert.match(h.region.innerHTML, /Каталог пока пуст/);
  const demo = harness('file:'); assert.match(demo.view(), /автономная демонстрация/);
  assert.equal(demo.requests.length, 0); assert.equal(demo.tasks.length, 0);
});

test('item and artifact cards pass the selected entry to the inventory form', async () => {
  for (const kind of ['item', 'artifact']) {
    const h = harness(); h.submit('');
    const item = { ...entry, kind, id: 'personal:' + kind };
    respond(h.requests[0], { entries: [item], total: 1 }); respond(h.requests[1], coverage);
    await settle(); h.detail();
    assert.match(h.dialog(), /catalog-add-inventory/);
    h.region.onclick();
    assert.equal(h.additions[0].id, item.id);
  }
});


test('spell card opens selection without directly applying effects', async () => {
  const h = harness(); h.submit('');
  const spell = { ...entry, kind: 'spell', id: 'test:spell' };
  respond(h.requests[0], { entries: [spell], total: 1 }); respond(h.requests[1], coverage);
  await settle(); h.detail(); assert.match(h.dialog(), /catalog-add-spell/);
  h.region.onclick(); assert.equal(h.additions[0].id, spell.id);
});


test('linked catalog cards use stable IDs, preserve search and return to the parent card',async()=>{
 const h=harness(),parent={...entry,id:'test:parent',links:['test:child']},child={...entry,id:'test:child',links:[],name:{ru:'Child',en:'Child'}};
 h.submit('parent');respond(h.requests[0],{entries:[parent],total:1});respond(h.requests[1],coverage);await settle();h.detail();
 assert.match(h.requests[2].url,/id=test%3Aparent/);respond(h.requests[2],{entry:parent,related:[{id:child.id,name:{ru:'<b>Child',en:'Child'}}]});await settle();assert.match(h.region.innerHTML,/&lt;b&gt;Child/);
 h.click('',{catalogRelated:child.id});respond(h.requests[3],{entry:child,related:[]});await settle();assert.match(h.dialog(),/Child/);assert.match(h.dialog(),/catalog-detail-back/);assert.match(h.view(),/value="parent"/);
 h.click('catalog-detail-back');assert.match(h.dialog(),/&lt;img/);assert.doesNotMatch(h.dialog(),/catalog-detail-back/);
});

test('late linked material cannot reopen closed dialog or replace another form',async()=>{
 const parent={...entry,id:'test:parent',links:['test:child']};
 for(const leave of ['close','otherModal']){
  const h=harness();h.submit('');respond(h.requests[0],{entries:[parent],total:1});respond(h.requests[1],coverage);await settle();h.detail();respond(h.requests[2],{entry:parent,related:[{id:'test:child',name:{ru:'Child',en:'Child'}}]});await settle();
  h.click('',{catalogRelated:'test:child'});h[leave]();const before=h.dialog();respond(h.requests[3],{entry:{...entry,id:'test:child',links:[],name:{ru:'New card',en:'New'}},related:[]});await settle();assert.equal(h.dialog(),before);
 }
});


test('bundled preview does not install; failed delivery retries the reviewed version and refreshes catalog',async()=>{
 const h=harness();h.click('catalog-bundled');assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'/api/catalog/bundled');
 respond(h.requests[0],{version:'reviewed-version',total:26,added:11,unchanged:15,categories:{mechanic:16,spell:2,monster:2,item:5,artifact:1}});await settle();assert.match(h.dialog(),/Добавится: 11/);assert.equal(h.requests.length,1);
 const first=h.region.onclick();h.region.onclick();assert.equal(h.requests.length,2);h.requests[1].reject(new Error('lost response'));await first;assert.match(h.region.textContent,/Повтор безопасен/);assert.equal(h.region.disabled,false);
 const retry=h.region.onclick();respond(h.requests[2],{added:0,unchanged:26});await settle();assert.match(h.dialog(),/Подборка установлена/);
 respond(h.requests[3],{entries:[],total:26});respond(h.requests[4],{total:26,openlyLicensed:25,referenceOnly:1,personal:0});await retry;assert.match(h.view(),/В базе: 26/);
});

test('bundled preview arriving after another form cannot replace it',async()=>{
 const h=harness();h.click('catalog-bundled');h.otherModal();respond(h.requests[0],{version:'version',total:26,added:26,unchanged:0,categories:{}});await settle();assert.equal(h.dialog(),'<h2>Other</h2>');
});

test('structured search preserves filters across cards and paging, resets page on new search',async()=>{
 const h=harness();h.submit('test',{kind:'spell',level:'0'});assert.match(h.requests[0].url,/level=0/);
 respond(h.requests[0],{entries:[{...entry,kind:'spell',id:'test:zero'}],total:25});respond(h.requests[1],coverage);await settle();
 h.detail();assert.match(h.view(),/value="0" selected/);h.click('catalog-next');assert.match(h.requests[2].url,/offset=20/);assert.match(h.requests[2].url,/level=0/);
 h.submit('',{kind:'monster',challenge:'1/4',level:'0'});assert.match(h.requests[4].url,/offset=0/);assert.match(h.requests[4].url,/challenge=1%2F4/);assert.doesNotMatch(h.requests[4].url,/level=/);
 h.click('catalog-reset');assert.doesNotMatch(h.requests[6].url,/kind=|level=|challenge=|rarity=/);assert.match(h.requests[6].url,/offset=0/);
});
test('category change exposes only applicable control without applying or losing draft search',()=>{
 const h=harness();h.changeKind('spell');assert.match(h.region.innerHTML,/name="level"/);assert.match(h.region.innerHTML,/Заговор/);h.changeKind('monster');assert.match(h.region.innerHTML,/1\/8/);assert.doesNotMatch(h.region.innerHTML,/name="level"/);h.changeKind('item');assert.match(h.region.innerHTML,/name="rarity"/);h.changeKind('artifact');assert.equal(h.region.innerHTML,'');assert.equal(h.requests.length,0);
});

test('monster type and size drafts survive rerender, apply together and clear when leaving bestiary',async()=>{
 const h=harness();h.changeKind('monster');h.draft('monsterType','beast');h.draft('size','medium');h.draft('challenge','1/8');
 assert.match(h.view(),/value="beast" selected/);assert.match(h.view(),/value="medium" selected/);assert.equal(h.requests.length,0);
 h.submit('',{kind:'monster',monsterType:'beast',size:'medium',challenge:'1/8',school:'illusion'});
 const query=new URL(h.requests[0].url,'http://localhost').searchParams;assert.equal(query.get('monsterType'),'beast');assert.equal(query.get('size'),'medium');assert.equal(query.get('challenge'),'1/8');assert.equal(query.has('school'),false);
 respond(h.requests[0],{entries:[entry],total:21});respond(h.requests[1],coverage);await settle();h.click('catalog-next');assert.match(h.requests[2].url,/monsterType=beast/);assert.match(h.requests[2].url,/size=medium/);assert.match(h.requests[2].url,/offset=20/);
 h.changeKind('spell');assert.doesNotMatch(h.view(),/name="monsterType"|name="size"/);h.submit('',{kind:'spell',monsterType:'beast',size:'medium'});assert.doesNotMatch(h.requests[4].url,/monsterType=|size=/);
 h.click('catalog-reset');h.changeKind('monster');assert.doesNotMatch(h.view(),/value="beast" selected|value="medium" selected/);
});

test('item filters retain explicit no-attunement through drafts, submit and pagination',async()=>{
 const h=harness();h.changeKind('item');h.draft('itemType','ring');h.draft('attunement','false');assert.match(h.view(),/value="ring" selected/);assert.match(h.view(),/value="false" selected/);
 h.submit('',{kind:'item',itemType:'ring',attunement:'false',rarity:'uncommon',size:'medium'});
 assert.match(h.requests[0].url,/itemType=ring/);assert.match(h.requests[0].url,/attunement=false/);assert.doesNotMatch(h.requests[0].url,/size=/);
 respond(h.requests[0],{entries:[entry],total:21});respond(h.requests[1],coverage);await settle();h.click('catalog-next');assert.match(h.requests[2].url,/attunement=false/);
 h.submit('',{kind:'artifact',itemType:'ring',attunement:'false'});assert.doesNotMatch(h.requests[4].url,/itemType=|attunement=/);
 h.click('catalog-reset');assert.doesNotMatch(h.view(),/name="itemType"|name="attunement"/);
});

test('spell-specific filters preserve false through paging and rerender, then clear on category change and reset',async()=>{
 const h=harness();h.submit('',{kind:'spell',level:'1',school:'divination',ritual:'true',concentration:'false'});
 const params=new URL(h.requests[0].url,'http://localhost').searchParams;assert.equal(params.get('school'),'divination');assert.equal(params.get('concentration'),'false');assert.equal(params.get('ritual'),'true');
 respond(h.requests[0],{entries:[entry],total:21});respond(h.requests[1],coverage);await settle();assert.match(h.view(),/value="divination" selected/);assert.match(h.view(),/value="false" selected/);
 h.click('catalog-next');assert.match(h.requests[2].url,/concentration=false/);assert.match(h.requests[2].url,/offset=20/);
 h.submit('',{kind:'monster',school:'divination',ritual:'true',concentration:'false'});assert.doesNotMatch(h.requests[4].url,/school=|ritual=|concentration=/);
 h.click('catalog-reset');assert.doesNotMatch(h.requests[6].url,/school=|ritual=|concentration=/);
 h.changeKind('spell');assert.match(h.region.innerHTML,/name="school"/);assert.match(h.region.innerHTML,/name="ritual"/);assert.match(h.region.innerHTML,/name="concentration"/);assert.doesNotMatch(h.region.innerHTML,/selected/);
});

test('unfinished catalog filters survive a theme rerender without searching or leaking across categories',async()=>{
 const h=harness();h.submit('saved',{kind:'spell',level:'1'});respond(h.requests[0],{entries:[entry],total:1});respond(h.requests[1],coverage);await settle();
 h.draft('q','<draft>');h.draft('school','illusion');h.draft('concentration','false');assert.match(h.view(),/value="&lt;draft&gt;"/);assert.match(h.view(),/value="illusion" selected/);assert.match(h.view(),/value="false" selected/);assert.equal(h.requests.length,2);
 h.changeKind('monster');assert.match(h.view(),/value="monster" selected/);assert.match(h.view(),/value="&lt;draft&gt;"/);assert.doesNotMatch(h.view(),/name="school"|name="concentration"/);
 h.draft('challenge','1/4');assert.match(h.view(),/value="1\/4" selected/);h.click('catalog-reset');assert.doesNotMatch(h.view(),/draft|value="monster" selected|name="challenge"/);
});

test('structured cards show useful values, negative modifiers and escape imported fields',async()=>{
 const cases=[{kind:'spell',spell:{level:0,school:'illusion',castingTime:'<cast>',range:{type:'feet',feet:30},components:['S','M'],duration:'1 минута',concentration:false,ritual:false}}, {kind:'monster',monster:{size:'small',type:'humanoid',armorClass:12,hitPoints:5,challenge:'1/8',xp:25,speed:{walk:30},abilities:{str:7,dex:15,con:9,int:8,wis:7,cha:8}}},{kind:'item',item:{type:'potion',rarity:'common',attunement:false,healing:{diceCount:2,diceSides:4,bonus:2}}},{kind:'artifact',artifact:{type:'wondrous',attunement:true,charges:{max:7,recharge:'<recharge>'}}}];
 for(const fields of cases){const h=harness();h.submit('');respond(h.requests[0],{entries:[{...entry,...fields}],total:1});respond(h.requests[1],coverage);await settle();h.detail();assert.match(h.dialog(),/Характеристики/);assert.doesNotMatch(h.dialog(),/<cast>|<recharge>/);if(fields.monster){assert.match(h.dialog(),/7 \(-2\)/);assert.match(h.dialog(),/1\/8/);}if(fields.spell){assert.match(h.dialog(),/Заговор/);assert.match(h.dialog(),/&lt;cast&gt;/);}if(fields.item)assert.match(h.dialog(),/2d4 \+ 2/);}
});

test('source inventory searches prepared RU names, filters missing records and guards closed or replaced dialog',async()=>{
 const data={entries:[{id:'a',nameEn:'Detect Magic',nameRu:'Обнаружение магии',page:134,level:1,status:'installed'},...Array.from({length:21},(_,i)=>({id:'m'+i,nameEn:'Missing '+i,nameRu:null,page:114,level:i===0?0:2,status:'missing'}))]};
 const h=harness();h.click('catalog-inventory');respond(h.requests[0],data);await settle();assert.match(h.dialog(),/1–20 из 22/);assert.match(h.dialog(),/#page=134/);
 h.inventorySubmit('обнаружение','installed');assert.match(h.dialog(),/1–1 из 1/);assert.doesNotMatch(h.dialog(),/Missing 0/);
 h.inventorySubmit('','missing');assert.match(h.dialog(),/1–20 из 21/);h.click('inventory-next');assert.match(h.dialog(),/21–21 из 21/);
 h.inventorySubmit('','all','0');assert.match(h.dialog(),/1–1 из 1/);assert.match(h.dialog(),/подготовлено 0 из 1/);assert.doesNotMatch(h.dialog(),/Detect Magic/);
 h.inventorySubmit('<script>','all');assert.match(h.dialog(),/&lt;script&gt;/);assert.match(h.dialog(),/Совпадений нет/);
 const closed=harness();closed.click('catalog-inventory');closed.close();respond(closed.requests[0],data);await settle();assert.doesNotMatch(closed.dialog(),/Detect Magic/);
 const replaced=harness();replaced.click('catalog-inventory');replaced.otherModal();respond(replaced.requests[0],data);await settle();assert.equal(replaced.dialog(),'<h2>Other</h2>');
});

test('installed inventory cards open by ID and return to the same filters; missing or late cards cannot open',async()=>{
 const data={entries:[{id:'test:one',nameEn:'One',nameRu:'Один',page:114,level:1,status:'installed'},{id:'test:missing',nameEn:'Missing',nameRu:null,page:115,level:2,status:'missing'}]};
 const h=harness();h.click('catalog-inventory');respond(h.requests[0],data);await settle();assert.match(h.dialog(),/data-inventory-read="test:one"/);assert.doesNotMatch(h.dialog(),/data-inventory-read="test:missing"/);
 h.inventorySubmit('Один','installed','1');h.click('',{inventoryRead:'test:one'});assert.match(h.requests[1].url,/id=test%3Aone/);respond(h.requests[1],{entry:{...entry,id:'test:one',kind:'spell',links:[]},related:[]});await settle();assert.match(h.dialog(),/inventory-return/);assert.match(h.dialog(),/catalog-add-spell/);
 h.click('inventory-return');assert.match(h.dialog(),/value="Один"/);assert.match(h.dialog(),/value="1" selected/);assert.match(h.dialog(),/1–1 из 1/);h.click('',{inventoryRead:'test:missing'});assert.equal(h.requests.length,2);
 h.click('',{inventoryRead:'test:one'});h.otherModal();respond(h.requests[2],{entry,related:[]});await settle();assert.equal(h.dialog(),'<h2>Other</h2>');
});

test('inventory card failure is retryable and returning preserves its page',async()=>{
 const h=harness(),entries=Array.from({length:21},(_,n)=>({id:'test:'+n,nameEn:'Spell '+n,nameRu:null,page:114,level:1,status:'installed'}));
 h.click('catalog-inventory');respond(h.requests[0],{entries});await settle();h.click('inventory-next');assert.match(h.dialog(),/21–21 из 21/);
 h.click('',{inventoryRead:'test:20'});h.requests[1].reject(new Error('offline'));await settle();assert.match(h.region.textContent,/повторить/);assert.match(h.dialog(),/21–21 из 21/);
 h.click('',{inventoryRead:'test:20'});respond(h.requests[2],{entry:{...entry,id:'test:20',links:[]},related:[]});await settle();h.click('inventory-return');assert.match(h.dialog(),/21–21 из 21/);assert.match(h.dialog(),/Spell 20/);assert.doesNotMatch(h.dialog(),/>Spell 0</);
});
