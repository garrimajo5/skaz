import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url));
const load = path => JSON.parse(read(path));
const report = load('catalog/skt-linked-adventure-boundaries-2014.json');

test('official errata changed the linked adventure header without supplying a monster stat block', () => {
 const linked = report.sktAppendixA;
 assert.deepEqual(linked.oldPrint, {printedPage:231,pdfPage:1,section:'Hoard of the Dragon Queen'});
 assert.deepEqual(linked.errata, {
  printedPage:231,pdfPage:2,headingAfter:'Tyranny of Dragons',replacementParagraphsAnnounced:3,scope:'linked-adventure-prose'
 });
 assert.deepEqual([linked.location,linked.namedCloudGiant,linked.namedGhostReference], ['Skyreach Castle','Blagothkus','Eigeron']);
 assert.equal(report.officialHeadingLinks['The Chosen Path'],'https://www.dndbeyond.com/sources/skt/the-chosen-path#EigeronsGhost');
 assert.equal(report.officialHeadingLinks.Blagothkus,'https://www.dndbeyond.com/sources/tod/monsters#Blagothkus');
});

test('same CR does not replace a named giant or make the Huge spirit an ordinary ghost', () => {
 const {blagothkus, eigeron} = report;
 assert.deepEqual(blagothkus.observation.sourceIds,['105']);
 assert.equal(blagothkus.index.displayedSource,'Tyranny of Dragons');
 assert.equal(blagothkus.index.cardUrl.split('/').at(-1),'17468-blagothkus');
 assert.equal(blagothkus.index.challengeRating,blagothkus.separateSrdReference.challengeRating);
 assert.equal(blagothkus.separateSrdReference.id,'srd51:2014:monster:cloud-giant');
 assert.equal(eigeron.index.digitalName,'Eigeron’s Spirit');
 assert.equal(eigeron.observation.name,"Eigeron's Ghost");
 assert.equal(eigeron.index.challengeRating,eigeron.separateSrdReference.challengeRating);
 assert.deepEqual([eigeron.index.size,eigeron.separateSrdReference.size],['Huge','medium']);
 for (const group of [blagothkus,eigeron]) {
  assert.equal(group.canonicalId,null);
  assert.equal(group.automaticAlias,false);
  assert.equal(group.fullStatBlock,'unverified');
 }
});

test('the Black Earth faction is a narrative reference alongside three distinct source-labelled listings', () => {
 const {blackEarth} = report;
 assert.equal(blackEarth.witness.printedPage,232);
 assert.equal(blackEarth.witness.encounterLocation,'Deadstone Cleft');
 assert.equal(blackEarth.witness.sktChapter,6);
 assert.equal(blackEarth.previousCultistStatus,'index-only');
 assert.deepEqual(blackEarth.index.map(card=>[card.digitalName,card.challengeRating,card.displayedSource]),[
  ['Black Earth Cultist','2',"Storm King's Thunder"],
  ['Black Earth Guard','2','Princes of the Apocalypse'],
  ['Black Earth Priest','3','Princes of the Apocalypse'],
 ]);
 assert.equal(new Set(blackEarth.index.map(card=>card.cardUrl)).size,3);
 assert.deepEqual(blackEarth.observations.map(row=>row.id),['dndsu:bestiary:4915','dndsu:bestiary:4912']);
 assert.equal(blackEarth.canonicalId,null);
 assert.equal(blackEarth.automaticAlias,false);
 assert.equal(blackEarth.fullStatBlocks,'unverified');
});

test('pinned source evidence leaves original observations, coverage and reuse undecided', () => {
 assert.equal(report.rulesetTarget,'5e-2014');
 assert.equal(report.accepted,false);
 assert.equal(report.historicalBookInventoryComplete,false);
 assert.equal(report.fullStatBlocksVerified,false);
 assert.equal(report.approvedDenominator,null);
 assert.equal(report.reusePermission,'not-established');
 assert.equal(Object.keys(report.sources).length,8);
 for (const {url,bytes,sha256} of Object.values(report.sources)) {
  assert.equal(new URL(url).protocol,'https:');
  assert.ok(bytes > 0);
  assert.match(sha256,/^[0-9a-f]{64}$/);
 }
 for (const [path,sha256] of Object.entries(report.inputSha256)) {
  assert.equal(createHash('sha256').update(read(path)).digest('hex'),sha256,path);
 }
 const registry = load('catalog/scope-register-2014.json').records;
 for (const observation of [report.blagothkus.observation,report.eigeron.observation,...report.blackEarth.observations]) {
  const entry = registry.find(row=>row.id===observation.id);
  assert.deepEqual(entry.sourceIds,observation.sourceIds);
  assert.deepEqual(entry.candidateIds,[]);
  assert.equal(entry.coverage.fullRules,'unverified');
 }
});
