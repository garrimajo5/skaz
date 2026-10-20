import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../client/app.js',import.meta.url),'utf8');
const modal=source.slice(source.indexOf('function modal('),source.indexOf('function closeModal('));
test('replacing an open long dialog resets reading position and returns keyboard focus to its content',()=>{
 let opened=0,focused=0;const dialog={open:true,showModal(){opened++;this.open=true;}};
 const content={innerHTML:'Old card',scrollTop:750,scrollLeft:50,focus(options){focused++;assert.deepEqual({...options},{preventScroll:true});}};
 const context=vm.createContext({SkazStorage:{decorate(){}},$:id=>id==='#dialog'?dialog:content});vm.runInContext(modal,context);
 vm.runInContext('modal("New related card")',context);
 assert.equal(opened,0);assert.equal(content.innerHTML,'New related card');assert.equal(content.scrollTop,0);assert.equal(content.scrollLeft,0);assert.equal(focused,1);
 dialog.open=false;content.scrollTop=400;vm.runInContext('modal("New form")',context);assert.equal(opened,1);assert.equal(content.scrollTop,0);assert.equal(focused,2);
});
