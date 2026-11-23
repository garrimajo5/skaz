import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const inputs = [
  'catalog/infernal-machine-index-review-2014.json',
  'catalog/fiendish-folio-version-evidence-2014.json',
  'catalog/imr-version-review-2014.json',
];
const title = 'Infernal Machine Rebuild';
const folioTitle = "Mordenkainen's Fiendish Folio Volume 1";
const product = 'https://marketplace.dndbeyond.com/adventures/SRC-00056';
const creatureAppendix = 'https://www.dndbeyond.com/sources/imr/npcs-and-monsters';
const contentsSha256 = '7b6a2a0025d2f3eeebe3d422626d43c8cedccf4df507925086d9c253741dc920';

export function verifyPublisherContents(raw) {
  if (createHash('sha256').update(raw).digest('hex') !== contentsSha256) {
    throw new Error('IMR publisher capture SHA-256 mismatch');
  }
  const html = Buffer.from(raw).toString('utf8');
  const start = html.indexOf('class="compendium-toc-full-text"');
  const end = html.indexOf('>Credits</a>', start);
  const heading = 'href="'+creatureAppendix+'">Appendix B: NPCs and Monsters</a>';
  if (start < 0 || end < 0 || html.slice(start, end).split(heading).length !== 2) {
    throw new Error('Exact IMR Appendix B link missing in the publisher contents');
  }
  return creatureAppendix;
}

function byCard(rows) {
  const result = new Map(rows.map(row => [row.cardUrl, row]));
  if (result.size !== rows.length) throw new Error('Repeated primary card URL');
  return result;
}

