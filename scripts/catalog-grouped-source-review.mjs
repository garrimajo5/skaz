import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const https = value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };
const kinds = new Set(['descriptive-heading', 'named-object-in-prose']);
const statuses = new Set(['needs-publisher-status-review', 'official-al-index-entry-needs-publication-review', 'wotc-copyright-2016-publication']);

// This is a research queue. Even a unique name and a WotC publication do not accept an identity.
export function reviewGroupedSource(manifest, scope) {
  if (!nonempty(manifest.sourceId) || manifest.complete !== false || !Array.isArray(manifest.publications)) throw Error('Invalid grouped source manifest');
  const ids = new Set();
  for (const row of scope.records) {
    if (!nonempty(row.id) || ids.has(row.id) || !Array.isArray(row.sourceIds)) throw Error('Invalid observation identity');
    ids.add(row.id);
  }
  const observations = scope.records.filter(row => row.sourceIds.includes(manifest.sourceId));
  const publicationIds = new Set();
  const units = [];
  for (const publication of manifest.publications) {
    if (!nonempty(publication.id) || publicationIds.has(publication.id) || !nonempty(publication.title) || !statuses.has(publication.publisherStatus) || !https(publication.evidenceUrl) || !nonempty(publication.evidenceLocator) || !Array.isArray(publication.units)) throw Error('Invalid publication evidence');
    publicationIds.add(publication.id);
    const unitKeys = new Set();
    for (const unit of publication.units) {
      const key = JSON.stringify([unit.section, unit.name]);
      if (!nonempty(unit.name) || !['bestiary', 'items', 'spells'].includes(unit.section) || !kinds.has(unit.kind) || !nonempty(unit.evidenceLocator) || unitKeys.has(key)) throw Error('Invalid publication unit');
      unitKeys.add(key);
      const matches = observations.filter(row => row.section === unit.section && row.names?.en === unit.name);
      units.push({ publicationId: publication.id, publicationTitle: publication.title, publisherStatus: publication.publisherStatus,
        name: unit.name, section: unit.section, kind: unit.kind, evidenceUrl: publication.evidenceUrl, evidenceLocator: unit.evidenceLocator,
        observationIds: matches.map(row => row.id) });
    }
  }
  const records = observations.map(row => {
    const candidates = units.filter(unit => unit.observationIds.includes(row.id));
    const duplicateObservationName = candidates.some(unit => unit.observationIds.length > 1);
    const status = !candidates.length ? 'needs-primary-unit-evidence'
      : candidates.length > 1 ? 'multiple-publications-need-version-review'
      : duplicateObservationName ? 'duplicate-observation-name-needs-identity-review'
      : 'primary-name-candidate-needs-identity-review';
    return { observationId: row.id, observedName: row.names?.en ?? null, originalSourceIds: [...row.sourceIds], status,
      duplicateObservationName, candidates, accepted: false, canonicalId: null, exactTextVersion: 'unverified', fullRules: 'unverified', reusePermission: 'not-established' };
  });
  const byStatus = {};
  for (const row of records) byStatus[row.status] = (byStatus[row.status] || 0) + 1;
  return { schemaVersion: 1, status: 'grouped-source-candidates-not-attribution-acceptance', sourceId: manifest.sourceId,
    approvedDenominator: null, complete: false,
    summary: { publicationsWithMetadata: publicationIds.size, observedPages: records.length, primaryNamedUnits: units.length, byStatus },
    unitsWithoutObservation: units.filter(unit => !unit.observationIds.length), records };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paths = ['catalog/adventurers-league-publication-candidates-2014.json', 'catalog/scope-register-2014.json'];
  const raw = paths.map(path => readFileSync(new URL('../' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
  const result = reviewGroupedSource(...raw.map(text => JSON.parse(text)));
  result.inputSha256 = Object.fromEntries(paths.map((path, index) => [path, createHash('sha256').update(raw[index]).digest('hex')]));
  writeFileSync(process.argv[2] || new URL('../catalog/adventurers-league-identity-review-2014.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result.summary));
}
