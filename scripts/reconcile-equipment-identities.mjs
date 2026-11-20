import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { bundledCatalog } from '../server/bundled-catalog.mjs';

export const proposalPaths = ['armor', 'weapon', 'tools', 'gear', 'gaming-sets'].map(group => 'catalog/' + group + '-canonical-proposal-2014.json');

export function reconcileEquipmentIdentities(discovery, proposals, runtimeEntries) {
  const observations = new Map();
  for (const article of discovery.articles) for (const row of article.records) {
    if (!row.observationId || observations.has(row.observationId)) throw new Error('Duplicate or missing observation ID');
    observations.set(row.observationId, row);
  }
  const runtime = new Set(runtimeEntries.map(row => row.id));
  const matched = new Map(), canonicalIds = new Set(), unresolved = new Set();
  const countsBySource = {};
  for (const proposal of proposals) {
    if (proposal.ruleset !== '5e-2014' || proposal.status !== 'canonical-identity-proposal') throw new Error('Unexpected proposal scope');
    if (!proposal.source?.url?.startsWith('https://') || !proposal.source.title) throw new Error('Missing primary source');
    countsBySource[proposal.source.title] ??= 0;
    for (const row of proposal.records) {
      const observed = observations.get(row.observationId);
      if (!observed) throw new Error('Unknown observation');
      if (matched.has(row.observationId) || canonicalIds.has(row.proposedCanonicalId)) throw new Error('Duplicate canonical match');
      if (!row.proposedCanonicalId || row.observedName !== observed.name || row.observedPrice !== observed.priceText) throw new Error('Observation changed or missing canonical ID');
      if (row.fullRules !== 'unverified' || row.status !== 'proposed-identity-not-runtime-record') throw new Error('Identity proposal cannot certify full rules');
      const reusesRuntime = runtime.has(row.proposedCanonicalId);
      if (reusesRuntime !== (row.identityDisposition === 'reuse-existing-runtime-id')) throw new Error('Undeclared or stale runtime reuse');
      matched.set(row.observationId, { observationId: row.observationId, proposedCanonicalId: row.proposedCanonicalId, primarySource: proposal.source.title, reusesRuntime });
      canonicalIds.add(row.proposedCanonicalId);
      countsBySource[proposal.source.title]++;
    }
    for (const row of proposal.unmatched ?? []) {
      if (!observations.has(row.observationId)) throw new Error('Unknown unmatched observation');
      unresolved.add(row.observationId);
    }
  }
  const missing = [...observations.keys()].filter(id => !matched.has(id));
  for (const id of missing) if (!unresolved.has(id)) throw new Error('Observation silently lost');
  const resolvedElsewhere = [...unresolved].filter(id => matched.has(id));
  return {
    schemaVersion: 1, status: 'identity-reconciliation-not-full-catalog',
    approvedDenominator: null, complete: false,
    summary: { observedRows: observations.size, matchedIdentities: matched.size,
      unresolvedIdentities: missing.length, resolvedOutsideInitialSource: resolvedElsewhere.length,
      existingRuntimeIdsReused: [...matched.values()].filter(row => row.reusesRuntime).length, countsBySource },
    records: [...matched.values()].sort((a, b) => a.observationId.localeCompare(b.observationId, 'en')),
    unresolvedObservationIds: missing.sort(), resolvedOutsideInitialSource: resolvedElsewhere.sort(),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paths = ['catalog/dndsu-equipment-discovery.json', ...proposalPaths];
  const raw = paths.map(path => readFileSync(new URL('../' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
  const [discovery, ...proposals] = raw.map(text => JSON.parse(text));
  const result = reconcileEquipmentIdentities(discovery, proposals, bundledCatalog().bundle.entries);
  result.inputSha256 = Object.fromEntries(paths.map((path, index) => [path, createHash('sha256').update(raw[index]).digest('hex')]));
  writeFileSync(process.argv[2] || new URL('../catalog/equipment-identity-reconciliation.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result.summary));
}
