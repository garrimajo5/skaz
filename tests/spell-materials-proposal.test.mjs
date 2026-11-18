import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {validateCatalog} from '../server/catalog.mjs';
import {validateMaterialProposal,validateMaterials} from '../scripts/spell-materials-contract.mjs';
const proposal=JSON.parse(readFileSync(new URL('../catalog/spell-materials.proposal.json',import.meta.url)));
const catalog=validateCatalog(bundledCatalog().bundle);
test('material review stays partial and outside installed catalog',()=>{
 const result=validateMaterialProposal(proposal,catalog);assert.equal(result.reviewed,104);assert.equal(result.total,319);assert.equal(result.remaining,215);assert.equal(result.installed,false);assert.equal(result.sourceBodiesCompared,false);
 assert.ok(catalog.filter(e=>e.kind==='spell').every(e=>!Object.hasOwn(e.spell,'materials')));
});
test('source, identity and edited personal entries cannot inherit reviewed material conditions',()=>{
 for(const change of [p=>p.source.sha256='0'.repeat(64),p=>p.ruleset='5e-2024',p=>p.entries.push(p.entries[0]),p=>p.entries[0].name.ru='Другое',p=>p.entries[0].entrySha256='0'.repeat(64),p=>p.scope.complete=true,p=>p.entries[0].sourcePages=[0],p=>p.entries[0].sourcePages=[155,155],p=>p.entries[0].materials.extra=true]){
 const copy=structuredClone(proposal);change(copy);assert.throws(()=>validateMaterialProposal(copy,catalog));
 }
 const personal=structuredClone(catalog);personal.find(e=>e.id===proposal.entries[0].id).text+=' Личное исключение';assert.throws(()=>validateMaterialProposal(proposal,personal),/Catalog entry changed/);
});
test('unknown and unstated prices never become zero or a fabricated price',()=>{
 const value={description:'Синтетический материал',price:{kind:'unknown'},consumption:{kind:'unknown'},note:'Тест'};
 assert.deepEqual(validateMaterials(value),value);
 for(const price of [{kind:'unknown',text:'0 зм'},{kind:'not-stated',text:'Бесплатно'},{kind:'stated'},{kind:'stated',text:' '},{kind:'fixed',text:'10 зм'}])assert.throws(()=>validateMaterials({...value,price}));
 for(const consumption of [{kind:'unknown',text:'Не расходуется'},{kind:'partial'},{kind:'conditional',text:''}])assert.throws(()=>validateMaterials({...value,consumption}));
});
test('multi-part and later costs retain their individual conditions',()=>{
 const row=name=>proposal.entries.find(e=>e.name.en===name).materials;
 assert.equal(row('Clone').consumption.kind,'partial');assert.match(row('Clone').price.text,/1 000.*2 000/);assert.match(row('Clone').consumption.text,/сосуд остаётся/);
 assert.equal(row('Instant Summons').consumption.kind,'conditional');assert.match(row('Instant Summons').consumption.text,/позже/);
 assert.match(row('Astral Projection').price.text,/На каждое существо/);assert.match(row('Warding Bond').price.text,/Каждое из двух/);
 assert.equal(row('Protection from Evil and Good').price.kind,'not-stated');assert.equal(row('Protection from Evil and Good').consumption.kind,'consumed');
 assert.equal(row('Identify').consumption.kind,'retained');assert.equal(row('Find Familiar').consumption.kind,'partial');
});
test('a different source extraction cannot be passed as evidence',()=>{
 assert.throws(()=>validateMaterialProposal(proposal,catalog,{sourceSha256:'bad',entries:[]}));
 const source={sourceSha256:proposal.source.sha256,sourceUrl:proposal.source.url,entries:proposal.entries.map(e=>({id:e.id,body:'changed',pages:e.sourcePages}))};
 assert.throws(()=>validateMaterialProposal(proposal,catalog,source),/Review text changed/);
});
import {materialView,escapeMaterialHtml} from '../docs/design/prototypes/spell-materials-view.mjs';
import {createSpellMaterialsFixture} from '../scripts/spell-materials-fixture.mjs';
test('material view distinguishes unknown from unstated and preserves partial conditions',()=>{
 const unknown=materialView();assert.equal(unknown.price,'Стоимость не уточнена.');assert.equal(unknown.consumption,'Расход не уточнён.');assert.equal(unknown.badge,'Нужно уточнить');
 for(const row of proposal.entries){const view=materialView(row.materials);assert.equal(view.consumption,row.materials.consumption.text);if(row.materials.price.kind==='stated')assert.equal(view.price,row.materials.price.text);else assert.equal(view.price,'Цена в правиле не указана.');}
 assert.equal(escapeMaterialHtml('<img onerror="x">&'), '&lt;img onerror=&quot;x&quot;&gt;&amp;');
});
test('read-only fixture serves art and fonts but rejects mutations and unrelated files',async()=>{
 const server=createSpellMaterialsFixture();await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{
  const response=await fetch(origin+'/examples.json');assert.equal(response.status,200);const examples=await response.json();assert.equal(examples.length,105);assert.equal(examples.filter(e=>e.materials).length,104);
  for(const e of examples){const image=await fetch(origin+'/'+e.art);assert.equal(image.status,200);assert.equal(Buffer.from(await image.arrayBuffer()).subarray(0,8).toString('hex'),'89504e470d0a1a0a');}
  const font=await fetch(origin+'/fonts/inter-400-800-cyrillic.woff2');assert.equal(font.status,200);assert.equal(Buffer.from(await font.arrayBuffer()).subarray(0,4).toString(),'wOF2');
  assert.equal((await fetch(origin+'/examples.json',{method:'POST',body:'{}'})).status,405);
  assert.equal((await fetch(origin+'/api/progress')).status,404);assert.equal((await fetch(origin+'/catalog/spell-materials.proposal.json')).status,404);
 }finally{await new Promise(r=>server.close(r));}
});
