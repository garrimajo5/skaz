import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
function fixture(){
 const listeners={};let document;
 class Element{constructor(tag){this.tag=tag;this.children=[];this.isConnected=true;this.open=false;this.clicks=0;this.closes=0;}append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}contains(node){return node===this||this.children.some(c=>c.contains(node));}setAttribute(k,v){this[k]=v;}focus(){document.activeElement=this;}showModal(){this.open=true;}close(){this.open=false;this.closes++;this.onclose?.();}remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this);}click(){const e=event(this);listeners.click(e);if(!e.prevented){this.clicks++;this.onclick?.();}}}
 document={body:new Element('body'),createElement:tag=>new Element(tag),activeElement:null,addEventListener:(name,fn)=>listeners[name]=fn};
 const c=vm.createContext({document,window:{addEventListener:(name,fn)=>listeners[name]=fn}});vm.runInContext(readFileSync(new URL('../client/private-exit.js',import.meta.url),'utf8'),c);
 const root=new Element('fieldset'),inside=new Element('button'),outside=new Element('button'),main=new Element('dialog');root.append(inside);document.body.append(root,outside,main);outside.focus();
 return {api:vm.runInContext('SkazPrivateExit',c),listeners,root,inside,outside,main,document,get prompt(){return document.body.children.find(e=>e.className==='private-exit-dialog');},get stay(){return this.prompt.children[2].children[0];},get leave(){return this.prompt.children[2].children[1];}};
}
function event(target){return {target,prevented:0,stopped:0,preventDefault(){this.prevented++;},stopImmediatePropagation(){this.stopped++;}};}
test('stay blocks outside action, restores focus and leaves retry usable; explicit leave replays once',()=>{
 const f=fixture();f.api.register(f.root,()=>true);f.inside.click();assert.equal(f.prompt,undefined);f.outside.click();assert.equal(f.outside.clicks,0);assert.equal(f.prompt.role,'alertdialog');assert.equal(f.document.activeElement,f.stay);
 f.stay.click();assert.equal(f.prompt,undefined);assert.equal(f.document.activeElement,f.outside);f.inside.click();assert.equal(f.inside.clicks,2);
 f.outside.click();f.leave.click();assert.equal(f.outside.clicks,1);assert.equal(f.prompt,undefined);
});
test('Escape keeps pending UI by default; explicit leave closes only the captured dialog',()=>{
 const f=fixture();f.api.register(f.root,()=>true);const first=event(f.main);f.listeners.cancel(first);assert.equal(first.prevented,1);const prompt=f.prompt;const cancel=event(prompt);f.listeners.cancel(cancel);prompt.oncancel(cancel);assert.equal(f.main.closes,0);assert.equal(f.prompt,undefined);
 f.listeners.cancel(event(f.main));f.leave.click();assert.equal(f.main.closes,1);
});
test('session disposal closes confirmation without replaying stale action',()=>{
 const f=fixture();const release=f.api.register(f.root,()=>true);f.outside.click();const leave=f.leave;release();assert.equal(f.prompt,undefined);leave.click();assert.equal(f.outside.clicks,0);
});
test('page unload protection remains until settled or released; detached roots do not warn',()=>{
 const f=fixture();let pending=true;const release=f.api.register(f.root,()=>pending);const unload=event();f.listeners.beforeunload(unload);assert.equal(unload.prevented,1);assert.equal(unload.returnValue,'');pending=false;const settled=event();f.listeners.beforeunload(settled);assert.equal(settled.prevented,0);pending=true;f.root.isConnected=false;f.outside.click();assert.equal(f.prompt,undefined);release();
});
test('a detached navigation target or changed scope never replays',()=>{
 const f=fixture();f.api.register(f.root,()=>true);f.outside.click();f.outside.isConnected=false;f.leave.click();assert.equal(f.outside.clicks,0);
});