import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {catalogInputHash} from './verify-catalog-input-hashes.mjs';

export const inputs = [
  'catalog/scope-register-2014.json',
  'catalog/source-rights-audit-2014.json',
  'catalog/skt-index-residual-2014.json',
];
const output = new URL('../catalog/d07-adventure-wording-rights-2014.json', import.meta.url);
const adventureIds = ['132', '161', '206'];
const referenceSourceId = '103';
const editionLocators = {
  '103': 'https://www.dndbeyond.com/sources/dnd/mm-2014',
  '132': 'https://www.dndbeyond.com/sources/dnd/skt',
  '161': 'https://www.dndbeyond.com/sources/dnd/imr',
  '206': 'https://marketplace.dndbeyond.com/category/SRC-00057',
};

export function reviewAdventureWording(scope, audit, skt) {
  if (audit.accepted !== false || audit.complete !== false || audit.approvedDenominator !== null ||
      skt.accepted !== false || skt.complete !== false || skt.approvedDenominator !== null) {
    throw new Error('Rights review requires evidence with open acceptance');
  }

  const publications = [...adventureIds, referenceSourceId].map(sourceId => {
    const matches = audit.publications.filter(row => row.id === 'numeric:' + sourceId);
    if (matches.length !== 1) throw new Error('Missing or duplicate source: ' + sourceId);
    const [publication] = matches;
    if (publication.textReuseEvidence !== 'not-established-by-this-audit' ||
        publication.translationReuseEvidence !== 'not-established-by-this-audit' ||
        publication.upstreamReuseDeclaration !== 'not-established') {
      throw new Error('Changed rights evidence needs human review: ' + sourceId);
    }
    return {
      sourceId,
      title: publication.title,
      scopeDisposition: publication.scopeDisposition,
      editionLocator: editionLocators[sourceId],
      wordingEvidence: publication.textReuseEvidence,
      translationEvidence: publication.translationReuseEvidence,
      requiredEvidence: ['exact-edition-and-passage', 'permission-for-intended-wording', 'russian-wording-origin-and-permission'],
    };
  });

  const observations = new Map(scope.records.map(row => [row.id, row]));
  if (observations.size !== scope.records.length) throw new Error('Duplicate observation ID');
  const referenceLinks = new Map();
  for (const reference of skt.displayedReferences) {
    if (reference.displayedSource !== 'Monster Manual (2014)' || reference.observationCandidates.length === 0) {
      throw new Error('Changed attribution of an SKT reference');
    }
    for (const link of reference.observationCandidates) {
      const observation = observations.get(link.observationId);
      if (observation?.section !== 'bestiary' || observation.sourceIds.join() !== referenceSourceId ||
          link.originalSourceIds.join() !== referenceSourceId ||
          observation.names.en !== link.observedName) {
        throw new Error('SKT reference lost its original observation: ' + link.observationId);
      }
      const cardUrls = referenceLinks.get(observation.id) ?? new Set();
      if (cardUrls.has(reference.cardUrl)) throw new Error('Duplicate reference relation');
      cardUrls.add(reference.cardUrl);
      referenceLinks.set(observation.id, cardUrls);
    }
  }

  const records = [];
  for (const observation of observations.values()) {
    const belongsToAdventure = observation.section === 'bestiary' &&
      observation.sourceIds.some(id => adventureIds.includes(id));
    const references = referenceLinks.get(observation.id);
    if (!belongsToAdventure && !references) continue;
    if (observation.reusePermission !== 'not-established-for-reference-text' ||
        !Array.isArray(observation.candidateIds) || observation.candidateIds.length) {
      throw new Error('Review changed wording evidence or catalog candidates: ' + observation.id);
    }
    records.push({
      observationId: observation.id,
      url: observation.url,
      name: observation.names.en,
      originalSourceIds: [...observation.sourceIds],
      scopeDisposition: observation.inclusion,
      referredToBySktCards: [...(references ?? [])],
      textReuse: observation.reusePermission,
      candidateIds: [...observation.candidateIds],
      requiredEvidence: belongsToAdventure
        ? 'exact-edition-wording-and-russian-text-permission'
        : 'own-monster-manual-version-and-wording-permission',
    });
  }

  return {
    schemaVersion: 1,
    status: 'wording-evidence-review',
    accepted: false,
    complete: false,
    approvedDenominator: null,
    summary: {
      uniqueObservations: records.length,
      originalAdventureObservations: records.filter(row => !row.referredToBySktCards.length).length,
      uniqueMonsterManualReferences: referenceLinks.size,
      originalObservationsBySource: Object.fromEntries(publications.map(({sourceId}) => [
        sourceId, records.filter(record => record.originalSourceIds.includes(sourceId)).length,
      ])),
      observationsWithCatalogCandidates: 0,
      independentTextClearances: 0,
    },
    publications,
    records,
  };
}

export function buildAdventureWordingReview() {
  const raw = inputs.map(path => readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
  return {
    ...reviewAdventureWording(...raw.map(text => JSON.parse(text))),
    inputSha256: Object.fromEntries(inputs.map((path, index) => [path, catalogInputHash(raw[index])])),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = buildAdventureWordingReview();
  const json = JSON.stringify(report, null, 2) + '\n';
  if (process.argv[2] === '--write') writeFileSync(output, json);
  else if (readFileSync(output, 'utf8').replaceAll('\r\n', '\n') !== json) {
    throw new Error('Saved wording evidence changed. Review inputs before --write.');
  }
  console.log(JSON.stringify(report.summary));
}
