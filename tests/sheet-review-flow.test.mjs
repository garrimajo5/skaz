import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const root = new URL('../docs/design/', import.meta.url);
const html = readFileSync(new URL('prototypes/sheet-review-80.html', root), 'utf8');
const script = readFileSync(new URL('prototypes/sheet-review-80.js', root), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('fixtures/sheet-visual/manifest.json', root), 'utf8'));

// Small DOM adapter: execute the complete shipped prototype and its real handlers.
// It checks HTML bindings; it does not claim layout/native focus/browser coverage.
async function form(scenario = 'conflicting-pages') {
 const all = [];
 let document;
 class HTMLElement {
  constructor() { this.id=''; this.value=''; this.checked=false; this.hidden=false; this.disabled=false; this.children=[]; this.handlers={}; this.classList={toggle(){}}; all.push(this); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children=[...children]; }
  setAttribute(key,value) { this[key]=value; }
  addEventListener(name,callback) { this.handlers[name]=callback; }
  focus() { document.activeElement=this; }
  showModal() { this.open=true; }
 }
 const names = {select:'HTMLSelectElement',input:'HTMLInputElement',button:'HTMLButtonElement',img:'HTMLImageElement',canvas:'HTMLCanvasElement',dialog:'HTMLDialogElement',form:'HTMLFormElement',div:'HTMLDivElement',p:'HTMLParagraphElement',label:'HTMLLabelElement',h2:'HTMLHeadingElement'};
 const classes=Object.fromEntries(Object.values(names).map(name=>[name,class extends HTMLElement {}]));
 const create=tag=>new (classes[names[tag]]??HTMLElement)();
 document={body:{dataset:{}},activeElement:null,createElement:create,createTextNode:text=>({textContent:text}),getElementById:id=>all.find(node=>node.id===id)??null};
 for(const [,tag,id] of html.matchAll(/<(\w+)\b[^>]*\bid="([^"]+)"/g)){const node=create(tag);node.id=id;}
 const node=id=>{const found=document.getElementById(id);assert(found,id);return found;};
 node('scenario').value=scenario;
 const requests=[];
 const context=vm.createContext({document,HTMLElement,...classes,Image:class {async decode(){}},fetch:async url=>{requests.push(url);return {ok:true,json:async()=>structuredClone(manifest)};}});
 vm.runInContext(script,context);
 await new Promise(resolve=>setImmediate(resolve));
 assert(document.getElementById('field-'+({ 'zero-charges':'charges', 'multiclass-pact':'level.wizard' }[scenario]??'hpMax')),node('summary').textContent);
 const read=expression=>{const value=vm.runInContext('JSON.stringify('+expression+')',context);return value===undefined?undefined:JSON.parse(value);};
 const input=(id,value)=>{const n=node('field-'+id);n.focus();n.value=value;n.oninput();};
 const unknown=id=>{const f=vm.runInContext('fields.find(f=>f.key==='+JSON.stringify(id)+')',context);f.unknownBox.checked=true;f.unknownBox.onchange();};
 const submit=()=>{node('confirmed').checked=true;node('confirmed').onchange();node('review').onsubmit({preventDefault(){}});};
 const select=(id,value)=>{const n=node(id);n.focus();n.value=value;n.onchange();};
 return {node,read,input,unknown,select,submit,context,requests,document};
}

test('discard decisions are applied at submit or cancel, independent of any queued close',async()=>{
 const h=await form();
 const discard=h.node('discard');
 const scenario=h.node('scenario');
 const requestChange=()=>{scenario.value='zero-charges';scenario.onchange();};
 const choose=value=>{
  const button=h.document.createElement('button');
  button.value=value;
  discard.handlers.submit({submitter:button});
 };
 h.input('hpMax','36');
 requestChange();
 discard.handlers.cancel();
 assert.equal(scenario.value,'conflicting-pages');
 assert.equal(h.node('field-hpMax').value,'36');
 requestChange();
 choose('stay');
 assert.equal(h.node('field-hpMax').value,'36');
 requestChange();
 discard.handlers.close?.();
 choose('discard');
 assert.equal(scenario.value,'zero-charges');
 assert.equal(h.node('field-charges').value,'0');
 assert.equal(h.node('field-quantity').value,'');
});

