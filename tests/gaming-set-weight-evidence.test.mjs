import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const raw=p=>readFileSync(new URL('../catalog/'+p,import.meta.url));
const d=JSON.parse(raw('gaming-set-weight-evidence-2014.json'));
const ids=JSON.parse(raw('gaming-sets-canonical-proposal-2014.json'));
test('two non-SRD gaming sets keep their identities, unknown weight and separate rights boundary',()=>{
 assert.equal(d.source.license,'not-established');assert.equal(d.source.title,'Basic Rules (2014)');
 assert.equal(d.inputSha256['catalog/gaming-sets-canonical-proposal-2014.json'],createHash('sha256').update(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw('gaming-sets-canonical-proposal-2014.json')).replace(/\r\n/g,'\n')).digest('hex'));
 assert.equal(d.records.length,2);
 for(const r of d.records){const before=ids.records.find(i=>i.proposedCanonicalId===r.candidateItemId);assert.ok(before);assert.equal(r.nameEn,before.nameEn);assert.equal(r.observationId,before.observationId);assert.equal(r.accepted,false);assert.equal(r.runtimeImported,false);assert.equal(r.weightBasis,'entire-listed-entry');}
 assert.equal(d.records.find(r=>r.nameEn==='Dragonchess set').weightLb,0.5);
 assert.equal(d.records.find(r=>r.nameEn==='Three-Dragon Ante set').weightLb,null);
 assert.equal(d.applicationBoundary.unknownWeightIsZero,false);
 assert.equal(d.applicationBoundary.automaticInventoryWeightChange,false);
});
