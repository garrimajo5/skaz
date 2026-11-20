import test from 'node:test';
import assert from 'node:assert/strict';
import {auditCatalogInputHashes, catalogInputHash, loadCatalogDocuments} from '../scripts/verify-catalog-input-hashes.mjs';

const pinned = (path, raw) => JSON.stringify({inputSha256: {[path]: catalogInputHash(raw)}});

test('all committed catalog input pins refer to the actual current evidence, including reports outside reproduction subset', () => {
  const result = auditCatalogInputHashes(loadCatalogDocuments());
  assert.ok(result.checked > 100);
  assert.deepEqual(result.mismatches, []);
});

test('changed root and changed intermediate report are each diagnosed without mutation', () => {
  const root = '{"records":[]}\n', middle = pinned('catalog/root.json', root), leaf = pinned('catalog/middle.json', middle);
  const documents = new Map([['catalog/root.json', root], ['catalog/middle.json', middle], ['catalog/leaf.json', leaf]]);
  assert.deepEqual(auditCatalogInputHashes(documents).mismatches, []);
  documents.set('catalog/root.json', '{"records":[1]}\n');
  assert.deepEqual(auditCatalogInputHashes(documents).mismatches, [{file:'catalog/middle.json',dependency:'catalog/root.json',reason:'changed-input'}]);
  documents.set('catalog/middle.json', pinned('catalog/root.json', documents.get('catalog/root.json')));
  const before = [...documents];
  assert.deepEqual(auditCatalogInputHashes(documents).mismatches, [{file:'catalog/leaf.json',dependency:'catalog/middle.json',reason:'changed-input'}]);
  assert.deepEqual([...documents], before);
});

test('missing input and invalid pins cannot pass; line endings alone do not stale a pin', () => {
  const raw = '{\n"a":1\n}\n';
  const documents = new Map([['catalog/root.json', raw.replace(/\n/g,'\r\n')],['catalog/report.json',pinned('catalog/root.json',raw)]]);
  assert.deepEqual(auditCatalogInputHashes(documents).mismatches,[]);
  documents.delete('catalog/root.json');
  assert.equal(auditCatalogInputHashes(documents).mismatches[0].reason,'missing-input');
  for (const inputSha256 of [[],null,{'../secret.json':'0'.repeat(64)},{'catalog/root.json':'unknown'}]) {
    assert.throws(()=>auditCatalogInputHashes(new Map([['catalog/report.json',JSON.stringify({inputSha256})]])),/Invalid input/);
  }
});

test('legacy scopeSha256 pins are audited alongside modern input maps',()=>{
 const scope='{}';const docs=new Map([['catalog/scope-register-2014.json',scope],['catalog/proposal.json',JSON.stringify({scopeSha256:catalogInputHash(scope)})]]);
 assert.equal(auditCatalogInputHashes(docs).checked,1);
 docs.set('catalog/scope-register-2014.json','{"changed":true}');
 assert.equal(auditCatalogInputHashes(docs).mismatches.length,1);
});
