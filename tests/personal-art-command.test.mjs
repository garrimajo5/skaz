import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context=vm.createContext({});
vm.runInContext(readFileSync(new URL('../client/personal-art-command.js',import.meta.url),'utf8')+';globalThis.commands=SkazPersonalArtCommand;',context);
test('lost response retries identical bytes and mutation ID; changed command requires reconciliation',async()=>{
 const bodies=[];let sequence=0;
 const client=context.commands.create({newId:()=>String(++sequence),send:async body=>{bodies.push(body);if(bodies.length===1)throw Error('Lost response');return {revision:1};}});
 const command={characterId:'one',catalogId:'shield',expectedRevision:0,action:'set',png:'original',crop:{x:0,y:0,size:96}};
 await assert.rejects(client.submit(command),/Lost/);
 command.crop.x=1;
 await assert.rejects(client.submit(command),/предыдущую/);
 command.crop.x=0;
 assert.equal((await client.submit(command)).revision,1);
 assert.equal(bodies[0],bodies[1]);assert.equal(sequence,1);
 await client.submit({...command,expectedRevision:1});assert.equal(sequence,2);
});
test('in-flight submission cannot be duplicated or reconciled; destroyed editor rejects late completion',async()=>{
 let finish;const client=context.commands.create({newId:()=> 'id',send:()=>new Promise(resolve=>{finish=resolve;})});
 const first=client.submit({action:'reset'});
 await assert.rejects(client.submit({action:'reset'}),/Дождись/);
 assert.throws(()=>client.reconciled(),/выполняется/);
 client.destroy();finish({revision:1});await assert.rejects(first,/закрыт/);
 await assert.rejects(client.submit({action:'reset'}),/закрыт/);
});
test('definitive conflict stays pending until explicit reconciliation',async()=>{
 let sequence=0;const client=context.commands.create({newId:()=>String(++sequence),send:async()=>{throw Error('Conflict');}});
 await assert.rejects(client.submit({expectedRevision:0}),/Conflict/);
 await assert.rejects(client.submit({expectedRevision:1}),/предыдущую/);
 client.reconciled();await assert.rejects(client.submit({expectedRevision:1}),/Conflict/);
 assert.equal(sequence,2);
});
