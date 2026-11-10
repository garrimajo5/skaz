import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function fixture(transport){
 class Element{
  constructor(){this.children=[];this.style={};}
  append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
  removeAttribute(key){delete this[key];}
 }
 const revoked=[],issued=[],statuses=[];let preview,history;
 const context=vm.createContext({Blob,crypto:{randomUUID:()=>String(Math.random())},document:{createElement:()=>new Element()},URL:{createObjectURL:()=>{const url='blob:'+issued.length;issued.push(url);return url;},revokeObjectURL:url=>revoked.push(url)},SkazPersonalArtPreview:{create:(_,options)=>{preview=options;return {setStatus:message=>statuses.push(message),destroy(){}};}},SkazPersonalArtHistory:{create:(_,options)=>{history=options;return {destroy(){}};}}});
 for(const name of ['session','command','editor'])vm.runInContext(readFileSync(new URL('../client/personal-art-'+name+'.js',import.meta.url),'utf8'),context);
 const container=new Element();context.container=container;context.transport=transport;
 const editor=vm.runInContext("SkazPersonalArtEditor.create(container,{characterId:'hero',catalogId:'shield',transport})",context);
 return {editor,container,revoked,issued,history,preview,statuses,lock:()=>vm.runInContext('SkazPersonalArtSession.lock()',context)};
}
test('reset and restore use scoped revision and replace/revoke the displayed image',async()=>{
 let revision=1,standard=false;const sent=[];
 const f=fixture({snapshot:async()=>({revision,standard,blob:standard?null:new Blob(['png'])}),history:async()=>[],change:async body=>{const c=JSON.parse(body);sent.push(c);assert.equal(c.expectedRevision,revision);revision++;standard=c.action==='reset';return {revision};}});
 await f.editor.initialized;assert.equal(f.issued.length,1);
 await f.history.onReset();assert.equal(f.revoked.length,1);
 await f.history.onRestore(1);assert.equal(f.issued.length,2);
 assert.match(f.statuses.at(-1),/обновлено/);
 assert.equal(sent[1].targetRevision,1);assert.equal(sent[1].characterId,'hero');assert.equal(sent[1].catalogId,'shield');
 f.editor.destroy();assert.deepEqual(f.revoked,f.issued);assert.equal(f.container.children.length,0);
});
test('two editors conflict explicitly; reconciliation updates revision before a new action',async()=>{
 let revision=1;const transport={snapshot:async()=>({revision,standard:true}),history:async()=>[],change:async body=>{const c=JSON.parse(body);if(c.expectedRevision!==revision)throw Error('Conflict');return {revision:++revision};}};
 const a=fixture(transport),b=fixture(transport);await Promise.all([a.editor.initialized,b.editor.initialized]);
 await a.history.onReset();await assert.rejects(b.history.onReset(),/Conflict/);
 await b.history.onReconcile();await b.history.onReset();assert.equal(revision,3);
 a.editor.destroy();b.editor.destroy();
});
test('shared gate blocks concurrent writes and closed editor ignores late snapshot',async()=>{
 let finish;const f=fixture({snapshot:()=>new Promise(resolve=>finish=resolve),history:async()=>[],change:async()=>{throw Error('must not write');}});
 await assert.rejects(f.history.onReset(),/Дождись/);
 f.editor.destroy();finish({revision:1,standard:false,blob:new Blob(['png'])});await f.editor.initialized;
 assert.equal(f.issued.length,0);assert.equal(f.container.children.length,0);
 await assert.rejects(f.history.onReset(),/закрыт/);
});
test('access failure removes a previously displayed private object URL and requires reconciliation',async()=>{
 let denied=false,writes=0;
 const f=fixture({snapshot:async()=>{if(denied)throw Error('Access revoked');return {revision:1,standard:false,blob:new Blob(['png'])};},history:async()=>{if(denied)throw Error('Access revoked');return [];},change:async()=>{writes++;return {revision:2};}});
 await f.editor.initialized;denied=true;
 await assert.rejects(f.history.load(),/Access revoked/);assert.deepEqual(f.revoked,f.issued);
 assert.equal(f.statuses.at(-1),'');
 await assert.rejects(f.history.onReset(),/сверь/);assert.equal(writes,0);
 denied=false;await f.history.onReconcile();assert.equal(f.issued.length,2);
 f.editor.destroy();assert.deepEqual(f.revoked,f.issued);
});
test('session lock clears current private image even if the transport cleanup throws',async()=>{
 const f=fixture({snapshot:async()=>({revision:1,standard:false,blob:new Blob(['private'])}),history:async()=>[],destroy(){throw Error('broken abort');}});await f.editor.initialized;assert.equal(f.issued.length,1);f.lock();assert.deepEqual(f.revoked,f.issued);assert.equal(f.container.children.length,0);await assert.rejects(f.history.onReset(),/закрыт/);
});
