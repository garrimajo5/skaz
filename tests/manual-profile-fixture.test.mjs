import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createManualProfileFixture} from '../scripts/manual-profile-fixture.mjs';

test('manual RAM fixture loses only the first committed stats response, preserving exact replay and protection',async()=>{
 const f=createManualProfileFixture({loseFirstResponse:true});
 await new Promise(r=>f.server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+f.server.address().port,initial=f.snapshot();
 const command={mutationId:randomUUID(),expectedRevision:initial.workspace.revision,characterId:initial.workspace.context.characterId,stats:{...initial.workspace.characterStats,abilities:{...initial.workspace.characterStats.abilities,dex:32}}};
 const headers={'Content-Type':'application/json','X-Skaz-Client':'local-v1',Origin:origin};
 const send=(body=command,h=headers)=>fetch(origin+'/api/character-stats',{method:'POST',headers:h,body:JSON.stringify(body)});
 try{
  assert.equal((await send(command,{'Content-Type':'application/json'})).status,403);
  assert.deepEqual(f.snapshot(),initial);
  assert.equal((await send({...command,expectedRevision:initial.workspace.revision-1})).status,409);
  assert.deepEqual(f.snapshot(),initial);
  const first=await send();assert.equal(first.status,200);assert.equal(await first.text(),'{');
  const committed=f.snapshot();assert.equal(committed.lostResponses,1);assert.equal(committed.workspace.characterStats.abilities.dex,32);
  assert.equal(committed.history.length,initial.history.length+1);
  assert.deepEqual(committed.workspace.state,initial.workspace.state);
  assert.deepEqual(committed.workspace.characterSheet,initial.workspace.characterSheet);
  f.setProfileEditors(false);
  assert.match(await (await fetch(origin+'/')).text(),/data-profile-editors="disabled"/);
  assert.deepEqual(f.snapshot(),committed);
  const retry=await send();assert.equal(retry.status,200);assert.equal((await retry.json()).replayed,true);
  assert.deepEqual(f.snapshot(),committed);
  assert.equal((await send({...command,stats:{...command.stats,armorClass:17}})).status,409);
  assert.deepEqual(f.snapshot(),committed);
 }finally{f.server.closeAllConnections();await new Promise(r=>f.server.close(r));}
});

test('manual fixture is isolated and response loss is opt in',async()=>{
 assert.throws(()=>createManualProfileFixture({loseFirstResponse:'true'}));
 const a=createManualProfileFixture(),b=createManualProfileFixture();
 await Promise.all([a,b].map(f=>new Promise(r=>f.server.listen(0,'127.0.0.1',r))));
 try{
  const before=b.snapshot(),w=a.snapshot().workspace,origin='http://127.0.0.1:'+a.server.address().port;
  const response=await fetch(origin+'/api/character-stats',{method:'POST',headers:{'Content-Type':'application/json','X-Skaz-Client':'local-v1',Origin:origin},body:JSON.stringify({mutationId:randomUUID(),expectedRevision:w.revision,characterId:w.context.characterId,stats:{...w.characterStats,armorClass:17}})});
  assert.equal(response.status,200);assert.equal((await response.json()).characterStats.armorClass,17);
  assert.equal(a.snapshot().lostResponses,0);assert.deepEqual(b.snapshot(),before);
 }finally{await Promise.all([a,b].map(f=>new Promise(r=>{f.server.closeAllConnections();f.server.close(r);})))}
});


test('RAM recovery switch cannot be invoked by HTTP and never changes synthetic data',async()=>{
 const f=createManualProfileFixture();await new Promise(r=>f.server.listen(0,'127.0.0.1',r));
 try{
  const before=f.snapshot(),origin='http://127.0.0.1:'+f.server.address().port;
  assert.throws(()=>f.setProfileEditors('false'));assert.deepEqual(f.snapshot(),before);
  f.setProfileEditors(false);assert.match(await (await fetch(origin+'/')).text(),/data-profile-editors="disabled"/);
  assert.equal((await fetch(origin+'/api/profile-mode',{method:'POST'})).status,404);
  f.setProfileEditors(true);assert.doesNotMatch(await (await fetch(origin+'/')).text(),/data-profile-editors="disabled"/);assert.deepEqual(f.snapshot(),before);
 }finally{f.server.closeAllConnections();await new Promise(r=>f.server.close(r));}
});
