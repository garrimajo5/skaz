import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {validateCatalog} from '../server/catalog.mjs';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../client/catalog-import.js',import.meta.url),'utf8');
function harness(){
 let html='',opened=true,reloads=0;const elements=new Map(),requests=[];
 const get=id=>{if(id==='dialog')return{open:opened};if(id==='catalog-import-panel'&&!html.includes('catalog-import-panel'))return null;if(!elements.has(id))elements.set(id,{});return elements.get(id);};
 const context=vm.createContext({Blob,AbortSignal,document:{getElementById:get},modal:value=>html=value,closeModal:()=>opened=false,fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject})),SkazCatalog:{reload:async()=>reloads++}});vm.runInContext(source,context);
 return{get,requests,html:()=>html,reloads:()=>reloads,open:()=>vm.runInContext('SkazCatalogImport.open()',context),close:()=>opened=false,pick:file=>get('personal-catalog-file').onchange({target:{files:[file]}})};
}
const file={name:'<test>.json',size:100,text:async()=>JSON.stringify({schemaVersion:1,entries:[]})};
const report={records:1,added:1,unchanged:0,version:'reviewed',usage:{'reference-only':0,personal:1,'cc-by-4.0':0},sample:[{name:{ru:'<img>',en:'Rule'},source:{title:'Source',version:'1',terms:'<script>'}}]};
const respond=(r,p)=>r.resolve({ok:true,json:async()=>p});
const settle=()=>new Promise(r=>setImmediate(r));
test('personal import validates before confirmation and retries exact reviewed payload after response loss',async()=>{
 const h=harness();h.open();const preview=h.pick(file);await settle();assert.equal(h.requests[0].url,'/api/catalog/import/preview');respond(h.requests[0],report);await preview;
 assert.equal(h.requests.length,1);assert.match(h.html(),/&lt;test&gt;/);assert.match(h.html(),/&lt;script&gt;/);assert.doesNotMatch(h.html(),/<img>/);
 const apply=h.get('confirm-catalog-import').onclick();h.get('confirm-catalog-import').onclick();assert.equal(h.requests.length,2);h.requests[1].reject(new Error('lost'));await apply;
 assert.equal(h.get('confirm-catalog-import').disabled,false);assert.match(h.get('catalog-import-message').textContent,/повторить/);
 const retry=h.get('confirm-catalog-import').onclick();assert.equal(h.requests[2].options.body,h.requests[1].options.body);respond(h.requests[2],{added:0,unchanged:1});await retry;assert.equal(h.reloads(),1);assert.match(h.html(),/Материалы добавлены/);
});
test('invalid or oversized personal files never reach server; late preview cannot reopen a dialog',async()=>{
 const h=harness();h.open();await h.pick({...file,size:600000});assert.equal(h.requests.length,0);await h.pick({...file,text:async()=>'{bad'});assert.equal(h.requests.length,0);assert.match(h.get('catalog-import-message').textContent,/JSON/);
 const pending=h.pick(file);await settle();h.close();respond(h.requests[0],report);await pending;assert.doesNotMatch(h.html(),/ПРЕДПРОСМОТР/);
});

 test('copyable personal example is valid 2014 data with explicit personal provenance',()=>{
 const h=harness();h.open();const example=JSON.parse(h.get('catalog-example').textContent);
 const [entry]=validateCatalog(example);assert.equal(entry.source.usage,'personal');assert.equal(entry.ruleset,'5e-2014');assert.match(entry.text,/не официальное/);assert.match(h.html(),/readonly/);
 });
