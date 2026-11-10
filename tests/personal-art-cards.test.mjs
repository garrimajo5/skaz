import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function fixture(){
 class Element{constructor(){this.children=[];this.connected=true;}get isConnected(){return this.connected&&(!this.parent||this.parent.isConnected);}append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}remove(){this.connected=false;if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}}
 const host=new Element(),dialog={open:true},calls=[],transports=[],editors=[];let scope={identity:'owner-id',characterId:'hero-id',viewId:'view-id',name:'Герой'},observe;
 const context=vm.createContext({document:{body:new Element(),getElementById:()=>dialog,createElement:()=>new Element(),addEventListener(){}},MutationObserver:class{constructor(fn){observe=fn;}observe(){}},SkazStorage:{personalArtScope:()=>scope},SkazPersonalArtTransport:{create(options){calls.push(options);const transport={destroyed:0,destroy(){this.destroyed++;}};transports.push(transport);return transport;}},SkazPersonalArtEditor:{create(target,options){const editor={destroyed:0,destroy(){this.destroyed++;options.transport.destroy();}};editors.push(editor);return editor;}},window:{addEventListener(){}}});
 for(const file of ['personal-art-session','personal-art-cards'])vm.runInContext(readFileSync(new URL('../client/'+file+'.js',import.meta.url),'utf8'),context);
 return {host,dialog,calls,transports,editors,get scope(){return scope;},set scope(value){scope=value;},sweep:()=>observe(),mount:()=>vm.runInContext('SkazPersonalArtCards',context).mount(host,{id:'srd51:2014:spell:shield',name:{ru:'Щит'}}),lock:()=>vm.runInContext('SkazPersonalArtSession.lock()',context),button:()=>host.children[0].children[0]};
}
test('card editor is lazy, fixed to one identity/hero, and does not fetch in disabled scope',()=>{
 const f=fixture();f.scope=null;assert.equal(f.mount(),null);assert.equal(f.calls.length,0);
 f.scope={identity:'a',characterId:'hero',viewId:'window',name:'А'};f.mount();assert.equal(f.calls.length,0);f.button().onclick();assert.equal(f.calls.length,1);assert.equal(f.calls[0].identity,'a');assert.equal(f.calls[0].characterId,'hero');assert.equal(f.calls[0].catalogId,'srd51:2014:spell:shield');
 f.button().onclick();assert.equal(f.editors[0].destroyed,1);assert.equal(f.transports[0].destroyed,1);
});
test('switching hero before opening cannot launch an editor in the new scope',()=>{
 const f=fixture();f.mount();const button=f.button();f.scope={...f.scope,characterId:'other'};button.onclick();assert.equal(f.calls.length,0);assert.equal(f.host.children.length,0);
});
test('dialog close, removed card and permission loss dispose private resources once',()=>{
 for(const cause of ['close','detach','permission','identity']){
  const f=fixture();f.mount();f.button().onclick();if(cause==='close')f.dialog.open=false;if(cause==='detach')f.host.remove();if(cause==='permission')f.scope=null;if(cause==='identity')f.scope={...f.scope,identity:'different'};
  f.sweep();f.sweep();assert.equal(f.editors[0].destroyed,1,cause);assert.equal(f.transports[0].destroyed,1,cause);
 }
});
test('session lock removes unopened and open card controls',()=>{
 const f=fixture();f.mount();f.button().onclick();f.mount();f.lock();assert.equal(f.host.children.length,0);assert.equal(f.editors[0].destroyed,1);
});