import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function fixture(){const events={};const c=vm.createContext({window:{addEventListener:(name,fn)=>events[name]=fn}});vm.runInContext(readFileSync(new URL('../client/personal-art-session.js',import.meta.url),'utf8')+';globalThis.session=SkazPersonalArtSession;',c);return {session:c.session,events};}
test('session lock disposes every private component once even when one cleanup throws',()=>{
 const {session}=fixture(),calls=[];session.register(()=>{calls.push('first');throw Error('cleanup failure');});session.register(()=>calls.push('second'));session.lock();session.lock();assert.deepEqual(calls,['first','second']);assert.throws(()=>session.register(()=>{}),/закрыт/);assert.throws(()=>session.assertOpen(),/закрыт/);
});
test('released components are not retained and pagehide drops the remaining document resources',()=>{
 const {session,events}=fixture();let old=0,current=0;const release=session.register(()=>old++);release();session.register(()=>current++);events.pagehide();assert.equal(old,0);assert.equal(current,1);assert.throws(()=>session.assertOpen(),/закрыт/);
});
