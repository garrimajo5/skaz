import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {verifyIndividualDeployment} from '../scripts/verify-individual-deployment.mjs';
const origin='https://deployment.example',outerLogin={username:'synthetic-basic',password:'synthetic outer password'},account={login:'owner',password:'synthetic personal password'};
const basic='Basic '+Buffer.from(outerLogin.username+':'+outerLogin.password).toString('base64');
async function fixture(t,transform){
 const store=openStore(':memory:'),first=store.read();
 store.catalog.installBundled({version:store.catalog.previewBundled().version});
 store.access.apply({action:'bootstrap-owner',userId:'deployment-owner',displayName:'Synthetic',campaignId:first.context.campaignId,characterId:first.context.characterId});
 const auth=store.authentication();await auth.setPassword('deployment-owner',account.login,account.password);
 const server=createApp(store,{publicOrigin:origin,sessions:auth,individualWrites:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(()=>{store.close();resolve();})));
 const calls=[],base='http://127.0.0.1:'+server.address().port;let token;
 const fetchImpl=async(url,init)=>{
  assert.equal(new URL(url).origin,origin);assert.equal(init.redirect,'manual');calls.push({url,init});
  if(init.headers.Authorization!==basic)return new Response(null,{status:401});
  const headers=new Headers(init.headers);headers.delete('Authorization');const route=new URL(url).pathname;
  const response=await fetch(base+route,{...init,headers});
  if(route==='/api/auth/login'&&response.status===200)token=response.headers.get('set-cookie').split(';')[0].split('=')[1];
  return transform?await transform(route,response,init):response;
 };
 return {store,auth,calls,fetchImpl,token:()=>token};
}

test('individual deployment check uses real scoped sessions, leaves games unchanged and revokes its own cookie',async t=>{
 const f=await fixture(t),game=f.store.read(),history=f.store.history();
 const result=await verifyIndividualDeployment({origin,outerLogin,account,fetchImpl:f.fetchImpl});
 assert.equal(result.checks.length,6);assert.ok(result.catalogTotal>0);assert.deepEqual(f.store.read(),game);assert.deepEqual(f.store.history(),history);assert.equal(f.auth.check(f.token()),null);
 const text=JSON.stringify(result);for(const value of [account.password,outerLogin.password,f.token(),game.state.profile.name])assert.ok(!text.includes(value));
 assert.ok(f.calls.every(call=>!call.url.includes(account.password)&&!call.url.includes(outerLogin.password)));
});

test('credential redirects are rejected without following a different origin',async t=>{
 const f=await fixture(t,async(route,response,init)=>{
  if(route==='/'&&!init.headers.Cookie){await response.body?.cancel();return new Response(null,{status:302,headers:{Location:'https://foreign.example/'}});}return response;
 });
 await assert.rejects(verifyIndividualDeployment({origin,outerLogin,account,fetchImpl:f.fetchImpl}));assert.equal(f.token(),undefined);assert.ok(f.calls.every(call=>new URL(call.url).origin===origin));
});

test('bad cookie flags and mismatched export fail safely and still revoke the temporary session',async t=>{
 for(const fault of ['cookie','export']){
  const f=await fixture(t,async(route,response)=>{
   if(fault==='cookie'&&route==='/api/auth/login'&&response.status===200){const headers=new Headers(response.headers);headers.set('set-cookie',headers.get('set-cookie').replace('; Secure',''));return new Response(await response.text(),{status:200,headers});}
   if(fault==='export'&&route==='/api/export/active-v9'){const value=await response.json();value.state.hp=0;return Response.json(value);}return response;
  });
  const before=f.store.read();await assert.rejects(verifyIndividualDeployment({origin,outerLogin,account,fetchImpl:f.fetchImpl}));assert.equal(f.auth.check(f.token()),null);assert.deepEqual(f.store.read(),before);
 }
});

test('unsafe origins never receive credentials and transport diagnostics cannot leak passwords',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw new Error(account.password);};
 await assert.rejects(verifyIndividualDeployment({origin:'http://deployment.example',outerLogin,account,fetchImpl}));assert.equal(calls,0);
 await assert.rejects(verifyIndividualDeployment({origin,outerLogin,account,fetchImpl}),error=>!error.message.includes(account.password));assert.equal(calls,1);
});
