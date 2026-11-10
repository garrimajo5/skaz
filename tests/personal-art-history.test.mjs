import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function fixture(options){
 class Element{
  constructor(tag){this.tag=tag;this.children=[];this.style={};this.listeners={};}
  append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
  get firstChild(){return this.children[0];}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
  setAttribute(){} scrollIntoView(){}
  addEventListener(event,fn){this.listeners[event]=fn;}
 }
 const document={createElement:tag=>new Element(tag)},context=vm.createContext({document});
 vm.runInContext(readFileSync(new URL('../client/personal-art-history.js',import.meta.url),'utf8')+';globalThis.history=SkazPersonalArtHistory;',context);
 const container=new Element('div'),api=context.history.create(container,options);
 const all=()=>{const out=[];function walk(n){out.push(n);n.children.forEach(walk);}walk(container);return out;};
 return {api,container,all,click:label=>all().find(n=>n.tag==='button'&&n.textContent===label).listeners.click()};
}
test('history restoration addresses the selected revision and refresh never reconciles a pending mutation',async()=>{
 const restored=[];let reconciled=0;
 const f=fixture({load:async()=>[{revision:7,standard:false},{revision:3,standard:true}],onRestore:async id=>restored.push(id),onReset:async()=>{},onRetry:async()=>{},onReconcile:async()=>reconciled++});
 await f.api.refresh();await f.click('Восстановить версию 3 (стандартное)');
 assert.deepEqual(restored,[3]);assert.equal(reconciled,0);
 await f.click('Обновить историю');assert.equal(reconciled,0);
 await f.click('Сверить состояние и отказаться от ожидающего повтора');assert.equal(reconciled,1);
 assert.equal(f.all().filter(n=>n.tag==='button').length,6);
});
test('pending history load blocks another action and late completion cannot recreate destroyed editor',async()=>{
 let finish,resets=0;
 const f=fixture({load:()=>new Promise(resolve=>finish=resolve),onReset:async()=>resets++,onRestore:async()=>{},onRetry:async()=>{},onReconcile:async()=>{}});
 const loading=f.api.refresh();await f.click('Вернуть стандартное изображение');assert.equal(resets,0);
 f.api.destroy();finish([{revision:1,standard:false}]);await loading;
 assert.equal(f.container.children.length,0);
});

test('quota explains account scope and cleanup refreshes usage without reconciling pending commands',async()=>{
 let cleaned=0,reconciled=0,fail=false;
 const f=fixture({load:async()=>[],loadUsage:async()=>{if(fail)throw Error('Access lost');return {bytes:1048576,versions:2,bindings:1,limits:{bytes:33554432,versions:1000,bindings:1000}};},onCleanup:async()=>cleaned++,onReconcile:async()=>reconciled++});
 await f.api.refresh();assert.ok(f.all().some(n=>n.textContent?.includes('1.00 из 32 МиБ')));
 await f.click('Очистить истёкшую историю этой карточки');assert.equal(cleaned,1);assert.equal(reconciled,0);
 fail=true;await f.api.refresh();assert.ok(!f.all().some(n=>n.textContent?.includes('1.00 из 32 МиБ')));
});
