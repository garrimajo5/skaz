import test from 'node:test';
import assert from 'node:assert/strict';
import {compareEvidence} from '../scripts/verify-catalog-class-evidence.mjs';
test('fresh-page comparison ignores only raw HTML hashes, never rule evidence or identities',()=>{
 compareEvidence({rawSha256:'new',records:[{id:'x',sourceId:'102',evidenceTextSha256:'proof'}]},{rawSha256:'old',records:[{id:'x',sourceId:'102',evidenceTextSha256:'proof'}]});
 assert.throws(()=>compareEvidence({id:'x'},{id:'y'}));assert.throws(()=>compareEvidence({evidenceTextSha256:'new'},{evidenceTextSha256:'old'}));assert.throws(()=>compareEvidence({sourceIds:['102']},{sourceIds:['117']}));
});
