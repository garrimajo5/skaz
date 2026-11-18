import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {validateCatalog} from '../server/catalog.mjs';
import {spellMaterialReferences,catalogWithMaterialReferences} from '../server/spell-material-references.mjs';
const entries=validateCatalog(bundledCatalog().bundle),identify=entries.find(e=>e.name.en==='Identify'),alarm=entries.find(e=>e.name.en==='Alarm');
const command=(store,fields)=>({mutationId:randomUUID(),expectedRevision:store.read().revision,...fields});
async function fixture(t,{authenticated=false,modified=false}={}){
 const store=openStore(':memory:');const p=store.catalog.previewBundled();if(!modified)store.catalog.installBundled({version:p.version});else store.catalog.importEntries({schemaVersion:1,entries:[{...identify,text:identify.text+' Личное исключение'}]},{apply:true});
 const context=store.read().context;
 if(authenticated)store.access.apply({action:'bootstrap-owner',userId:'material-qa',displayName:'Material QA',campaignId:context.campaignId,characterId:context.characterId});
 const server=createApp(store,authenticated?{authenticate:req=>req.headers['x-test-user']==='material-qa'?'material-qa':null}:{});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await new Promise(r=>server.close(r));store.close();});
 return {store,base:'http://127.0.0.1:'+server.address().port,context};
}
test('material references require exact entry content and never mutate it',()=>{
 const before=structuredClone(identify);const result=spellMaterialReferences([identify,alarm]);assert.equal(result.length,1);assert.equal(result[0].materials.consumption.kind,'retained');assert.deepEqual(identify,before);
 result[0].materials.price.text='changed';assert.match(spellMaterialReferences([identify])[0].materials.price.text,/100/);
 for(const change of [e=>e.text+=' override',e=>e.source.version='personal',e=>e.spell.components=['V'],e=>e.kind='item',e=>e.ruleset='5e-2024']){const e=structuredClone(identify);change(e);assert.deepEqual(spellMaterialReferences([e]),[]);}
});
test('catalog envelope is opt-in, limited to visible page and preserves base entries',async t=>{
 const {store,base}=await fixture(t),before=store.read(),history=store.history();
 const plain=await fetch(base+'/api/catalog?q=Identify').then(r=>r.json());assert.equal(Object.hasOwn(plain,'materialReferences'),false);
 const detailed=await fetch(base+'/api/catalog?q=Identify&includeMaterials=1').then(r=>r.json());assert.equal(detailed.materialReferences.length,1);const{materialReferences,...rest}=detailed;assert.deepEqual(rest,plain);
 const page=await fetch(base+'/api/catalog?kind=spell&limit=1&offset=0&includeMaterials=1').then(r=>r.json());assert.ok(page.materialReferences.every(r=>page.entries.some(e=>e.id===r.catalogId)));assert.ok(page.materialReferences.length<=1);
 const card=await fetch(base+'/api/catalog/entry?id='+encodeURIComponent(identify.id)+'&includeMaterials=1').then(r=>r.json());assert.deepEqual(card.entry,identify);assert.equal(card.materialReferences[0].catalogId,identify.id);
 const unknown=await fetch(base+'/api/catalog/entry?id='+encodeURIComponent(alarm.id)+'&includeMaterials=1').then(r=>r.json());assert.deepEqual(unknown.materialReferences,[]);
 for(const q of ['includeMaterials=0','includeMaterials=1&includeMaterials=1','includeMaterials=true','includeMaterials=1&unknown=x'])assert.equal((await fetch(base+'/api/catalog?'+q)).status,400);
 assert.deepEqual(store.read(),before);assert.deepEqual(store.history(),history);
});
test('modified same-ID spell remains readable locally but receives no shared material rule',async t=>{
 const {base}=await fixture(t,{modified:true});const result=await fetch(base+'/api/catalog?includeMaterials=1').then(r=>r.json());assert.equal(result.entries.length,1);assert.match(result.entries[0].text,/Личное исключение/);assert.deepEqual(result.materialReferences,[]);
});
test('material enrichment cannot bypass sign-in, Origin, private entries or revoked character access',async t=>{
 const {store,base,context}=await fixture(t,{authenticated:true});const headers={'x-test-user':'material-qa'};
 for(const route of ['/api/catalog?includeMaterials=1','/api/catalog/entry?id='+encodeURIComponent(identify.id)+'&includeMaterials=1'])assert.equal((await fetch(base+route)).status,401);
 assert.equal((await fetch(base+'/api/catalog?includeMaterials=1',{headers:{...headers,Origin:'https://elsewhere.invalid'}})).status,403);
 const privateEntry={...structuredClone(identify),id:'personal:private-material',text:'PRIVATE_RULE'};store.catalog.importEntries({schemaVersion:1,entries:[privateEntry]},{apply:true});
 const visible=await fetch(base+'/api/catalog?q=Identify&includeMaterials=1',{headers}).then(r=>r.json());assert.equal(visible.materialReferences.length,1);assert.ok(!JSON.stringify(visible).includes('PRIVATE_RULE'));
 assert.equal((await fetch(base+'/api/catalog/entry?id=personal:private-material&includeMaterials=1',{headers})).status,404);
 store.access.apply({action:'revoke-character',userId:'material-qa',campaignId:context.campaignId,characterId:context.characterId});assert.equal((await fetch(base+'/api/catalog?includeMaterials=1',{headers})).status,404);
});
test('reference reads preserve export format and round-trip catalog data',async t=>{
 const {store,base}=await fixture(t);store.setSpell(command(store,{characterId:store.read().context.characterId,catalogId:identify.id,status:'known'}));
 await fetch(base+'/api/catalog?includeMaterials=1');const file=store.exportActive(13);assert.equal(file.catalog.schemaVersion,1);assert.ok(!JSON.stringify(file).includes('materialReferences'));assert.ok(file.catalog.entries.some(e=>e.id===identify.id));
 const target=openStore(':memory:');try{target.importActive(command(target,{destination:'new-campaign',file}));assert.deepEqual(target.catalog.lookup(new URLSearchParams({id:identify.id})).entry,identify);}finally{target.close();}
});

import {readFileSync} from 'node:fs';
import {readReviewedMaterialSet} from '../server/spell-material-references.mjs';
test('a later unreviewed proposal revision cannot silently enter the API',()=>{
 const raw=readFileSync(new URL('../catalog/spell-materials.proposal.json',import.meta.url),'utf8');assert.equal(readReviewedMaterialSet(raw).entries.length,12);assert.equal(readReviewedMaterialSet(raw.replaceAll('\n','\r\n')).entries.length,12);
 const changed=JSON.parse(raw);changed.entries[0].materials.consumption.text='Unreviewed new claim';assert.equal(readReviewedMaterialSet(JSON.stringify(changed)),null);assert.equal(readReviewedMaterialSet('{broken'),null);
});
