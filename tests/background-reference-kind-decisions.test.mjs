import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {verifyBackgroundReferenceKinds} from '../scripts/verify-background-reference-kinds-2014.mjs';
const read=n=>JSON.parse(readFileSync(new URL('../catalog/'+n,import.meta.url),'utf8'));const inputs=()=>[read('background-collection-structures-2014.json'),read('background-reference-kind-decisions-2014.json')];
test('five independently reviewed reference page kinds, zero accepted units',()=>assert.deepEqual(verifyBackgroundReferenceKinds(...inputs()),{reviewedReferencePageKinds:5,acceptedStandaloneBackgrounds:0,acceptedComponentUnits:0,fullPrimaryRulesAccepted:0,approvedDenominator:null,runtimeChanged:false}));
test('same headings on changed HTML cannot inherit semantic approval',()=>{const a=inputs();a[0].records[0].htmlSha256='a'.repeat(64);assert.throws(()=>verifyBackgroundReferenceKinds(...a),/unreviewed/);});
test('unknown, duplicate and lost decisions fail',()=>{const a=inputs();a[1].records[1]=structuredClone(a[1].records[0]);assert.throws(()=>verifyBackgroundReferenceKinds(...a),/duplicate/);const b=inputs();b[1].records.pop();assert.throws(()=>verifyBackgroundReferenceKinds(...b),/scope/);});
test('classification cannot accept canonical unit, component, rule or auto bonus',()=>{for(const [key,value] of [['standaloneBackgroundUnit',true],['componentUnitsAccepted',true],['fullRulesAccepted',true],['canonicalId','made-up'],['automaticProfileChange',true],['manualPersonalChoiceRestricted',true]]){const a=inputs();a[1].records[0][key]=value;assert.throws(()=>verifyBackgroundReferenceKinds(...a),/decision changed/);}});
test('review provenance and source arrays cannot silently change',()=>{const a=inputs();a[1].review.fullPrimarySectionsReviewed=true;assert.throws(()=>verifyBackgroundReferenceKinds(...a),/provenance/);const b=inputs();b[1].records[0].sourceIds=['102'];assert.throws(()=>verifyBackgroundReferenceKinds(...b),/unreviewed/);});
test('stage completeness or denominator cannot be accepted by page kinds',()=>{const a=inputs();a[1].complete=true;assert.throws(()=>verifyBackgroundReferenceKinds(...a),/catalog acceptance/);const b=inputs();b[1].approvedDenominator=5;assert.throws(()=>verifyBackgroundReferenceKinds(...b),/catalog acceptance/);});

test('same-name Ravenloft and SCAG backgrounds cannot replace the 2021 feature collection', () => {
  const witness=read('background-ravenloft-source-witness-2014.json');
  const selection=read('background-collection-structure-selection-2014.json');
  const original=selection.records.find(row=>row.observationId===witness.observationId);
  assert.equal(witness.observationId,'dndsu:backgrounds:845');
  assert.equal(witness.legacyPublication.kind,'background-feature-collection');
  assert.equal(witness.legacyPublication.year,2021);
  assert.equal(witness.legacyPublication.reportedFeatures,5);
  const headings=new Set(original.expectedHeadings.map(row=>row.text));
  assert.ok(witness.sameNameCandidates.every(row=>headings.has(row.referenceHeading)));
  assert.deepEqual(witness.sameNameCandidates.map(row=>[row.englishName,row.publisherKind,row.year]),[
    ['Mist Wanderer','standalone-background',2026],
    ['Spirit Medium','standalone-background',2026],
    ['Inheritor','standalone-background',2015],
  ]);
  assert.equal(witness.fullPrimarySectionsVerified,false);
  assert.equal(witness.componentUnitsAccepted,false);
  assert.equal(witness.canonicalLinksAccepted,false);
  assert.equal(witness.approvedDenominator,null);
  assert.equal(witness.appTextReusePermission,'not-established');
  assert.equal(witness.runtimeChanged,false);
});

