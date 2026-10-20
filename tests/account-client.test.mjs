import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../client/account.js',import.meta.url),'utf8');
function client(fetch){
 const events={},body={dataset:{userId:'alice-user'},replaceChildren(){this.cleared=true;},append(){}};
 const context={document:{body,createElement:()=>({append(){}}),addEventListener:(name,fn)=>events[name]=fn},location:{href:'https://example.test/',origin:'https://example.test',replace(){}},Headers,Request,URL,AbortSignal,window:{fetch,addEventListener:(name,fn)=>events[name]=fn}};
 vm.createContext(context);vm.runInContext(source,context);return {context,events,body,api:vm.runInContext('SkazAccount',context)};
}
test('account adapter pins every API request to server identity and locks on 401',async()=>{
 const calls=[],c=client(async(input,options)=>{calls.push(options);return new Response('{}',{status:calls.length===1?200:401});});
 await c.context.window.fetch('/api/workspace',{headers:{'X-Skaz-Identity':'other-user'}});assert.equal(calls[0].headers.get('X-Skaz-Identity'),'alice-user');
 await assert.rejects(c.context.window.fetch('/api/me'));assert.equal(c.body.cleared,true);
 await assert.rejects(c.context.window.fetch('/api/workspace'));assert.equal(calls.length,2);
 assert.equal(c.api.prefix('pending'),'skaz-user-v1:alice-user:pending:');
});
test('cross-tab sign-in hides old DOM and discards an in-flight response',async()=>{
 let deliver;const c=client(()=>new Promise(resolve=>deliver=resolve));const pending=c.context.window.fetch('/api/workspace');
 c.events.storage({key:'skaz-auth-change'});assert.equal(c.body.cleared,true);deliver(new Response('{}'));await assert.rejects(pending);
});

test('restored history document and withdrawn hero hide the old interface',async()=>{
 const cached=client(async()=>new Response('{}'));cached.events.pageshow({persisted:true});assert.equal(cached.body.cleared,true);await assert.rejects(cached.context.window.fetch('/api/me'));
 const revoked=client(async()=>new Response('{}',{status:404}));await assert.rejects(revoked.context.window.fetch('/api/workspace'));assert.equal(revoked.body.cleared,true);
});
