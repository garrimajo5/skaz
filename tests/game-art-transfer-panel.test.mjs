import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function fixture(transport,onImported=()=>{}){
 class Element{constructor(tag){this.tag=tag;this.children=[];this.style={};}append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}setAttribute(k,v){this[k]=v;}removeAttribute(k){delete this[k];}remove(){if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this);}scrollIntoView(){}}
 const issued=[],revoked=[],container=new Element('main');
 const context=vm.createContext({document:{createElement:tag=>new Element(tag)},URL:{createObjectURL:()=>{const url='blob:'+issued.length;issued.push(url);return url;},revokeObjectURL:url=>revoked.push(url)},transport,onImported,container});
 vm.runInContext(readFileSync(new URL('../client/personal-art-session.js',import.meta.url),'utf8'),context);
 vm.runInContext(readFileSync(new URL('../client/game-art-transfer-panel.js',import.meta.url),'utf8'),context);
 const panel=vm.runInContext('SkazGameArtTransferPanel.create(container,{transport,onImported})',context),root=container.children[0];
 const [title,note,exportButton,download,label,summary,importButton,retry,status]=root.children;return {panel,root,input:label.children[0],summary,importButton,retry,status,exportButton,download,issued,revoked,container,lock:()=>vm.runInContext('SkazPersonalArtSession.lock()',context)};
}
test('pending import prevents file replacement; retry success clears stale failure and invokes adoption once',async()=>{
 let pending=false,adopted=0;
 const f=fixture({get pending(){return pending;},prepare:async()=>({name:'<script>bad</script>',campaign:'Test',images:1,imageBytes:512,items:0,spells:0}),importPrepared:async()=>{pending=true;throw Error('Lost response');},retry:async()=>{pending=false;return {replayed:true};},destroy(){}},()=>{adopted++;});
 assert.equal(f.retry.hidden,true);assert.equal(f.retry.style.display,'none');assert.equal(f.download.style.display,'none');
 f.input.files=[{}];await f.input.onchange();assert.match(f.summary.textContent,/<script>bad/);assert.equal(f.summary.innerHTML,undefined);await f.importButton.onclick();assert.equal(f.input.disabled,true);assert.equal(f.retry.hidden,false);assert.match(f.status.textContent,/Lost response/);
 await f.retry.onclick();assert.equal(adopted,1);assert.equal(f.retry.hidden,true);assert.equal(f.input.disabled,false);assert.match(f.status.textContent,/Вторая игра не создана/);assert.equal(f.importButton.disabled,true);f.panel.destroy();
});
test('download URLs are replaced and released on subsequent operation and destruction',async()=>{
 const f=fixture({pending:false,exportPackage:async()=>new Blob(['package']),destroy(){}});await f.exportButton.onclick();assert.equal(f.download.href,'blob:0');assert.equal(f.download.hidden,false);
 await f.exportButton.onclick();assert.deepEqual(f.revoked,['blob:0']);assert.equal(f.download.href,'blob:1');f.panel.destroy();assert.deepEqual(f.revoked,f.issued);assert.equal(f.container.children.length,0);
});
test('late export after close creates no URL and no DOM resurrection',async()=>{
 let finish,destroyed=false;const f=fixture({pending:false,exportPackage:()=>new Promise(r=>finish=r),destroy(){destroyed=true;}});
 const pending=f.exportButton.onclick();assert.equal(f.root.disabled,true);f.panel.destroy();finish(new Blob(['private']));await pending;assert.equal(destroyed,true);assert.deepEqual(f.issued,[]);assert.equal(f.container.children.length,0);
});
test('account session lock releases the private download and clears the selected file even if abort fails',async()=>{
 const f=fixture({pending:false,exportPackage:async()=>new Blob(['private']),destroy(){throw Error('broken abort');}});await f.exportButton.onclick();f.input.value='private.json';f.summary.textContent='private name';f.lock();assert.deepEqual(f.revoked,f.issued);assert.equal(f.input.value,'');assert.equal(f.summary.textContent,'');assert.equal(f.container.children.length,0);
});
test('successful server import followed by UI adoption failure must never offer replay or second import',async()=>{
 const f=fixture({pending:false,prepare:async()=>({name:'Test',campaign:'Test',images:0,imageBytes:0,items:0,spells:0}),importPrepared:async()=>({revision:4}),destroy(){}},()=>{throw Error('render failed');});
 f.input.files=[{}];await f.input.onchange();await f.importButton.onclick();assert.match(f.status.textContent,/Новая игра создана/);assert.match(f.status.textContent,/Обнови экран/);assert.equal(f.retry.hidden,true);assert.equal(f.importButton.disabled,true);f.panel.destroy();
});
