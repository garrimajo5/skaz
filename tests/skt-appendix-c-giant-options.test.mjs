import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url));
const report = JSON.parse(read('catalog/skt-appendix-c-giant-options-2014.json'));

test('all six index variants keep their own URL and index CR', () => {
  const [inputPath, hash] = Object.entries(report.inputSha256)[0];
  const raw = read(inputPath);
  assert.equal(createHash('sha256').update(raw).digest('hex'), hash);
  const residualVariants = JSON.parse(raw).publisherResidual
    .filter(row => row.category === 'explicit-variant-label');
  assert.deepEqual(
    report.digitalVariants.map(row => [row.digitalName, row.cardUrl, row.indexChallengeRating]),
    residualVariants.map(row => [row.digitalName, row.cardUrl, row.challengeRating])
  );
  assert.equal(new Set(report.digitalVariants.map(row => row.cardUrl)).size, 6);
});

test('named groups have five actions and unheaded fragments stay unattached', () => {
  const covered = report.digitalVariants.filter(row => row.printedHeading);
  const open = report.digitalVariants.filter(row => !row.printedHeading);
  assert.deepEqual(covered.map(row => [row.printedHeading, row.actionHeadings]), [
    ['Frost Giants', ['Weighted Net']],
    ['Hill Giants', ['Squash']],
    ['Stone Giants', ['Fling', 'Rolling Rock']],
    ['Storm Giants', ['Thunderous Stomp']],
  ]);
  assert.deepEqual(open.map(row => row.digitalName), ['Cloud Giant (variant)', 'Fire Giant (variant)']);
  assert.ok(open.every(row => !row.actionHeadings.length &&
    row.placement === 'parent-heading-not-attested-on-page'));
  assert.ok(covered.every(row => row.placement === 'additional-actions-for-existing-giant'));
  assert.deepEqual(report.unassignedPageHeadings, ['Siege Monster', 'Tackle']);
  assert.ok(report.digitalVariants.every(row => row.digitalEquivalence === 'unverified' &&
    row.canonicalId === null));
  assert.equal(report.approvedDenominator, null);
  assert.equal(report.publisherAppendix.appTextReusePermission, 'not-established');
});
