import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../client/app.js',import.meta.url),'utf8');
const modal=source.slice(source.indexOf('let healthDialogTrigger = null;'),source.indexOf('function closeModal('));
test('replacing an open long dialog resets reading position and returns keyboard focus to its content',()=>{
 let opened=0,focused=0;const menu={open:true};const dialog={open:true,showModal(){opened++;this.open=true;}};
 const content={innerHTML:'Old card',scrollTop:750,scrollLeft:50,focus(options){focused++;assert.deepEqual({...options},{preventScroll:true});}};
 const context=vm.createContext({document:{getElementById:id=>id==='session-menu'?menu:null},SkazStorage:{decorate(){}},$:id=>id==='#dialog'?dialog:content});vm.runInContext(modal,context);
 vm.runInContext('modal("New related card")',context);
 assert.equal(opened,0);assert.equal(menu.open,false);assert.equal(content.innerHTML,'New related card');assert.equal(content.scrollTop,0);assert.equal(content.scrollLeft,0);assert.equal(focused,1);
 dialog.open=false;content.scrollTop=400;vm.runInContext('modal("New form")',context);assert.equal(opened,1);assert.equal(content.scrollTop,0);assert.equal(focused,2);
});

test('health dialog returns focus to a refreshed button only on the same screen and game', () => {
 const original = {dataset: {health: 'damage'}, isConnected: true};
 const heal = {dataset: {health: 'heal'}, focus() {assert.fail('focus moved to heal');}};
 const body = {};
 const dialog = {open: false, showModal() {this.open = true;}, contains: element => element === content};
 const document = {body, activeElement: body, getElementById() {return null;}};
 const content = {focus() {}};
 const focusOptions = [];
 const replacement = {dataset: {health: 'damage'}, focus(options) {focusOptions.push({...options});}};
 const context = vm.createContext({
  document,
  page: 'spells',
  SkazStorage: {contextKey: () => 'campaign A'},
  $: id => id === '#dialog' ? dialog : content,
  $$: () => [heal, replacement]
 });
 vm.runInContext(modal, context);
 const openHealth = () => {
  original.isConnected = true;
  document.activeElement = {closest: () => original};
  vm.runInContext('modal("health")', context);
  original.isConnected = false;
  dialog.open = false;
  document.activeElement = body;
 };
 openHealth();
 vm.runInContext('restoreHealthDialogFocus()', context);
 assert.deepEqual(focusOptions, [{preventScroll: true}]);

 openHealth();
 document.activeElement = content;
 vm.runInContext('restoreHealthDialogFocus()', context);
 assert.equal(focusOptions.length, 2);

 openHealth();
 document.activeElement = heal;
 vm.runInContext('restoreHealthDialogFocus()', context);
 assert.equal(focusOptions.length, 2);

 openHealth();
 context.SkazStorage.contextKey = () => 'campaign B';
 vm.runInContext('restoreHealthDialogFocus()', context);
 assert.equal(focusOptions.length, 2);
});
