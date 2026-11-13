import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createConditionsFixture} from '../scripts/conditions-fixture.mjs';
test('synthetic conditions fixture corrupts only one successful response after commit; exact retry cannot duplicate history',async()=>{
 const f=createConditionsFixture({loseFirstResponse:true});await new Promise(r=>f.server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+f.server.address().port,initial=f.snapshot();
 const command={mutationId:randomUUID(),expectedRevision:initial.workspace.revision,label:'QA remove condition',state:{...initial.workspace.state,conditions:{active:['blinded'],exhaustion:2}}};
 const send=headers=>fetch(origin+'/api/workspace',{method:'PUT',headers,body:JSON.stringify(command)});
 try {
  assert.equal((await send({'Content-Type':'application/json'})).status,403);assert.equal(f.snapshot().lostResponses,0);assert.deepEqual(f.snapshot().workspace,initial.workspace);
  const headers={'Content-Type':'application/json','X-Skaz-Client':'local-v1',Origin:origin};
  const first=await send(headers);assert.equal(first.status,200);assert.equal(await first.text(),'{');
  const committed=f.snapshot();assert.equal(committed.lostResponses,1);assert.deepEqual(committed.workspace.state.conditions,command.state.conditions);assert.equal(committed.history.length,initial.history.length+1);
  const retry=await send(headers);assert.equal(retry.status,200);await retry.json();assert.deepEqual(f.snapshot(),committed);
  assert.deepEqual(committed.workspace.state.slots,initial.workspace.state.slots);assert.equal(committed.workspace.state.hp,initial.workspace.state.hp);assert.equal(committed.workspace.state.concentration,initial.workspace.state.concentration);
 }finally{f.server.closeAllConnections();await new Promise(r=>f.server.close(r));}
});
test('synthetic fixtures isolate committed changes, history and response loss',async()=>{
 assert.throws(()=>createConditionsFixture({loseFirstResponse:'true'}));
 const a=createConditionsFixture({loseFirstResponse:true}),b=createConditionsFixture();
 await Promise.all([a,b].map(f=>new Promise(r=>f.server.listen(0,'127.0.0.1',r))));
 try{
  const beforeB=b.snapshot(),initial=a.snapshot().workspace;
  const origin='http://127.0.0.1:'+a.server.address().port;
  const response=await fetch(origin+'/api/workspace',{method:'PUT',headers:{'Content-Type':'application/json','X-Skaz-Client':'local-v1',Origin:origin},body:JSON.stringify({mutationId:randomUUID(),expectedRevision:initial.revision,label:'QA clear all conditions',state:{...initial.state,conditions:{active:[],exhaustion:0}}})});
  assert.equal(response.status,200);assert.equal(await response.text(),'{');
  assert.deepEqual(a.snapshot().workspace.state.conditions,{active:[],exhaustion:0});
  assert.equal(a.snapshot().lostResponses,1);assert.deepEqual(b.snapshot(),beforeB);
  const result=await (await fetch(origin+'/api/workspace')).json();
  assert.deepEqual(result.state.conditions,{active:[],exhaustion:0});
 }finally{
  await Promise.all([a,b].map(f=>new Promise(r=>{f.server.closeAllConnections();f.server.close(r);})))
 }
});