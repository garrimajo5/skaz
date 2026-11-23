import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const inputs = [
  'catalog/skt-index-review-2014.json',
  'catalog/scope-register-2014.json',
  'catalog/skt-variant-boundaries-2014.json',
  'catalog/skt-tribal-spell-review-2014.json',
];

const adventure = 'https://www.dndbeyond.com/sources/dnd/skt';
const tocCaptureSha256 = '690ee5bc21ed57784d0835f617e36f9387195a0c1e5ef0efd9286fe8207b669d';
const tocEntries = [
  ['/sources/skt/creatures', 'Appendix C: Creatures'],
  ['/sources/skt/creatures#HulkingCrab', 'Hulking Crab'],
  ['/sources/skt/creatures#UthgardtShamanTribalSpells', 'Sidebar: Tribal Spells'],
  ['/sources/skt/creatures#NewGiantOptions', 'New Giant Options'],
  ['/sources/skt/special-npcs', 'Appendix D: Special NPCs'],
];

function tocWitnesses() {
  return tocEntries.map(([href, heading]) => ({
    heading,
    url: new URL(href, adventure).href,
  }));
}

export function verifyPublisherToc(raw) {
  if (createHash('sha256').update(raw).digest('hex') !== tocCaptureSha256) {
    throw new Error('SKT publisher capture SHA-256 mismatch');
  }
  const html = Buffer.from(raw).toString('utf8');
  const tocStart = html.indexOf('class="compendium-toc-full-text"');
  const credits = html.indexOf('>Credits</a>', tocStart);
  if (tocStart < 0 || credits < 0) throw new Error('SKT publisher TOC boundary missing');
  const toc = html.slice(tocStart, credits);
  let previous = -1;
  for (const [href, heading] of tocEntries) {
    const start = 'href="'+href+'">';
    const first = toc.indexOf(start);
    const end = toc.indexOf('</a>', first);
    if (first <= previous || end < 0 || toc.indexOf(start, first + start.length) >= 0 ||
        toc.slice(first + start.length, end).replace(/<[^>]+>/g, '') !== heading) {
      throw new Error('Missing or unexpected SKT TOC entry: '+heading);
    }
    previous = first;
  }
  return tocWitnesses();
}
const marketplace = 'https://marketplace.dndbeyond.com/category/storm-kings-thunder';

const blankChallengeChecks = {
  Nimir: ['27632-nimir', marketplace],
  Orlekto: ['27634-orlekto', marketplace],
  Shaldoor: ['27705-shaldoor', marketplace],
  Vaasha: ['27706-vaasha', null],
};

function keyed(rows, key) {
  const entries = new Map(rows.map(row => [row[key], row]));
  if (entries.size !== rows.length) throw new Error('Duplicate '+key+' in SKT evidence');
  return entries;
}

function primaryIdentity(row) {
  return {
    cardUrl: row.cardUrl,
    digitalName: row.digitalName,
    displayedSource: row.displayedSource,
    challengeRating: row.challengeRating === '' ? null : row.challengeRating,
    indexPage: row.indexPage,
  };
}

function publisherWitness(row) {
  if (row.digitalName === 'Hulking Crab') {
    return { kind: 'appendix-heading', url: tocWitnesses()[1].url, appendix: 'C', heading: 'Hulking Crab' };
  }
  const blankCheck = Object.hasOwn(blankChallengeChecks, row.digitalName)
    ? blankChallengeChecks[row.digitalName]
    : null;
  if (blankCheck) {
    const [slug, destination] = blankCheck;
    if (row.cardUrl !== 'https://www.dndbeyond.com/monsters/'+slug || row.challengeRating !== '') {
      throw new Error('Blank-CR card evidence no longer matches the index');
    }
    return {
      kind: 'public-card-access',
      checkedOn: '2026-11-23',
      requestedUrl: row.cardUrl,
      result: destination ? 'redirect-to-marketplace' : 'timeout',
      destination,
      fullBodyRead: false,
    };
  }
  return null;
}

