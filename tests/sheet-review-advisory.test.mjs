import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../docs/design/prototypes/sheet-review-80.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function reviewValue('),html.indexOf('function load('));
function run(value,min,max,checked=true){
 const nodes={summary:{},apply:{},confirmed:{checked}};
 const field={key:'test',min,max,input:{value,setAttribute(k,v){this[k]=v}},status:{classList:{toggle(){}}}};
 const ctx=vm.createContext({fields:[field],confirmedResult:false,$:id=>nodes[id]});vm.runInContext(source+';update()',ctx);return {nodes,field,update:()=>vm.runInContext('update()',ctx),changed:()=>vm.runInContext('changed(fields[0])',ctx),value:()=>vm.runInContext('selectedValue(fields[0])',ctx)};
}
test('review prototype permits game deviations with a warning and no GM approval requirement',()=>{
 for(const [value,min,max] of [['8',0,7],['31',1,30],['21',1,20],['0',1,20]]){
  const {nodes,field}=run(value,min,max);assert.equal(nodes.apply.disabled,false);assert.equal(field.input['aria-invalid'],'false');assert.match(field.status.textContent,/Предупреждение/);
 }
});
test('review prototype keeps missing, unsafe and malformed values blocked',()=>{
 for(const value of ['', '-1','1.5','NaN','Infinity','9007199254740992','1e3'])assert.equal(run(value,0,7).nodes.apply.disabled,true,value);
 assert.equal(run('0',0,7).nodes.apply.disabled,false);
 assert.equal(run('8',0,7,false).nodes.apply.disabled,true,'source review confirmation remains required');
});

test('GM agreement is optional and applies only to its exact reviewed value',()=>{
 const h=run('8',0,7);h.field.agreedValue=JSON.stringify(['8',0,7]);h.update();
 assert.match(h.field.status.textContent,/Согласовано с мастером/);assert.equal(h.nodes.apply.disabled,false);
 h.field.input.value='9';h.update();assert.match(h.field.status.textContent,/Предупреждение/);assert.equal(h.nodes.apply.disabled,false);
 h.field.agreedValue=null;h.update();assert.equal(h.field.input.value,'9');assert.equal(h.nodes.apply.disabled,false);
 h.field.input.value='-1';h.field.agreedValue=JSON.stringify(['-1',0,7]);h.update();assert.equal(h.nodes.apply.disabled,true);
});


test('changing dependent HP maximum invalidates agreement without deleting current HP',()=>{
 const nodes={summary:{},apply:{},confirmed:{checked:true}};
 const make=(key,value,max)=>({key,max,input:{value,setAttribute(){}},status:{classList:{toggle(){}}}});
 const maximum=make('hp.max','27',999),current=make('hp.current','30',27);
 current.agreedValue=JSON.stringify(['30',0,27]);
 const ctx=vm.createContext({fields:[maximum,current],confirmedResult:false,$:id=>nodes[id]});
 vm.runInContext(source+';update()',ctx);assert.match(current.status.textContent,/Согласовано/);
 maximum.input.value='28';vm.runInContext('update()',ctx);assert.equal(current.agreedValue,null);assert.match(current.status.textContent,/Предупреждение/);assert.equal(nodes.apply.disabled,false);
 maximum.input.value='27';vm.runInContext('update()',ctx);assert.match(current.status.textContent,/Предупреждение/,'old agreement cannot revive');
 maximum.input.value='40';vm.runInContext('update()',ctx);assert.doesNotMatch(current.status.textContent,/Согласовано|Предупреждение/);assert.equal(current.input.value,'30');
});


test('explicit unknown resolves a missing optional value without manufacturing zero',()=>{
 const h=run('',0,27);
 assert.equal(h.nodes.apply.disabled,true,'an unreviewed blank still needs a decision');
 h.field.leaveUnknown=true;h.update();
 assert.equal(h.nodes.apply.disabled,false);
 assert.equal(h.field.input.disabled,true);assert.equal(h.field.input.hidden,true);
 assert.equal(h.value(),null);
 assert.match(h.field.status.textContent,/неизвестным.*не ноль/);
 h.field.leaveUnknown=false;h.update();
 assert.equal(h.nodes.apply.disabled,true);
 h.field.input.value='0';h.update();
 assert.equal(h.value(),0);
 assert.equal(h.nodes.apply.disabled,false);
});

test('choosing unknown invalidates group confirmation and prior GM agreement',()=>{
 const h=run('8',0,7);h.nodes.result={hidden:false};
 h.field.agreedValue=JSON.stringify(['8',0,7]);h.field.leaveUnknown=true;h.changed();
 assert.equal(h.field.agreedValue,null);
 assert.equal(h.nodes.confirmed.checked,false);
 assert.equal(h.nodes.result.hidden,true);
 assert.equal(h.nodes.apply.disabled,true,'explicit group confirmation remains necessary');
 h.nodes.confirmed.checked=true;h.update();assert.equal(h.nodes.apply.disabled,false);
 assert.equal(h.value(),null);assert.equal(h.field.input.value,'8','the previous draft is retained');
 h.field.leaveUnknown=false;h.changed();
 assert.equal(h.field.input.value,'8');assert.equal(h.field.input.disabled,false);assert.equal(h.field.input.hidden,false);
 assert.match(h.field.status.textContent,/Предупреждение/);
 assert.equal(h.nodes.confirmed.checked,false);
});

test('unknown HP maximum is not treated as zero or copied into current HP',()=>{
 const nodes={summary:{},apply:{},confirmed:{checked:true}};
 const make=(key,value,max)=>({key,max,input:{value,setAttribute(){}},status:{classList:{toggle(){}}}});
 const maximum=make('hp.max','',999),current=make('hp.current','12',27);
 maximum.leaveUnknown=true;
 const ctx=vm.createContext({fields:[maximum,current],confirmedResult:false,$:id=>nodes[id]});
 vm.runInContext(source+';update()',ctx);
 assert.equal(current.max,null);assert.equal(current.input.value,'12');
 assert.doesNotMatch(current.status.textContent,/Предупреждение/);assert.equal(nodes.apply.disabled,false);
 maximum.leaveUnknown=false;vm.runInContext('update()',ctx);assert.equal(nodes.apply.disabled,true);
 maximum.input.value='8';vm.runInContext('update()',ctx);
 assert.equal(current.max,8);assert.match(current.status.textContent,/Предупреждение/);
 assert.equal(current.input.value,'12');assert.equal(nodes.apply.disabled,false);
});

test('unknown remains a per-field decision, not a global bypass for unsafe input',()=>{
 const nodes={summary:{},apply:{},confirmed:{checked:true}};
 const make=(key,value,leaveUnknown=false)=>({key,max:7,leaveUnknown,input:{value,setAttribute(){}},status:{classList:{toggle(){}}}});
 const missing=make('quantity','',true),unsafe=make('charges','-1');
 const ctx=vm.createContext({fields:[missing,unsafe],confirmedResult:false,$:id=>nodes[id]});
 vm.runInContext(source+';update()',ctx);assert.equal(nodes.apply.disabled,true);
 assert.equal(unsafe.input.disabled,false);assert.equal(unsafe.valid,false);
 unsafe.input.value='0';vm.runInContext('update()',ctx);assert.equal(nodes.apply.disabled,false);
 assert.equal(missing.input.value,'');assert.equal(missing.valid,true);
});
