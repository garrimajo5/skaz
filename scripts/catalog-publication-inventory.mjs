import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// This audit proposes review work. A title match never certifies rules or a canonical identity.
export function auditPublicationInventory(inventory, scope, bibliography) {
  const source = bibliography.records.filter(row => row.sourceId === inventory.sourceId);
  if (source.length !== 1 || source[0].publicationKind !== 'official-wotc-2014-publication') throw Error('Expected one reviewed official publication');
  if (!inventory.evidenceUrl?.startsWith('https://') || !inventory.evidenceLocator || !inventory.section) throw Error('Missing publication inventory evidence');
  const observations = new Map();
  for (const row of scope.records) {
    if (!row.id || observations.has(row.id) || !Array.isArray(row.sourceIds)) throw Error('Invalid or duplicate observation');
    observations.set(row.id, row);
  }
  const seen = new Set();
  const records = inventory.units.map(unit => {
    if (!unit.id || seen.has(unit.id) || !unit.name?.trim() || !Number.isInteger(unit.printedPage) || unit.printedPage < 1) throw Error('Invalid or duplicate publication unit');
    seen.add(unit.id);
    const exact = [...observations.values()].filter(row => row.section === inventory.section && row.names?.en === unit.name);
    const sameSource = exact.filter(row => row.sourceIds.includes(inventory.sourceId));
    const candidates = unit.reviewCandidates ?? [];
    const candidateIds = new Set();
    for (const candidate of candidates) {
      const observation = observations.get(candidate.observationId);
      if (!observation || observation.section !== inventory.section || !candidate.reason?.trim() || candidateIds.has(candidate.observationId)) throw Error('Invalid review candidate');
      candidateIds.add(candidate.observationId);
    }
    // Keep all matches: the audit must not choose a version based on array order.
    const status = sameSource.length > 1 ? 'ambiguous-same-name-and-source'
      : sameSource.length === 1 ? 'same-name-and-source-needs-version-review'
      : exact.length ? 'same-name-other-source-needs-attribution-review'
      : candidates.length ? 'explicit-candidate-needs-identity-review'
      : 'not-found-in-observed-index';
    return {
      unitId: unit.id, publicationName: unit.name, printedPage: unit.printedPage, status,
      exactNameCandidates: exact.map(row => ({ observationId: row.id, sourceIds: [...row.sourceIds], sameSource: row.sourceIds.includes(inventory.sourceId) })),
      explicitReviewCandidates: candidates.map(candidate => ({ ...candidate, observedName: observations.get(candidate.observationId).names?.en ?? null })),
      canonicalId: null, accepted: false, exactTextVersion: 'unverified', fullRules: 'unverified', reusePermission: 'not-established',
    };
  });
  const byStatus = {};
  for (const row of records) byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  const sourceObservations = [...observations.values()].filter(row => row.section === inventory.section && row.sourceIds.includes(inventory.sourceId));
  const referenced = new Set(records.flatMap(row => [...row.exactNameCandidates.map(c => c.observationId), ...row.explicitReviewCandidates.map(c => c.observationId)]));
  return {
    schemaVersion: 1, status: 'publication-identity-review-not-catalog-acceptance', sourceId: inventory.sourceId,
    evidenceUrl: inventory.evidenceUrl, evidenceLocator: inventory.evidenceLocator,
    approvedDenominator: null, complete: false,
    summary: { publicationUnits: records.length, observedPagesWithSource: sourceObservations.length, byStatus },
    observationsWithoutInventoryCandidate: sourceObservations.filter(row => !referenced.has(row.id)).map(row => row.id), records,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paths = ['catalog/fiendish-folio-inventory-2014.json', 'catalog/scope-register-2014.json', 'catalog/numeric-source-publisher-evidence.json'];
  const raw = paths.map(path => readFileSync(new URL('../' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
  const result = auditPublicationInventory(...raw.map(text => JSON.parse(text)));
  result.inputSha256 = Object.fromEntries(paths.map((path, i) => [path, createHash('sha256').update(raw[i]).digest('hex')]));
  writeFileSync(process.argv[2] || new URL('../catalog/fiendish-folio-review-2014.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result.summary));
}