export function reviewResidual(index, register, variants, tribalReview) {
  if (index.sourceId !== '132' || index.accepted || index.complete || index.approvedDenominator !== null ||
      variants.accepted || variants.automaticPatch || variants.approvedDenominator !== null ||
      tribalReview.accepted !== false) {
    throw new Error('Review requires unaccepted SKT metadata');
  }
  const rows = keyed(index.records, 'cardUrl');
  const observations = keyed(register.records, 'id');
  const sourceObservations = register.records.filter(row =>
    row.section === 'bestiary' && row.sourceIds.includes(index.sourceId));
  const matched = new Set();
  for (const row of rows.values()) {
    if (row.accepted || row.canonicalId !== null || row.fullRules !== 'unverified' ||
        row.automaticSourceReplacement) throw new Error('Index row was promoted');
    for (const candidate of row.observationCandidates) {
      const original = observations.get(candidate.observationId);
      if (!original || original.names.en !== candidate.observedName ||
          JSON.stringify(original.sourceIds) !== JSON.stringify(candidate.originalSourceIds)) {
        throw new Error('Index observation identity or attribution changed');
      }
      matched.add(candidate.observationId);
    }
  }

  const withoutName = sourceObservations.filter(row => !matched.has(row.id)).map(row => row.id);
  const reportedWithoutName = index.originalSourceBestiaryWithoutNameCandidate;
  if (withoutName.length !== reportedWithoutName.length ||
      new Set(reportedWithoutName).size !== withoutName.length ||
      withoutName.some(id => !reportedWithoutName.includes(id))) {
    throw new Error('SKT secondary residual does not conserve the original index');
  }
  const residualIds = new Set(withoutName);
  const selectedVariants = keyed(variants.records, 'observationId');
  const groups = keyed(variants.groups, 'cardUrl');
  const linksByObservation = new Map();
  for (const group of groups.values()) {
    const row = rows.get(group.cardUrl);
    if (!row || row.digitalName !== group.digitalName || row.observationCandidates.length ||
        group.automaticMerge || group.canonicalId !== null || group.identityDecision !== 'unresolved' ||
        group.observationIds.length === 0) throw new Error('Variant group is no longer an unresolved residual');
    for (const id of group.observationIds) {
      if (!residualIds.has(id) || linksByObservation.has(id)) throw new Error('Invalid residual variant member');
      const original = observations.get(id);
      const selected = selectedVariants.get(id);
      if (!selected || selected.observedName !== original.names.en || selected.url !== original.url ||
          JSON.stringify(selected.sourceIds) !== JSON.stringify(original.sourceIds) ||
          selected.fullRulesVerified || selected.automaticPatch) {
        throw new Error('Selected variant evidence lost its identity or verification boundary');
      }
      linksByObservation.set(id, group.cardUrl);
    }
  }

  if (selectedVariants.size !== linksByObservation.size) throw new Error('Orphan selected variant evidence');
  const displayedReferences = [];
  const publisherResidual = [];
  for (const row of rows.values()) {
    if (row.scopeKind === 'displayed-reference-source') {
      if (row.displayedSource === "Storm King's Thunder") throw new Error('Unexpected own-source label on reference');
      displayedReferences.push({ ...primaryIdentity(row), observationCandidates: row.observationCandidates,
        editionAttributionEstablishedByAdventureFilter: false });
      continue;
    }
    if (row.scopeKind !== 'displayed-own-source' || row.displayedSource !== "Storm King's Thunder") {
      throw new Error('Unexpected SKT source partition');
    }
    if (row.observationCandidates.length) continue;
    const group = groups.get(row.cardUrl);
    const witness = publisherWitness(row);
    let category = 'index-only';
    if (group) category = 'previously-documented-variant';
    else if (row.challengeRating === '') category = 'blank-cr';
    else if (/^(Cloud|Fire|Frost|Hill|Stone|Storm) Giant \(variant\)$/i.test(row.digitalName)) {
      category = 'explicit-variant-label';
    } else if (witness?.kind === 'appendix-heading') category = 'appendix-heading';
    publisherResidual.push({
      ...primaryIdentity(row),
      category,
      previousCandidateObservationIds: group?.observationIds ?? [],
      publisherWitness: witness,
      canonicalId: null,
      standaloneStatBlockVerified: false,
      acceptedAlias: false,
    });
  }
  const secondaryResidual = reportedWithoutName.map(id => {
    const original = observations.get(id);
    return {
      observationId: id,
      originalUrl: original.url,
      names: original.names,
      originalSourceIds: original.sourceIds,
      previousCandidateCardUrl: linksByObservation.get(id) ?? null,
      selectedVariantFields: selectedVariants.get(id)?.selectedObservedFields ?? null,
      canonicalId: null,
    };
  });
  const categoryCounts = {};
  for (const { category } of publisherResidual) {
    categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
  }
  const indexOwnRows = rows.size - displayedReferences.length;
  const missingChallenge = index.records.filter(row => row.challengeRating === '').length;
  if (rows.size !== index.summary.digitalRows ||
      indexOwnRows !== index.summary.displayedOwnSourceRows ||
      missingChallenge !== index.summary.blankChallengeRatingRows ||
      displayedReferences.length !== index.summary.displayedReferenceRows ||
      publisherResidual.length !== index.summary.rowsWithoutObservedName ||
      sourceObservations.length !== index.summary.originalSourceBestiaryObservations ||
      sourceObservations.length - secondaryResidual.length !== index.summary.originalSourceBestiaryWithNameCandidate) {
    throw new Error('Derived index partition disagrees with the input review');
  }
  const child = rows.get('https://www.dndbeyond.com/monsters/300476-cloud-giant-child');
  const young = rows.get('https://www.dndbeyond.com/monsters/298066-young-cloud-giant');
  const youngObservation = observations.get('dndsu:bestiary:7728');
  if (child?.digitalName !== 'Cloud Giant Child' || child.challengeRating !== '0' ||
      child.size !== 'Medium' || child.observationCandidates.length ||
      young?.digitalName !== 'Young Cloud Giant' || young.challengeRating !== '5' ||
      young.size !== 'Huge' || youngObservation?.names.en !== young.digitalName ||
      !young.observationCandidates.some(candidate => candidate.observationId === youngObservation.id)) {
    throw new Error('Cloud giant index identities changed and need manual review');
  }
  return {
    schemaVersion: 1,
    status: 'index-residual-review',
    sourceId: index.sourceId,
    accepted: false,
    complete: false,
    approvedDenominator: null,
    publisherIndexRows: rows.size,
    publisherRowsWithBlankChallengeRating: missingChallenge,
    publisherToc: {
      url: adventure,
      rawSha256: tocCaptureSha256,
      observedStatus: 200,
      entries: tocWitnesses(),
      wholeAppendicesVerified: false,
    },
    tribalSpellBoundary: {
      sourceObservation: 'dndsu:bestiary:5606',
      relation: 'spell-list-component-of-uthgardt-shaman',
      primaryClaimEntries: tribalReview.summary.primaryClaimEntries,
      candidateSpellEntries: tribalReview.summary.candidateSpellEntries,
      tribesWithCountConflict: tribalReview.summary.tribesWithCountConflict,
      newStandaloneCreatureUnits: 0,
      exactListVerified: false,
    },
    cloudGiantComparison: {
      child: { ...primaryIdentity(child), size: child.size },
      young: { ...primaryIdentity(young), size: young.size },
      youngObservation: { id: youngObservation.id, url: youngObservation.url },
      mergeSupported: false,
    },
    secondarySourceObservations: sourceObservations.length,
    categoryCounts,
    secondaryRowsWithPreviousVariantCandidate: linksByObservation.size,
    publisherResidual,
    secondaryResidual,
    displayedReferences,
  };
}

export function build() {
  const raw = inputs.map(path => readFileSync(new URL('../'+path, import.meta.url), 'utf8').replaceAll('\r\n','\n'));
  return {
    ...reviewResidual(...raw.map(value => JSON.parse(value))),
    inputSha256: Object.fromEntries(inputs.map((path, i) => [
      path, createHash('sha256').update(raw[i]).digest('hex'),
    ])),
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args[0] === '--verify-toc') {
    if (args.length !== 2) throw new Error('Expected --verify-toc <saved publisher HTML>');
    console.log(JSON.stringify(verifyPublisherToc(readFileSync(args[1])), null, 2));
  } else {
    const output = args[0] ?? new URL('../catalog/skt-index-residual-2014.json', import.meta.url);
    writeFileSync(output, JSON.stringify(build(), null, 2)+'\n');
  }
}