test('unknown max HP → manual value → confirmation → correction requires a new confirmation',async()=>{
 const h=await form();
 assert.equal(h.node('field-hpMax').value,'');
 assert.equal(h.read('selectedValue(fields.find(f=>f.key==="hpMax"))'),undefined);
 assert.equal(h.node('apply').disabled,true,'blank is unresolved, not zero');
 h.unknown('classLevel');h.input('hpMax','33');
 assert.equal(h.read('fields.find(f=>f.key==="hpMax").value'),null,'original ambiguous candidate is not rewritten by the manual choice');
 assert.match(h.node('field-hpMax-status').textContent,/Исправлено вами/);
 assert.equal(h.node('apply').disabled,true,'typing does not confirm a group');
 h.submit();
 const first=h.read('confirmation');
 assert.deepEqual(first.values.find(f=>f.fieldId==='hpMax'),{fieldId:'hpMax',value:33,selection:'corrected',provenance:'manual-correction'});
 assert.match(h.node('result').textContent,/Максимум хитов: 33/);
 h.input('hpMax','35');
 assert.equal(h.read('confirmation'),null);
 assert.equal(h.node('confirmed').checked,false);assert.equal(h.node('result').hidden,true);
 assert.equal(h.node('apply').disabled,true);assert.equal(h.node('field-hpMax').value,'35');
 assert.equal(h.document.activeElement,h.node('field-hpMax'),'edit does not replace or blur the input');
 h.node('review').onsubmit({preventDefault(){}});assert.equal(h.read('confirmation'),null,'stale submit is not accepted');
 vm.runInContext('update()',h.context);assert.equal(h.node('field-hpMax').value,'35');
 h.submit();assert.equal(h.read('confirmation').values.find(f=>f.fieldId==='hpMax').value,35);
 assert.equal(first.values.find(f=>f.fieldId==='hpMax').value,33,'previous snapshot is not mutated');
 assert.deepEqual(h.requests,['../fixtures/sheet-visual/manifest.json'],'no OCR/profile API was called');
});

test('explicit unknown is null; a manually entered zero remains allowed with a game warning',async()=>{
 const h=await form();h.unknown('classLevel');h.unknown('hpMax');h.submit();
 assert.deepEqual(h.read('confirmation').values.find(f=>f.fieldId==='hpMax'),{fieldId:'hpMax',value:null,selection:'left-unknown',provenance:'manual-unknown'});
 const f=vm.runInContext('fields.find(f=>f.key==="hpMax")',h.context);
 f.unknownBox.checked=false;f.unknownBox.onchange();h.input('hpMax','0');
 assert.match(h.node('field-hpMax-status').textContent,/Предупреждение/);
 h.submit();assert.equal(h.read('confirmation').values.find(f=>f.fieldId==='hpMax').value,0);
 assert.equal(f.agreementBox.checked,false,'GM agreement is optional');
 h.input('hpMax','-1');h.submit();assert.equal(h.read('confirmation'),null,'malformed input cannot be confirmed');
});

test('OCR zero and explicit unknown retain different provenance',async()=>{
 const h=await form('zero-charges');h.unknown('quantity');h.submit();
 assert.deepEqual(h.read('confirmation').values,[
  {fieldId:'charges',value:0,selection:'confirmed',provenance:'ocr-confirmed'},
  {fieldId:'quantity',value:null,selection:'left-unknown',provenance:'manual-unknown'}
 ]);
});


test('an unavailable/unloaded field set cannot produce an empty confirmation',async()=>{
 const h=await form();
 vm.runInContext('fields=[];confirmation=null;update()',h.context);
 h.submit();assert.equal(h.node('apply').disabled,true);assert.equal(h.read('confirmation'),null);
});


