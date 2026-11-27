import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(await readFile(new URL('../client/ui.js',import.meta.url),'utf8'),context);
const {noticePlacement,noticeClearance} = vm.runInContext('SkazUI',context);
const rect = (left,top,right,bottom) => ({left,top,right,bottom});

test('a fixed notification stays put when clear and moves above an occupied form',()=>{
 const view=rect(0,56,390,630),note=rect(20,534,370,606);
 assert.deepEqual(Array.from(noticeClearance(note,view,[])),[0,0]);
 const form=rect(16,547,336,593);
 assert.equal(noticePlacement(note.top,note.bottom,view.top,view.bottom,[form]),-67);
 assert.deepEqual(Array.from(noticeClearance(note,view,[form])),[0,-67]);
});

test('landscape placement uses nearby horizontal clearance without moving the search',()=>{
 const view=rect(0,0,844,244),note=rect(145,148,698,220);
 const buttons=[rect(22,118,822,249),rect(685,43,822,87)];
 const offset=noticeClearance(note,view,buttons);
 assert.ok(offset[0]<0&&offset[1]<0);
 const shifted=rect(note.left+offset[0],note.top+offset[1],note.right+offset[0],note.bottom+offset[1]);
 assert.ok(buttons.every(control=>shifted.right<=control.left||shifted.left>=control.right||shifted.bottom<=control.top||shifted.top>=control.bottom));
 assert.equal(noticeClearance(note,rect(0,112,844,172),buttons),undefined);
});

test('shrinking the visual viewport clamps a notice when there is free space',()=>{
 const view=rect(0,30,390,490),note=rect(20,555,370,627);
 assert.deepEqual(Array.from(noticeClearance(note,view,[])),[0,-145]);
});
