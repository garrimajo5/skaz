import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import {verifyTroodonCaptures, loadAlCaptures} from '../scripts/verify-catalog-al-captures.mjs';
import {selectedAlPreviewFields} from '../scripts/catalog-al-preview-version-review.mjs';

const read = name => JSON.parse(readFileSync(new URL('../catalog/' + name, import.meta.url)));
const sources = [{sourceId: '169', title: 'Synthetic AL', group: 'Other'}];
function inputs() {
  const evidence = read('al-troodon-boundary-evidence-2014.json');
  const scope = read('scope-register-2014.json');
  const captures = new Map();
  for (const row of evidence.records) {
    const ability = ['Сила', 'Ловкость', 'Телосложение', 'Интеллект', 'Мудрость', 'Харизма']
      .map(name => `<div class="stat" title="${name}">10 (+0)</div>`).join('');
    const html = `<div data-id="${row.observationId.slice(6)}"><span data-copy="${row.capturedName}"></span><span class="source-plaque" title="Synthetic AL">AL</span><div class="card__body new-article"><ul><li class="size-type-alignment">${row.sizeType}</li><li><strong>Класс Доспеха</strong>13</li><li><strong>Хиты</strong>22 (4к6 + 8)</li><li><strong>Скорость</strong>30 футов</li><li class="abilities">${ability}</li><li class="subsection"><p><strong>Умение.</strong> Синтетические данные.</p></li></ul><div class="card__footer">`;
    const bytes = Buffer.from(html);
    row.rawSha256 = createHash('sha256').update(bytes).digest('hex');
    row.selected = selectedAlPreviewFields(html, row.observationId, sources).selected;
    captures.set(row.observationId, bytes);
  }
  return [evidence, scope, sources, captures];
}

test('Troodon capture checker verifies bytes and fields without promoting or modifying observations', () => {
  const args = inputs();
  const before = JSON.stringify(args.slice(0, 3));
  assert.deepEqual(verifyTroodonCaptures(...args), {verifiedSecondaryCaptures: 2, primaryStatBlockVerified: false, automaticMerge: false});
  assert.equal(JSON.stringify(args.slice(0, 3)), before);
});

test('changed capture, forged extraction, swapped identities and source acceptance cannot pass', () => {
  for (const mutate of [
    ([e, , , captures]) => captures.delete(e.records[0].observationId),
    ([e, , , captures]) => captures.set(e.records[0].observationId, Buffer.from('changed')),
    ([e]) => e.records[0].selected.armorClass++,
    ([e]) => e.records[0].sizeType = 'Different creature type',
    ([e]) => e.records[0].capturedName = 'Another creature',
    ([e]) => e.records.reverse(),
    ([e]) => e.records.pop(),
    ([e]) => e.records[0].sourceIds = ['102'],
    ([e]) => e.records[0].originalNames.en = 'Troodon Zombie',
    ([e]) => e.records[0].primaryStatBlockRead = true,
    ([e]) => e.records[0].canonicalId = 'creature:troodon',
    ([e]) => e.automaticMerge = true,
    ([e]) => e.accepted = true
  ]) {
    const args = inputs();
    mutate(args);
    assert.throws(() => verifyTroodonCaptures(...args));
  }
});

test('capture loader reads exactly the local PDF and eight fixed HTML names, and reports missing files', () => {
  const paths = [];
  const captures = loadAlCaptures('synthetic-evidence', path => {paths.push(basename(path)); return Buffer.from(path);});
  assert.deepEqual(paths, ['jungle-preview.pdf', '5962.html', '5963.html', '5965.html', '5966.html', '5970.html', '5971.html', '5977.html', '6005.html']);
  assert.equal(captures.size, 9);
  assert.ok(captures.has('dndsu:bestiary:6005'));
  assert.throws(() => loadAlCaptures('missing', () => {throw Error('ENOENT');}), /ENOENT/);
});
