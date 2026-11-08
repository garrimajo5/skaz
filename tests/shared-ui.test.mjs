import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../client/ui.js',import.meta.url),'utf8');
const context=vm.createContext({});vm.runInContext(source,context);
const row=vm.runInContext('SkazUI.entryRow',context);
const storage=await readFile(new URL('../client/storage.js',import.meta.url),'utf8');
const metadataSource=storage.slice(storage.indexOf('  function inventoryRowMetadata('),storage.indexOf('  async function inventory(',storage.indexOf('  function inventoryRowMetadata(')));
test('collapsed inventory metadata distinguishes zero and unknown charges per unit and bounds long stacks',()=>{
 const c=vm.createContext({esc:String});vm.runInContext(metadataSource,c);const metadata=vm.runInContext('inventoryRowMetadata',c);
 const text=metadata({quantity:4,chargeCounts:[0,null,7,2],entry:{item:{attunement:true,charges:{max:7}}}});
 assert.equal(text,'Требует настройки · Заряды: 0/7 · ?/7 · 7/7 · ещё 1');
 const html=row({name:{ru:'Палочка'},metadata:text});assert.match(html.match(/<summary>([\s\S]*?)<\/summary>/)[1],/0\/7 · \?\/7 · 7\/7/);
 assert.equal(metadata({quantity:1,entry:{}}),'Требование настройки не указано');
});
test('imported names, descriptions and badge cannot introduce active markup into shared rows',()=>{
 const html=row({name:{ru:'<img src=x onerror=alert(1)>',en:'" onclick="evil'},badge:'<script>x</script>',description:'</p><iframe src=x></iframe>',className:'" onclick="evil',detailsClass:'" open onclick="evil'});
 assert.doesNotMatch(html,/<(?:img|script|iframe)\b/);assert.doesNotMatch(html,/class="[^"]*" onclick=/);
 assert.match(html,/&lt;img/);assert.match(html,/&lt;\/p&gt;/);assert.match(html,/&quot; onclick=&quot;evil/);
});
test('description disclosure and mutations are separate keyboard targets, including absent descriptions',()=>{
 const html=row({name:{ru:'Предмет'},actions:'<button data-item="stable-id">Списать</button>',metadata:'Без настройки'});
 const summary=html.match(/<summary>([\s\S]*?)<\/summary>/)[1];assert.doesNotMatch(summary,/<button/);
 assert.ok(html.indexOf('</details>')<html.indexOf('data-item="stable-id"'));
 assert.match(html,/Сохранена справочная ссылка; описание не импортировано/);assert.doesNotMatch(html,/undefined|null/);
});
