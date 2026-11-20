import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=f=>JSON.parse(readFileSync(new URL('../catalog/'+f,import.meta.url)));
test('every pending named class source links to evidence without acquiring invented source identity or approval',()=>{const b=read('class-source-bibliography.json'),bounds=read('dndsu-class-scope-boundaries.json');assert.equal(b.records.length,8);for(const p of bounds.pending){assert.equal(p.bibliographyEvidenceIds.length,1);const r=b.records.find(r=>r.id===p.bibliographyEvidenceIds[0]);assert.ok(p.sourceResolution.some(s=>s.title===r.referenceTitle));assert.equal(r.numericDndsuSourceId,null);assert.equal(r.scopeDecision,'awaiting-independent-review');assert.equal(p.approvedInclusion,null);}assert.ok(b.records.every(r=>r.reusePermission==='not-established'));});
test('bibliography distinguishes missing primary evidence, third-party publication and experimental publisher content',()=>{const b=read('class-source-bibliography.json');assert.equal(b.summary.withPrimaryEvidence,7);assert.equal(b.summary.withoutVerifiedPrimaryEvidence,1);for(const r of b.records.filter(r=>r.publicationKind==='unresolved'))assert.equal(r.evidence.length,0);assert.equal(b.records.find(r=>r.id==='class-bibliography:plane-shift-kaladesh').publicationKind,'publisher-experimental-supplement');assert.equal(b.records.find(r=>r.id==='class-bibliography:morgrave').publicationKind,'author-described-unofficial-material');});
test('Sprouting Chaos creator evidence resolves publisher only, not translated version or rights',()=>{
 const r=read('class-source-bibliography.json').records.find(r=>r.id==='class-bibliography:sprouting-chaos');
 assert.equal(r.publicationKind,'third-party-sourcebook');
 assert.equal(r.publisher,'BoltNine Homebrew');
 assert.equal(r.evidence.length,2);
 assert.ok(r.evidence[0].url.includes('/5umv6w/'));
 assert.equal(r.evidence[1].sha256,'3dba939b01a811cc90321b5f90cdd2541248c725ef4e9e18dac94d8f42ded907');
 assert.equal(r.evidence[1].pages,23);
 assert.equal(r.exactTextVersion,'unverified');
 assert.equal(r.numericDndsuSourceId,null);
 assert.equal(r.scopeDecision,'awaiting-independent-review');
 assert.equal(r.reusePermission,'not-established');
});
