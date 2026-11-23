import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url));
const report = JSON.parse(read('catalog/skt-appendix-d-npc-composition-2014.json'));

test('Appendix D composition accounts for each blank-CR publisher card without changing its observation', () => {
  const [inputPath, hash] = Object.entries(report.inputSha256)[0];
  const raw = read(inputPath);
  assert.equal(createHash('sha256').update(raw).digest('hex'), hash);

  const residual = JSON.parse(raw).publisherResidual
    .filter(row => row.category === 'blank-cr');
  assert.deepEqual(
    report.namedCards.map(card => [card.name, card.indexCardUrl]),
    residual.map(row => [row.digitalName, row.cardUrl])
  );
  assert.equal(new Set(report.namedCards.map(card => card.indexCardUrl)).size, 4);
  assert.ok(residual.every(row => row.challengeRating === null));
});

test('four identifiable NPC cards reference one local stat block without assigning a CR or canonical identity', () => {
  const { sharedStatBlock, namedCards, publisherAppendix } = report;
  assert.equal(sharedStatBlock.blocksOnPage, 1);
  assert.equal(sharedStatBlock.challengeRating, null);
  assert.equal(sharedStatBlock.equivalenceToMonsterManual, 'unverified');
  assert.equal(publisherAppendix.appTextReusePermission, 'not-established');
  assert.equal(report.approvedDenominator, null);
  assert.ok(namedCards.every(card => card.kind === 'named-npc-attachment' &&
    card.statBlockRef === sharedStatBlock.localRef && card.canonicalId === null));
});
