import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../client/login.js',import.meta.url),'utf8');
function harness(fetch){
 const submit={disabled:false},status={},password={value:'synthetic long password',focus(){}},name={value:'sample-user'},events={},stored=[],navigated=[];
 const form={querySelector:()=>submit,addEventListener:(name,fn)=>events[name]=fn};
 const elements={'login-form':form,'login-status':status,'login-password':password,'login-name':name};
 vm.runInNewContext(source,{document:{getElementById:id=>elements[id],body:{dataset:{}},addEventListener(){}},localStorage:{getItem:()=>null,setItem:(...args)=>stored.push(args)},crypto:{randomUUID:()=> 'event-id'},location:{replace:url=>navigated.push(url)},fetch,AbortSignal});
 return {submit,status,password,stored,navigated,send:()=>events.submit({preventDefault(){}})};
}
test('login submits once, clears password and broadcasts only a nonsensitive change marker',async()=>{
 let deliver,calls=0;const h=harness((url,options)=>{calls++;assert.equal(url,'/api/auth/login');assert.equal(JSON.parse(options.body).password,'synthetic long password');return new Promise(resolve=>deliver=resolve);});
 const pending=h.send();await h.send();assert.equal(calls,1);deliver(new Response(JSON.stringify({signedIn:true})));await pending;
 assert.equal(h.password.value,'');assert.deepEqual(h.navigated,['/']);assert.deepEqual(h.stored,[['skaz-auth-change','event-id']]);
});
test('login failure clears password, permits retry and renders a plain explanatory error',async()=>{
 const h=harness(async()=>new Response('<html>proxy error</html>',{status:502}));await h.send();assert.equal(h.password.value,'');assert.equal(h.submit.disabled,false);assert.match(h.status.textContent,/Сервер временно недоступен/);assert.equal(h.navigated.length,0);assert.equal(h.stored.length,0);
});
