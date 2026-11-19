import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const dispositions = new Map([
  ['third-party-sourcebook', 'excluded-third-party'],
  ['author-described-homebrew', 'excluded-homebrew'],
  ['organized-play-source-group', 'needs-publication-identification'],
  ['official-wotc-2014-publication', 'eligible-publication-records-need-review'],
]);

export function applyNumericSourcePolicy(sourceRegister, scope, bibliography) {
  const sources = new Map();
  for (const source of sourceRegister.sources) {
    if (!source.sourceId || sources.has(source.sourceId)) throw new Error('Duplicate or missing source ID');
    sources.set(source.sourceId, source);
  }
  const evidence = new Map();
  for (const row of bibliography.records) {
    const source = sources.get(row.sourceId);
    if (!source || evidence.has(row.sourceId)) throw new Error('Unknown or duplicate source evidence');
    if (source.title !== row.observedTitle) throw new Error('Source title differs from reviewed evidence');
    if (!dispositions.has(row.publicationKind) || !row.evidenceUrl?.startsWith('https://')) throw new Error('Unsupported or missing primary evidence');
    if (row.publicationKind === 'official-wotc-2014-publication' && (row.publisher !== 'Wizards of the Coast' || row.ruleset !== '5e-2014' || !row.editionEvidenceUrl?.startsWith('https://'))) throw new Error('Missing official 2014 publication evidence');
    evidence.set(row.sourceId, row);
  }
  const seen = new Set();
  const affected = [];
  for (const row of scope.records) {
    if (!row.id || seen.has(row.id)) throw new Error('Duplicate or missing observation ID');
    seen.add(row.id);
    if (!Array.isArray(row.sourceIds) || new Set(row.sourceIds).size !== row.sourceIds.length) throw new Error('Invalid observation sources');
    const excluded = row.sourceIds.filter(id => evidence.has(id) && dispositions.get(evidence.get(id).publicationKind).startsWith('excluded-'));
    if (!excluded.length) continue;
    const allExcluded = excluded.length === row.sourceIds.length;
    affected.push({
      id: row.id, sourceIds: [...row.sourceIds], originalInclusion: row.inclusion,
      disposition: allExcluded ? 'excluded-by-owner-source-policy' : 'needs-mixed-source-review',
      excludedSourceIds: excluded,
      included: false, fullRules: 'unverified', reusePermission: 'not-established',
    });
  }
  const records = [...sources.values()].map(source => ({
    sourceId: source.sourceId, observedTitle: source.title, originalScope: source.scope,
    disposition: evidence.has(source.sourceId) ? dispositions.get(evidence.get(source.sourceId).publicationKind) : 'not-reviewed-by-this-audit',
    evidenceUrl: evidence.get(source.sourceId)?.evidenceUrl ?? null,
    editionEvidenceUrl: evidence.get(source.sourceId)?.editionEvidenceUrl ?? null,
    exactTextVersion: 'unverified', reusePermission: 'not-established',
  }));
  return {
    schemaVersion: 1, policy: 'owner-official-wotc-2014-only', decisionDate: '2026-11-19',
    coverage: 'reviewed-numeric-sources-only-not-full-catalog',
    approvedDenominator: null, complete: false,
    summary: { observedSources: records.length, reviewedSources: evidence.size, observedPages: seen.size,
      affectedPages: affected.length, excludedPages: affected.filter(row => row.disposition === 'excluded-by-owner-source-policy').length,
      mixedSourcePages: affected.filter(row => row.disposition === 'needs-mixed-source-review').length },
    records, affectedPages: affected,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paths = ['catalog/dndsu-source-register.json', 'catalog/scope-register-2014.json', 'catalog/numeric-source-publisher-evidence.json'];
  const raw = paths.map(path => readFileSync(new URL('../' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
  const result = applyNumericSourcePolicy(...raw.map(text => JSON.parse(text)));
  result.inputSha256 = Object.fromEntries(paths.map((path, index) => [path, createHash('sha256').update(raw[index]).digest('hex')]));
  writeFileSync(process.argv[2] || new URL('../catalog/numeric-source-scope-policy-2014.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result.summary));
}
