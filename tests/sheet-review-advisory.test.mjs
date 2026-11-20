import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../docs/design/prototypes/sheet-review-80.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function reviewValue('),html.indexOf('function load('));
function run(value,min,max,checked=true){
 const nodes={summary:{},apply:{},confirmed:{checked}};
 const field={key:'test',min,max,input:{value,setAttribute(k,v){this[k]=v}},status:{classList:{toggle(){}}}};
 const ctx=vm.createContext({fields:[field],confirmedResult:false,$:id=>nodes[id]});vm.runInContext(source+';update()',ctx);return {nodes,field,update:()=>vm.runInContext('update()',ctx)};
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
