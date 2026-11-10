import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('requested potion art progression preserves both sizes, provenance and supreme',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../catalog/art-manifest.json',import.meta.url)));
 const receipt=JSON.parse(readFileSync(new URL('../docs/design/potion-art-reassignment.json',import.meta.url)));
 const get=id=>manifest.entries.find(e=>e.id===id);
 assert.deepEqual(receipt.changes.map(e=>[e.id.split(':').at(-1),e.sourceArtId.split(':').at(-1)]),[
 ['potion-of-healing','potion-of-greater-healing'],['potion-of-greater-healing','potion-of-superior-healing'],['potion-of-superior-healing','potion-of-healing']]);
 for(const change of receipt.changes){const e=get(change.id);assert.equal(e.provenance.originalSha256,change.sourceSha256);assert.equal(e.files.original.derivedFrom,change.sourceSha256);assert.equal(e.files.thumbnail.derivedFrom,change.sourceSha256);assert.equal(e.version,2);}
 assert.deepEqual(get(receipt.unchanged.id),receipt.unchanged);
});
