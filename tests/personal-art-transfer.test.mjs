import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validatePersonalArtTransfer,personalArtTransfer,personalTransferLimits} from '../server/personal-art-transfer.mjs';
const manifest=JSON.parse(readFileSync(new URL('../catalog/art-manifest.json',import.meta.url)));
const bytes=readFileSync(new URL('../'+manifest.entries[0].files.thumbnail.path,import.meta.url));
const make=()=>personalArtTransfer([{catalogId:'srd51:2014:spell:shield',bytes}]);
test('companion bundle preserves normalized bytes and canonical ordering without carrying identities',()=>{
 const bundle=personalArtTransfer([{catalogId:'z',bytes},{catalogId:'a',bytes}]);
 const result=validatePersonalArtTransfer(bundle);assert.deepEqual(result.map(e=>e.catalogId),['a','z']);
 assert.deepEqual(result[0].bytes,bytes);assert.deepEqual(Object.keys(bundle),['app','schemaVersion','ruleset','scope','entries']);
});
test('base64 validation bounds input and rejects noncanonical encodings without stack overflow',()=>{
 for(const png of ['A'.repeat(4*Math.ceil(personalTransferLimits.fileBytes/3)+4),'A'.repeat(4*Math.ceil(personalTransferLimits.fileBytes/3)),'a===','A A=','AB==']){
  const bundle=make();bundle.entries[0].png=png;assert.throws(()=>validatePersonalArtTransfer(bundle),{status:422});
 }
});
test('bundle version, edition, scope, fields and entry count are strict',()=>{
 for(const patch of [{schemaVersion:2},{ruleset:'5e-2024'},{scope:'campaign'},{owner:'alice'},{entries:new Array(1001).fill(null)}])assert.throws(()=>validatePersonalArtTransfer({...make(),...patch}),{status:422});
 assert.throws(()=>validatePersonalArtTransfer(null),{status:422});
 assert.throws(()=>validatePersonalArtTransfer({...make(),entries:[null]}),{status:422});
});