test('GM agreement marks the group dirty without relabeling an unchanged OCR total as a correction',async()=>{
 const h=await form('multiclass-pact');h.input('level.wizard','4');
 h.select('spell-coverage','unknown');
 h.node('class-agreement').checked=true;h.node('class-agreement').onchange();
 assert.match(h.node('field-totalLevel-status').textContent,/Значение из сценария/);
 h.submit();const values=h.read('confirmation').values;
 assert.equal(values.find(f=>f.fieldId==='totalLevel').provenance,'ocr-confirmed');
 assert.equal(values.find(f=>f.fieldId==='level.wizard').provenance,'manual-correction');
});

test('explicitly unknown spell lists and confirmed-empty lists produce different snapshots',async()=>{
 const h=await form('multiclass-pact');
 h.submit();
 assert.equal(h.read('confirmation'),null,'blank coverage needs a decision');
 h.select('spell-coverage','unknown');
 h.submit();
 assert.deepEqual(h.read('confirmation.spells'),{fieldId:'spells',selection:'left-unknown',value:null,provenance:'manual-unknown'});
 h.select('spell-coverage','empty');
 assert.equal(h.read('confirmation'),null);
 assert.equal(h.node('confirmed').checked,false);
 assert.equal(h.node('result').hidden,true);
 assert.equal(h.document.activeElement,h.node('spell-coverage'));
 h.submit();
 assert.deepEqual(h.read('confirmation.spells'),{fieldId:'spells',selection:'corrected',value:{coverage:'complete',rows:[]},provenance:'manual-correction'});
 assert.match(h.node('result').textContent,/Подтверждён пустой список/);
});

test('partial spell review preserves verified rows, and a deferred row cannot be marked complete',async()=>{
 const h=await form('multiclass-pact');
 h.select('spell-coverage','partial');
 h.select('spell-row-choice','later');
 h.submit();
 assert.deepEqual(h.read('confirmation.spells.value'),{
  coverage:'partial',rows:[{rowId:'example-shield',name:'Щит',source:'wizard',location:'book'}]
 });
 assert.deepEqual(h.read('confirmation.values').filter(field=>field.fieldId.startsWith('pact.')||field.fieldId.startsWith('spellcasting.')).map(field=>[field.fieldId,field.value]),[
  ['spellcasting.1',4],['spellcasting.2',2],['pact.1',2]
 ]);
 assert.match(h.node('result').textContent,/Остальные строки неизвестны/);
 h.select('spell-coverage','complete');
 h.submit();
 assert.equal(h.read('confirmation'),null);
 assert.match(h.node('spell-review-status').textContent,/несверенная строка/);
 h.select('spell-row-choice','exclude');
 h.submit();
 assert.equal(h.read('confirmation.spells.value.coverage'),'complete');
 assert.equal(h.read('confirmation.spells.value.rows.length'),1);
});

test('a known spell title does not set its class or location and edits require a fresh confirmation',async()=>{
 const h=await form('multiclass-pact');
 h.select('spell-coverage','complete');
 h.select('spell-row-choice','keep');
 h.select('spell-row-location','prepared');
 h.submit();
 assert.equal(h.read('confirmation'),null,'a mark in the sheet does not choose its source');
 h.select('spell-row-source','unknown');
 h.submit();
 assert.deepEqual(h.read('confirmation.spells.value.rows[1]'),{rowId:'example-misty-step',name:'Туманный шаг',source:null,location:'prepared'});
 h.select('spell-row-source','warlock');
 assert.equal(h.read('confirmation'),null);
 assert.equal(h.node('apply').disabled,true);
 h.select('spell-row-location','known');
 h.submit();
 assert.deepEqual(h.read('confirmation.spells.value.rows[1]'),{rowId:'example-misty-step',name:'Туманный шаг',source:'warlock',location:'known'});
});

test('an unsaved choice about list coverage survives cancelling a scenario change',async()=>{
 const h=await form('multiclass-pact');
 h.select('spell-coverage','partial');
 h.select('spell-row-choice','later');
 h.select('scenario','zero-charges');
 const dialog=h.node('discard');
 assert.equal(dialog.open,true);
 dialog.handlers.cancel();
 assert.equal(h.node('scenario').value,'multiclass-pact');
 assert.equal(h.node('spell-coverage').value,'partial');
 assert.equal(h.node('spell-row-choice').value,'later');
});
