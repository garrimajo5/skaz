import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const report = JSON.parse(read('catalog/hotdq-monster-locators-2014.json'));
const previousText = read('catalog/skt-linked-adventure-boundaries-2014.json');
const previous = JSON.parse(previousText);

test('Hoard and combined Tyranny provide distinct monster appendix links', () => {
  const {separateHoardToc:hoard,combinedTyrannyToc:tyranny}=report;
  assert.equal(hoard.appendixBLabel,'Council Scorecard');
  assert.equal(hoard.appendixDLabel,'Monsters');
  assert.equal(tyranny.appendixDLabel,hoard.appendixDLabel);
  assert.notEqual(hoard.appendixDLocator,tyranny.appendixDLocator);
  assert.equal(tyranny.blagothkusLocator,previous.officialHeadingLinks.Blagothkus);
  assert.equal(report.previousD06Sha256,createHash('sha256').update(previousText.replaceAll('\r\n','\n')).digest('hex'));
  assert.equal(Object.keys(report.sources).length,5);
  assert.ok(Object.values(report.sources).every(source => source.bytes > 0 && /^[a-f0-9]{64}$/.test(source.sha256)));
});

test('neither dated public supplement has a match for the named monster', () => {
  assert.deepEqual(report.hoardOnlineSupplements.map(({version,pdfPages,stoneGiantPdfPage,blagothkusTextMatchPages})=>
    [version,pdfPages,stoneGiantPdfPage,blagothkusTextMatchPages]),[
    ['1',30,18,[]],['0.3',28,17,[]],
  ]);
});

test('SKT errata locators preserve the original observation without promoting a stat block', () => {
  assert.equal(report.ruleset,'5e-2014');
  assert.deepEqual(report.sktErrata.bookPages,[129,231]);
  assert.equal(report.sktErrata.addsFullStatBlock,false);
  assert.equal(report.baselineObservationId,previous.blagothkus.observation.id);
  assert.equal(report.fullBlockEquivalence,'unverified');
  assert.equal(report.rightsDecision,'unverified');
  assert.deepEqual(report.runtimeCatalogChanges,[]);
  assert.deepEqual(report.denominatorChanges,[]);
});
