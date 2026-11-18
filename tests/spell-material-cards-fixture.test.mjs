import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaterialCardsFixture} from '../scripts/spell-material-cards-fixture.mjs';
test('material-card RAM fixture fails one lookup only and protects its QA switch',async t=>{
 const {server}=createMaterialCardsFixture();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const origin='http://127.0.0.1:'+server.address().port,path='/api/catalog/entry?id=srd51%3A2014%3Aspell%3Afireball&includeMaterials=1';
 assert.equal((await fetch(origin+'/qa/material-failure')).status,403);assert.equal((await fetch(origin+'/qa/material-failure',{method:'POST',headers:{Origin:'https://foreign.invalid'}})).status,403);
 assert.equal((await fetch(origin+'/qa/material-failure',{method:'POST',headers:{Origin:origin}})).status,204);
 assert.equal((await fetch(origin+path)).status,503);const retried=await fetch(origin+path);assert.equal(retried.status,200);assert.equal((await retried.json()).materialReferences.length,1);
 assert.equal((await fetch(origin+'/api/workspace')).status,200);
});