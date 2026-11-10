import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {openStore} from '../server/store.mjs';
import {gameArtPackage} from '../server/game-art-package.mjs';
import {personalArtTransfer} from '../server/personal-art-transfer.mjs';
const source=openStore(':memory:');const base=gameArtPackage(source.exportActive(12),personalArtTransfer([]));source.close();
const state={revision:7,context:{campaignId:'campaign',characterId:'hero',sessionId:'session'}};
const file=value=>new Blob([JSON.stringify(value)],{type:'application/json'});
function fixture(request){
 const context=vm.createContext({Blob,AbortController,AbortSignal,crypto:{randomUUID:()=> 'fixed-id'}});
 for(const name of ['personal-art-command','game-art-transfer'])vm.runInContext(readFileSync(new URL('../client/'+name+'.js',import.meta.url),'utf8'),context);
 context.request=request;return vm.runInContext("SkazGameArtTransfer.create({identity:'alice',viewId:'window',request})",context);
}
test('lost import response retains byte-identical RAM command and blocks replacement/export until retry',async()=>{
 const calls=[];let lose=true;const api=fixture(async(url,options)=>{calls.push([url,options]);if(url==='/api/workspace')return Response.json(state);if(lose){lose=false;throw Error('Lost after commit');}return Response.json({...state,revision:8,replayed:true});});
 assert.equal((await api.prepare(file(base))).images,0);await assert.rejects(api.importPrepared(),/Lost/);assert.equal(api.pending,true);
 await assert.rejects(api.prepare(file(base)),/Сначала повтори/);await assert.rejects(api.exportPackage(),/Сначала повтори/);
 assert.equal((await api.retry()).replayed,true);assert.equal(api.pending,false);assert.equal(calls[1][1].body,calls[2][1].body);
 const sent=JSON.parse(calls[1][1].body);assert.equal(sent.expectedRevision,7);assert.equal(sent.destination,'new-campaign');assert.equal(sent.mutationId,'fixed-id');
 for(const [,o]of calls){assert.equal(o.cache,'no-store');assert.equal(o.credentials,'same-origin');assert.equal(o.redirect,'error');assert.equal(o.headers['X-Skaz-Identity'],'alice');assert.equal(o.headers['X-Skaz-View'],'window');}
 api.destroy();
});
test('malformed successful reply and permission failure retain pending command for safe retry',async()=>{
 const sent=[];let i=0;const api=fixture(async(url,o)=>{if(url==='/api/workspace')return Response.json(state);sent.push(o.body);return ++i===1?Response.json({ok:true}):i===2?Response.json({error:'Revoked'},{status:401}):Response.json({...state,revision:8,replayed:true});});
 await api.prepare(file(base));await assert.rejects(api.importPrepared(),/проверить/);await assert.rejects(api.retry(),/Revoked/);assert.equal(api.pending,true);await api.retry();assert.equal(new Set(sent).size,1);api.destroy();
});
test('bounded selection rejects old games and broken image associations before any write',async()=>{
 let writes=0;const api=fixture(async()=>{writes++;return Response.json(state);});
 await assert.rejects(api.prepare({size:65*1024*1024,text:()=>{throw Error('must not read');}}),/64/);
 await assert.rejects(api.prepare(file(base.game)),/пакет/);
 const bad=structuredClone(base);bad.personalArt.entries=[{catalogId:'missing',sha256:'a'.repeat(64),png:'YQ=='}];
 await assert.rejects(api.prepare(file(bad)),/связь/);assert.equal(writes,0);await assert.rejects(api.importPrepared(),/выбери/);api.destroy();
});
test('new invalid selection invalidates previous preview and close ignores late file read',async()=>{
 const api=fixture(async()=>Response.json(state));await api.prepare(file(base));await assert.rejects(api.prepare(file({})));await assert.rejects(api.importPrepared(),/выбери/);
 let finish;const pending=api.prepare({size:100,text:()=>new Promise(r=>finish=r)});api.destroy();finish(JSON.stringify(base));await assert.rejects(pending,/закрыт/);await assert.rejects(api.retry(),/закрыт/);
});
test('export checks exact source and current context; files never fall back to a plain game',async()=>{
 const bundle=structuredClone(base);bundle.game.source=structuredClone(state);
 const responses=[state,bundle,state];const api=fixture(async()=>Response.json(responses.shift()));assert.equal(JSON.parse(await (await api.exportPackage()).text()).app,'skaz-game-with-art');api.destroy();
 for(const changed of [{...state,revision:8},{...state,context:{...state.context,characterId:'other'}}]){const replies=[state,bundle,changed],other=fixture(async()=>Response.json(replies.shift()));await assert.rejects(other.exportPackage(),/изменилась/);other.destroy();}
});
test('parallel actions are blocked and destruction aborts requests without applying late response',async()=>{
 let resolve;const api=fixture(()=>new Promise(r=>resolve=r));const pending=api.prepare(file(base));await new Promise(r=>setImmediate(r));await assert.rejects(api.exportPackage(),/Дождись/);api.destroy();resolve(Response.json(state));await assert.rejects(pending,/закрыт/);
});
