import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../client/storage.js',import.meta.url),'utf8');
const reader=source.slice(source.indexOf('  function readInventoryItem('),source.indexOf('  function addInventory('));
test('inventory reader uses the saved snapshot, escapes imported fields and returns to refreshed inventory without writes',()=>{
 let html='',returned=0;const button={};const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context=vm.createContext({URL,esc,state:{profile:{name:'Hero'}},modal:value=>html=value,$:()=>button,inventory:()=>returned++});vm.runInContext(reader,context);
 const item={quantity:2,entry:{name:{ru:'<script>name</script>',en:'Item'},text:'<img src=x onerror=bad()>',source:{title:'Source',version:'1',url:'https://example.com/source#page=2',terms:'Terms',attribution:'Author',changes:'Summary'},item:{attunement:true,attunementRequirement:'<condition>'}}};context.item=item;
 vm.runInContext('readInventoryItem(item)',context);assert.match(html,/В наличии: 2/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);assert.match(html,/&lt;condition&gt;/);assert.doesNotMatch(html,/<script>|<img/);assert.match(html,/noopener noreferrer/);assert.match(html,/Author/);button.onclick();assert.equal(returned,1);
 for(const url of ['javascript:alert(1)','data:text/html,test','https://name:password@example.com']){item.entry.source.url=url;vm.runInContext('readInventoryItem(item)',context);assert.doesNotMatch(html,/href=/);}
 item.entry.text='';vm.runInContext('readInventoryItem(item)',context);assert.match(html,/Текст не импортирован/);
});
