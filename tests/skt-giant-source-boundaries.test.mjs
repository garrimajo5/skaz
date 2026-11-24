import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url));
const load = path => JSON.parse(read(path));
const manifest = load('catalog/skt-giant-source-boundaries-2014.json');
const surfaces = manifest.stormGiantSurfaces;

test('the printed NPC, SRD and linked Legacy surfaces retain distinct combat facts', () => {
 const {srdReference:srd, printedNpcBlock:printed, legacyCompendiumChapter:chapter, legacyLinkedCard:card} = surfaces;
 for (const surface of [srd, printed, chapter, card]) {
  assert.equal(surface.armorClass, 16);
  assert.equal(surface.hitPoints, 230);
 }
 assert.deepEqual(srd.lightningRecharge, {kind:'d6',successFaces:[5,6]});
 assert.deepEqual(card.lightningRecharge, srd.lightningRecharge);
 assert.deepEqual(printed.lightningRecharge, {kind:'short-or-long-rest'});
 assert.deepEqual(chapter.lightningRecharge, printed.lightningRecharge);
 assert.deepEqual([srd.challengeRating, printed.challengeRating, chapter.challengeRating, card.challengeRating], [13,null,null,13]);
 assert.deepEqual([srd.skillsInBlock, printed.skillsInBlock, chapter.skillsInBlock, card.skillsInBlock], [true,false,false,true]);
 assert.equal(printed.listedAlignment, null);
 assert.equal(chapter.listedAlignment, 'chaotic-good');
});

test('SKT errata changes spellcasting without supplying missing monster fields', () => {
 const {srdReference:srd, printedNpcBlock:printed, npcErrataAmendment:errata, legacyCompendiumChapter:chapter, legacyLinkedCard:card} = surfaces;
 assert.deepEqual(srd.spellcasting, printed.spellcasting);
 assert.deepEqual([srd.spellcasting.placement, errata.spellcasting.placement], ['innate-trait','action']);
 assert.deepEqual([srd.spellcasting.dailyEach, errata.spellcasting.dailyEach], [3,1]);
 assert.deepEqual(srd.spellcasting.dailySpells, errata.spellcasting.dailySpells);
 assert.deepEqual(srd.spellcasting.atWill.filter(id => !errata.spellcasting.atWill.includes(id)), ['feather-fall']);
 assert.equal(srd.spellcasting.controlWeatherExplicitlyOneAction, null);
 assert.equal(errata.spellcasting.controlWeatherExplicitlyOneAction, true);
 assert.equal(errata.lightningRecharge, null);
 assert.equal(errata.skillsInBlock, null);
 assert.equal(errata.challengeRating, null);
 assert.deepEqual(chapter.spellcasting, errata.spellcasting);
 assert.deepEqual(card.spellcasting, errata.spellcasting);
});

test('equal CR and a base erratum never become variant stats or accepted aliases', () => {
 const {appendixCVariants:variants, cloudGiantBaseCorrection:cloud, printedNamedAttachments:attachments} = manifest;
 assert.equal(variants.length, 6);
 assert.equal(new Set(variants.map(row => row.variantUrl)).size, 6);
 assert.equal(new Set(variants.map(row => row.srdReferenceId)).size, 6);
 assert.deepEqual(variants.map(row => row.knownOptionCount), [null,null,1,1,2,1]);
 assert.ok(variants.every(row => row.srdChallengeRating === row.digitalIndexChallengeRating
  && row.canonicalId === null && !row.automaticMerge && !row.variantFullBodyVerified));
 assert.deepEqual([cloud.previous, cloud.corrected, cloud.sktVariantValue], [9,10,null]);
 assert.equal(cloud.matchesSrdReferenceField, true);
 assert.deepEqual(attachments.cards, ['Nimir','Orlekto','Shaldoor','Vaasha']);
 assert.equal(attachments.sharedBlockRef, 'skt:appendix-d:256:storm-giant');
 assert.equal(manifest.accepted, false);
 assert.equal(manifest.approvedDenominator, null);
 assert.equal(manifest.monsterManualFullComparison, 'not-established');
 assert.equal(manifest.reusePermissionForSktText, 'not-established');
});

test('source boundary references are pinned without changing the SRD catalog', () => {
 for (const [path, sha] of Object.entries(manifest.inputSha256)) {
  assert.equal(createHash('sha256').update(read(path)).digest('hex'), sha, path);
 }
 assert.equal(Object.keys(manifest.sources).length, 7);
 for (const {url,bytes,sha256} of Object.values(manifest.sources)) {
  assert.equal(new URL(url).protocol, 'https:');
  assert.ok(bytes > 0);
  assert.match(sha256, /^[0-9a-f]{64}$/);
 }
 const storm = load('catalog/srd51-giants.json').entries.find(row => row.id === 'srd51:2014:monster:storm-giant');
 assert.equal(storm.monster.challenge, '13');
 assert.equal(storm.source.usage, 'cc-by-4.0');
 assert.match(storm.text, /перезарядка 5–6/);
 assert.ok(storm.links.some(id => id.endsWith(':feather-fall')));
});