test('adventure and setting witnesses keep the four accepted page kinds but reserve full components', () => {
  const witness=read('background-adventure-source-witnesses-2014.json');
  const accepted=inputs()[1].records;
  assert.deepEqual(witness.records.map(row=>row.observationId),[846,847,848,856].map(id=>'dndsu:backgrounds:'+id));
  for (const row of witness.records) {
    const original=accepted.find(item=>item.observationId===row.observationId);
    assert.equal(row.type,original.verifiedReferencePageKind);
  }
  const [abyss,hoard,wildemount,dragonlance]=witness.records;
  assert.deepEqual(abyss.verifiedSections,['Substitute Features','Substitute Bonds']);
  assert.equal(hoard.editionCompanion.appendixTextEquivalent,'unresolved');
  assert.equal(wildemount.adaptationNamesVerified,false);
  assert.deepEqual(dragonlance.backgroundFeatLinks.map(row=>row.feat),['Squire of Solamnia','Initiate of High Sorcery']);
  assert.equal(dragonlance.publishedBonusFeatTablesVerified,false);
  const league=witness.units.find(unit=>unit.key==='al-dragonlance-campaign-source');
  assert.equal(league.stop,'PLANESCAPE');
  assert.deepEqual(league.forbidden,['Magic Initiate']);
  assert.equal(witness.componentUnitsAccepted,0);
  assert.equal(witness.fullPrimaryRuleSectionsVerified,false);
  assert.equal(witness.approvedDenominator,null);
  assert.equal(witness.textReusePermission,'not-established');
  assert.equal(witness.runtimeChanged,false);
});

test('Wildemount variants and standalone backgrounds preserve separate publisher scopes', () => {
  const report = read('background-adventure-component-witnesses-2014.json');
  const selection = read('background-collection-structure-selection-2014.json');
  const tracked = selection.records.find(row => row.observationId === report.wildemount.observationId);
  assert.deepEqual(tracked.expectedHeadings.map(row => row.text.split(' (')[0]), [
    'Прислужник', 'Преступник', 'Моряк', 'Мудрец', 'Шпион',
  ]);
  assert.deepEqual(report.wildemount.variantBaseBackgrounds, ['Acolyte', 'Criminal', 'Sailor', 'Sage', 'Spy']);
  assert.deepEqual(report.wildemount.standaloneBackgrounds, ['Grinner', 'Volstrucker Agent']);
  assert.equal(report.wildemount.printedVariantComponentsVerified, false);
  assert.notEqual(report.wildemount.locators['Heroic Chronicle'], report.wildemount.locators['Adapting Backgrounds']);
});

test('Dragonlance index, builder history and digital updates retain the missing campaign table', () => {
  const report = read('background-adventure-component-witnesses-2014.json');
  const old = read('background-adventure-source-witnesses-2014.json');
  const row = old.records.find(item => item.observationId === report.dragonlance.observationId);
  assert.deepEqual(Object.keys(report.dragonlance.previewPrerequisiteContext), row.backgroundFeatLinks.map(link => link.feat));
  assert.equal(Object.keys(report.dragonlance.indexedFeats).length, 9);
  assert.deepEqual(report.dragonlance.historicalBuilderInitiateChoices, ['Nuitari', 'Lunitari', 'Solinari']);
  assert.ok(report.dragonlance.digitalFixes.feats.every(feat => feat in report.dragonlance.indexedFeats));
  assert.equal(report.dragonlance.publishedBonusFeatTablesVerified, false);
  assert.equal(Object.keys(report.sources).length, 8);
  assert.ok(Object.values(report.sources).every(source => /^[0-9a-f]{64}$/.test(source.sha256)));
  assert.equal(report.componentUnitsAccepted, 0);
  assert.equal(report.fullPrimaryRuleSectionsVerified, false);
  assert.equal(report.approvedDenominator, null);
  assert.equal(report.textReusePermission, 'not-established');
  assert.equal(report.runtimeChanged, false);
});