export function reviewBoundary(imr, folio, versionReview) {
  for (const report of [imr, folio, versionReview]) {
    if (report.accepted !== false || report.complete !== false || report.approvedDenominator !== null) {
      throw new Error('Input must remain bounded index evidence');
    }
  }
  if (imr.sourceId !== '161' || folio.sourceId !== '206' || versionReview.automaticPatch) {
    throw new Error('Mismatched publication or version review');
  }
  const imrByCard = byCard(imr.records);
  const folioByCard = byCard(folio.digitalIndexEvidence.rows);
  const reviewedVersions = byCard(versionReview.rows);
  const own = [];
  const references = [];
  const crossPublication = [];
  for (const row of imrByCard.values()) {
    if (row.accepted !== false || row.canonicalId !== null || row.fullRules !== 'unverified' ||
        row.automaticSourceReplacement) throw new Error('IMR index row was promoted');
    const observed = {
      cardUrl: row.cardUrl,
      digitalName: row.digitalName,
      displayedSource: row.displayedSource,
      challengeRating: row.challengeRating,
      observationCandidates: row.observationCandidates,
    };
    if (row.scopeKind === 'displayed-own-source' && row.displayedSource === title) {
      const originalObservations = row.observationCandidates.filter(candidate =>
        candidate.originalSourceIds.includes(imr.sourceId));
      own.push({ ...observed, hasObservationWithImrSource: originalObservations.length > 0 });
    } else if (row.scopeKind === 'displayed-reference-source' && row.displayedSource !== title) {
      const review = reviewedVersions.get(row.cardUrl);
      if (review && (review.digitalName !== row.digitalName || review.displayedSource !== row.displayedSource ||
          review.canonicalId !== null || review.automaticMerge || review.primaryFullRulesRead)) {
        throw new Error('Version evidence changed after the index review');
      }
      references.push({ ...observed, sourceVersionCandidates: review?.candidates ?? [] });
      reviewedVersions.delete(row.cardUrl);
    } else {
      throw new Error('IMR source partition changed');
    }
    const other = folioByCard.get(row.cardUrl);
    if (other) {
      for (const field of ['digitalName', 'displayedSource', 'challengeRating', 'type', 'size', 'alignment']) {
        if (row[field] !== other[field]) throw new Error('Same card URL has different saved metadata: '+field);
      }
      if (other.canonicalId !== null || other.fullRulesVerified || other.automaticSourceReplacement) {
        throw new Error('Folio index row was promoted');
      }
      crossPublication.push({
        ...observed,
        seenInPublications: [imr.sourceId, folio.sourceId],
        folioPrintUnit: other.printedUnitId,
        folioObservationCandidates: other.observationCandidates,
        sharedDigitalCard: true,
        printedEquivalent: null,
        canonicalId: null,
      });
    }
  }

  const historical = folio.countEvidence;
  const needle = folio.needleEvidence;
  if (needle.identityConfirmed !== false || needle.canonicalId !== null ||
      needle.automaticRename !== false || needle.fullStatBlockRead !== false) {
    throw new Error('Needlefolk relation changed and needs manual review');
  }
  if (reviewedVersions.size || own.length !== imr.summary.displayedOwnSourceRows ||
      references.length !== imr.summary.displayedReferenceRows ||
      historical.printDigitalDifferenceResolved || historical.automaticDeletion ||
      imrByCard.size !== imr.summary.digitalRows ||
      [...folioByCard.values()].some(row => ![title, folioTitle].includes(row.displayedSource)) ||
      folioByCard.size !== historical.currentPublicIndexCount) {
    throw new Error('The publication or version partitions do not conserve their input');
  }
  return {
    schemaVersion: 1,
    accepted: false,
    complete: false,
    approvedDenominator: null,
    imrSourceId: imr.sourceId,
    folioSourceId: folio.sourceId,
    publisherProduct: {
      url: product,
      advertisedEncounterBuilderCreatures: 26,
      scope: 'Encounter Builder availability',
      appendix: {
        contentsUrl: 'https://www.dndbeyond.com/sources/dnd/imr',
        contentsRawSha256: contentsSha256,
        requestedUrl: creatureAppendix,
        observedRedirect: product,
        checkedOn: '2026-11-23',
        fullBodyRead: false,
      },
    },
    counts: {
      indexRows: imrByCard.size,
      displayedOwnSourceRows: own.length,
      ownRowsWithoutNameCandidates: own.filter(row => !row.observationCandidates.length).length,
      ownRowsWithOriginalImrObservations: own.filter(row => row.hasObservationWithImrSource).length,
      displayedReferenceRows: references.length,
      referenceRowsWithoutNameCandidates: references.filter(row => !row.observationCandidates.length).length,
      folioPrintContentsRows: folio.printEvidence.contentsRows,
      folioHistoricalDigitalDescription: historical.staffConfirmedDigitalCount,
      folioCurrentFilterRows: folioByCard.size,
      folioCurrentDisplayedOwnSourceRows: [...folioByCard.values()].filter(row => row.displayedSource === folioTitle).length,
      sharedDigitalCards: crossPublication.length,
    },
    unresolvedFolioIdentity: {
      printedName: needle.printedName,
      digitalName: needle.digitalName,
      printedChallengeRating: needle.printedChallengeRating,
      digitalChallengeRating: needle.digitalChallengeRating,
      cardUrl: needle.cardUrl,
      observationId: needle.observationId,
      identityConfirmed: false,
    },
    ownPublisherRows: own,
    displayedReferences: references,
    sharedDigitalCards: crossPublication,
  };
}

export function build() {
  const raw = inputs.map(path => readFileSync(new URL('../'+path, import.meta.url), 'utf8').replaceAll('\r\n','\n'));
  return {
    ...reviewBoundary(...raw.map(value => JSON.parse(value))),
    inputSha256: Object.fromEntries(inputs.map((path, i) => [
      path, createHash('sha256').update(raw[i]).digest('hex'),
    ])),
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args[0] === '--verify-toc') {
    if (args.length !== 2) throw new Error('Expected --verify-toc <saved publisher HTML>');
    console.log(verifyPublisherContents(readFileSync(args[1])));
  } else {
    const output = args[0] ?? new URL('../catalog/imr-folio-index-boundary-2014.json', import.meta.url);
    writeFileSync(output, JSON.stringify(build(), null, 2)+'\n');
  }
}
