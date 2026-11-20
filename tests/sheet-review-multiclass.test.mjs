import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../docs/design/prototypes/sheet-review-80.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('function reviewValue('),html.indexOf('function load('));
const field=(key,value,leaveUnknown=false)=>({key,min:1,max:20,leaveUnknown,input:{value:String(value),setAttribute(){}},status:{classList:{toggle(){}}}});
function setup(wizard=3,warlock=2,total=5){
 const fields=[field('level.wizard',wizard),field('level.warlock',warlock),field('totalLevel',total)];
 const nodes={summary:{},apply:{},confirmed:{checked:true},'class-comparison':{},'class-status':{},'class-agreement-label':{},'class-agreement':{}};
 const ctx=vm.createContext({fields,classAgreement:null,confirmedResult:false,$:id=>nodes[id]});vm.runInContext(source,ctx);
 return {fields,nodes,ctx,state:()=>JSON.parse(vm.runInContext('JSON.stringify(classReviewState(fields))',ctx)),update:()=>vm.runInContext('update()',ctx)};
}
test('two class levels are compared to a separate manual total without changing fields',()=>{
 const h=setup();assert.equal(h.state().kind,'equal');h.update();assert.equal(h.nodes.apply.disabled,false);
 h.fields[2].input.value='6';h.update();assert.equal(h.state().kind,'mismatch');
 assert.match(h.nodes['class-status'].textContent,/3 \+ 2 = 5.*6/);assert.equal(h.nodes.apply.disabled,false);assert.equal(h.fields[2].input.value,'6');
 assert.equal(h.nodes['class-agreement'].checked,false,'GM agreement is optional');
});
test('an unknown class level does not become zero or overwrite the manual total',()=>{
 const h=setup();h.fields[0].leaveUnknown=true;h.update();assert.equal(h.state().kind,'unknown');
 assert.equal(h.nodes.apply.disabled,false);assert.equal(h.fields[2].input.value,'5');assert.doesNotMatch(h.nodes['class-status'].textContent,/3 \+ 2|= 2/);
 h.fields[2].leaveUnknown=true;h.update();assert.equal(h.nodes.apply.disabled,false);
});
test('unreviewed blank and malformed levels still require a decision',()=>{
 const h=setup();for(const raw of ['', '-1','1.5','Infinity']){h.fields[0].input.value=raw;h.update();assert.equal(h.state().kind,'invalid');assert.equal(h.nodes.apply.disabled,true);}
 h.fields[0].input.value='21';h.update();assert.equal(h.nodes.apply.disabled,false,'a safe game deviation remains allowed');
});
test('class agreement cannot revive after its condition changes; unrelated resources preserve it',()=>{
 const h=setup(3,2,6);h.ctx.classAgreement=h.state().fingerprint;h.update();assert.equal(h.nodes['class-agreement'].checked,true);
 h.fields.push(field('pact.1',2));h.fields[3].input.value='3';h.update();assert.equal(h.nodes['class-agreement'].checked,true);
 h.fields[0].input.value='4';h.update();assert.equal(h.ctx.classAgreement,null);
 h.fields[0].input.value='3';h.update();assert.equal(h.nodes['class-agreement'].checked,false);
 h.ctx.classAgreement=h.state().fingerprint;h.fields[1].leaveUnknown=true;h.update();assert.equal(h.ctx.classAgreement,null);
});
test('safe individual values with an unsafe sum do not produce a fabricated level',()=>{
 const h=setup(Number.MAX_SAFE_INTEGER,1,5);h.update();assert.equal(h.state().kind,'overflow');
 assert.equal(h.nodes.apply.disabled,false);assert.equal(h.fields[2].input.value,'5');assert.equal(h.ctx.classAgreement,null);
});
test('class and resource fields retain distinct source regions and values',()=>{
 const defs=html.slice(html.indexOf('const definitions='),html.indexOf('function options('));
 const ctx=vm.createContext({});vm.runInContext(defs+';this.definitions=definitions;',ctx);
 const rows=JSON.parse(JSON.stringify(ctx.definitions['multiclass-pact']));
 assert.deepEqual(rows.map(f=>f.value),[3,2,5,4,2,2]);
 assert.deepEqual(rows.map(f=>f.sourceField||f.key),['classes','classes','totalLevel','resourceGroups.0','resourceGroups.0','resourceGroups.1']);
 assert(rows[3].label.startsWith('Spellcasting'));assert(rows[5].label.startsWith('Pact Magic'));
 assert.equal(new Set(rows.map(f=>f.key)).size,rows.length);
});
