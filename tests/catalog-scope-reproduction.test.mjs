import test from 'node:test';
import assert from 'node:assert/strict';
import {reproductionCases} from '../scripts/verify-catalog-scope-reproduction.mjs';
test('reproduction covers every scope input including class proposals and choices',()=>{
 const cases=reproductionCases('evidence','classes','2026-11-17');assert.equal(cases.length,12);assert.equal(new Set(cases.map(c=>c[2])).size,12);
 assert.deepEqual(cases.find(c=>c[0]==='catalog-class-choice-metadata.mjs')[1],['classes']);
 assert.equal(cases.at(-1)[0],'catalog-scope-register.mjs');
 assert.ok(cases.every(c=>!c[0].includes('fetch')&&!c[0].includes('server')));
 assert.throws(()=>reproductionCases('evidence','classes','unknown'));
});
