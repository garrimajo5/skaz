import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL('../' + path, import.meta.url));
const report = JSON.parse(read('catalog/d01-extra-life-source-categories-2014.json'));
const readPinned = path => {
  const raw = read(path);
  assert.equal(createHash('sha256').update(raw).digest('hex'), report.inputSha256[path]);
  return JSON.parse(raw);
};

test('publisher categories preserve four exact observations and do not collapse the two Tortles', () => {
  const { records } = readPinned('catalog/scope-register-2014.json');
  const observations = new Map(records.map(row => [row.id, row]));
  assert.equal(new Set(report.records.map(row => row.cardUrl)).size, 4);
  assert.deepEqual(
    report.records.map(row => [row.name, row.sourceCode, row.uiCategory]),
    [
      ['Grung', 'oga', 'legacynoncore'],
      ['Locathah', 'lr', 'legacynoncore'],
      ['Tortle', 'ttp', 'legacynoncore'],
      ['Tortle', 'motm', '5e-expanded-rules'],
    ]
  );
  for (const row of report.records) {
    const original = observations.get(row.observationId);
    assert.equal(original.names.en, row.name);
    assert.equal(original.bibliographyEvidenceId ?? null, row.bibliographyEvidenceId);
  }
  assert.deepEqual(observations.get(report.records[3].observationId).sourceIds, ['158']);
});

test('shared UI category cannot resolve the open Grung rule status or advance scope', () => {
  const { sourceDecisions } = readPinned('catalog/effective-m0-review-2014.json');
  const stillOpen = new Set(sourceDecisions.map(row => row.observationId));
  assert.deepEqual(report.records.map(row => stillOpen.has(row.observationId)), [true, false, false, false]);
  assert.equal(report.witnesses.changelog.legacyExample, 'One Grung Above');
  assert.equal(report.officialRulesDisposition, 'unresolved');
  assert.equal(report.grungCardAccess.fullCharacterRulesVerified, false);
  assert.equal(report.appTextReusePermission, 'not-established');
  assert.equal(report.approvedDenominator, null);
});

test('historic organized play separates source lists from publisher admission statements', () => {
  const { scope, guide, records, guideListingIsRecordLevelRuling, catalogAdmissionDecided,
    fullCharacterRulesVerified } = report.organizedPlay;
  assert.equal(scope, 'adventurers-league-only');
  assert.equal(guide.version, '14.0');
  assert.equal(guide.effectiveOn, '2024-03-04');
  assert.equal(guide.pdfPage, 1);
  assert.equal(guide.pageCount, 5);
  assert.match(guide.sha256, /^[a-f0-9]{64}$/);
  assert.equal(guide.usesLatestPrintingForReprintedRules, true);
  assert.deepEqual(records.map(row => row.observationId), report.records.map(row => row.observationId));
  assert.deepEqual(records.map(row => [row.storefrontStatement, row.guide14SourceListing]), [
    ['explicitly-ineligible-for-adventurers-league', 'not-listed'],
    ['publisher-metadata-only', 'listed-digital-publication'],
    ['explicitly-permitted-for-adventurers-league', 'not-listed'],
    [undefined, 'listed-rulebook'],
  ]);
  assert.equal(guideListingIsRecordLevelRuling, false);
  assert.equal(catalogAdmissionDecided, false);
  assert.equal(fullCharacterRulesVerified, false);
});

test('historic Grung pregen sheets identify race fields without deciding catalog admission', () => {
  const historical = report.organizedPlay.historicalGrungSurrogate;
  assert.equal(historical.observationId, report.records[0].observationId);
  assert.equal(historical.publicationScope, 'campaign-replacement-character');
  assert.equal(historical.season, 7);
  assert.equal(historical.preview.namesSurrogate, false);
  assert.deepEqual(historical.guidance.map(source => [source.version,source.pdfPage]), [
    ['ToA Primer v1.0',2], ['AL Adaptation Guides v2.4',53],
  ]);
  assert.equal(historical.guidance[0].campaignScope.includes('CCC adventures'),true);
  assert.equal(historical.guidance[1].campaignScope.includes('CCC adventures'),false);
  assert.deepEqual(historical.archives.map(archive => [
    archive.tier,archive.pdfFiles,archive.firstPageGrungMentions,archive.raceFieldMatches,
    archive.sheet.class,archive.sheet.level,archive.sheet.race,archive.sheet.pdfPage,archive.sheet.characterName,
  ]), [
    [1,12,5,1,'Rogue',3,'Grung (green)',1,null],
    [2,12,5,1,'Rogue',8,'Grung (green)',1,null],
  ]);
  const assets = [historical.preview,...historical.guidance,...historical.archives];
  assert.equal(new Set(assets.map(source => source.url)).size,5);
  for (const source of assets) {
    assert.equal(new URL(source.url).protocol,'https:');
    assert.match(source.sha256,/^[a-f0-9]{64}$/);
    assert.ok(source.bytes > 0);
  }
  for (const {sheet} of historical.archives) {
    assert.match(sheet.sha256,/^[a-f0-9]{64}$/);
    assert.equal(sheet.pageCount,2);
  }
  assert.equal(historical.previewIdentityEquivalenceVerified,false);
  assert.equal(historical.raceRulesEquivalenceVerified,false);
  assert.equal(historical.catalogAdmissionDecided,false);
  assert.equal(report.officialRulesDisposition,'unresolved');
  assert.equal(report.appTextReusePermission,'not-established');
  assert.equal(report.approvedDenominator,null);
});

test('publisher trait previews bind to exact variants and preserve an unlisted increase as unknown', () => {
  const preview = report.traitPreviewComparison;
  const records = new Map(report.records.map(record => [record.observationId,record]));
  assert.match(preview.source.sha256,/^[a-f0-9]{64}$/);
  assert.equal(preview.source.url,'https://www.dndbeyond.com/species');
  for (const row of preview.rows) {
    assert.equal(row.cardPath,new URL(records.get(row.observationId).cardUrl).pathname);
  }
  assert.deepEqual(preview.rows.map(row => [row.displayedAbilityIncreases,row.distinguishingLabel]),[
    [{str:2,dex:1},'Limited Amphibiousness'],
    [{str:2,wis:1},'Survival Instinct'],
    [null,'Nature’s Intuition'],
  ]);
  const comparison = preview.tortleComparison;
  assert.deepEqual(comparison.variantObservationIds,preview.rows.slice(1).map(row => row.observationId));
  assert.equal(comparison.kind,'distinct-public-summaries');
  assert.equal(comparison.sharedLabelCount,4);
  assert.equal(comparison.fullBodyEquivalenceVerified,false);
  assert.equal(comparison.versionAndRightsReviewRequired,true);
  assert.equal(report.approvedDenominator,null);
});
