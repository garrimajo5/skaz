import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const kinds = new Map([
  ['equipment-pack', 'equipment-pack'], ['mount-purchase-option', 'mount-offer'],
  ['barding-price-rule', 'pricing-rule'], ['tack', 'item'], ['land-vehicle', 'vehicle'],
  ['water-vehicle', 'vehicle'], ['consumable', 'supply-offer'], ['service', 'service'],
  ['barter-price-row', 'barter-row'], ['lifestyle-expense', 'lifestyle'],
  ['food-or-drink', 'food-offer'], ['lodging-service', 'service'],
]);
const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const unique = (rows, key, label) => {
  const map = new Map();
  for (const row of rows) {
    if (!row[key] || map.has(row[key])) throw new Error('Duplicate or missing ' + label);
    map.set(row[key], row);
  }
  return map;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function buildEquipmentUnitProposals(discovery, packs, components, identityReport) {
  if ([discovery, packs, components].some(input => input.ruleset !== '5e-2014')) throw new Error('Unexpected ruleset');
  const observed = unique(discovery.records, 'observationId', 'observation');
  const packMap = unique(packs.records, 'observationId', 'pack');
  const componentMap = unique(components.records, 'proposedComponentId', 'component');
  const knownItems = unique(identityReport.records, 'proposedCanonicalId', 'catalog candidate');
  const proposals = [], allUnitIds = new Set();
  function registerId(id) {
    if (allUnitIds.has(id) || knownItems.has(id)) throw new Error('Duplicate or overlapping proposed unit');
    allUnitIds.add(id);
    return id;
  }
  for (const row of observed.values()) {
    const kind = kinds.get(row.recordType);
    if (!kind || row.fullRules !== 'unverified' || row.canonicalCatalogId !== null) throw new Error('Unsupported observation scope');
    const suffix = row.observationId.match(/^srd51:2014:equipment-observation:([a-z0-9-]+)$/)?.[1];
    if (!suffix || !Number.isInteger(row.sourcePage)) throw new Error('Missing observation provenance');
    const pack = packMap.get(row.observationId);
    if (kind === 'equipment-pack' && (!pack || pack.nameEn !== row.nameEn || pack.listedCostGp !== row.pricing.amount || row.pricing.currency !== 'gp')) throw new Error('Pack identity or price mismatch');
    const proposedUnitId = registerId(kind === 'equipment-pack' ? pack.proposedCanonicalId : `srd51:2014:${kind}:${suffix}`);
    const output = {
      observationId: row.observationId, nameEn: row.nameEn, sourcePage: row.sourcePage,
      sourceSection: row.section, unitKind: kind, proposedUnitId,
      status: 'proposed-unit-not-runtime-record', fullRules: 'unverified',
      pricing: structuredClone(row.pricing),
      pricedUnit: row.pricedUnit ?? row.pricingPeriod ?? null,
      bestiaryId: null,
    };
    if (row.pricingEvidence) output.pricingEvidence = structuredClone(row.pricingEvidence);
    if (kind === 'mount-offer') output.bestiaryLink = 'purchase-offer-is-not-a-statblock';
    if (kind === 'pricing-rule') {
      if (row.pricing.mode !== 'multiplier') throw new Error('Barding requires a multiplier');
      output.fixedPurchasePrice = null;
    }
    if (row.includedInLifestyleExpenses !== undefined) output.includedInLifestyleExpenses = row.includedInLifestyleExpenses;
    if (kind === 'barter-row') {
      if (row.alternativesAre !== 'one-of-not-a-bundle' || !row.alternatives?.length) throw new Error('Invalid trade alternatives');
      output.alternativesAre = row.alternativesAre;
      output.alternatives = row.alternatives.map(option => {
        if (!option.nameEn || !['lb','square-yard','animal'].includes(option.unit) || !Number.isInteger(option.quantity) || option.quantity < 1) throw new Error('Invalid trade unit');
        return { ...option, proposedUnitId: registerId(`srd51:2014:trade-offer:${slug(option.nameEn)}-${option.unit}`), bestiaryId: null };
      });
    }
    proposals.push(output);
  }
  if ([...packMap.keys()].some(id => observed.get(id)?.recordType !== 'equipment-pack')) throw new Error('Unknown pack observation');

  const unresolved = new Map();
  const memberships = [];
  for (const pack of packMap.values()) {
    const memberNames = new Set();
    for (const member of pack.contents) {
      if (!member.sourceName || memberNames.has(member.sourceName)) throw new Error('Duplicate or missing pack member');
      memberNames.add(member.sourceName);
      const key = pack.observationId + '/' + member.sourceName;
      const record = { packObservationId: pack.observationId, sourceName: member.sourceName,
        quantity: member.quantity, unit: member.unit, catalogCandidateId: member.candidateCatalogId,
        componentCandidateId: null, quantityStatus: member.quantity === null ? 'unspecified' : 'source-specified' };
      if (member.candidateCatalogId) {
        if (!knownItems.has(member.candidateCatalogId)) throw new Error('Unknown catalog candidate');
      } else unresolved.set(key, record);
      memberships.push(record);
    }
  }
  for (const component of componentMap.values()) {
    if (!component.proposedComponentId.startsWith('srd51:2014:pack-component:') || component.fullRules !== 'unverified' || component.sourcePage !== 70 || component.catalogItemEquivalence !== 'not-established' || component.retailPrice !== null || component.weight !== null || !component.occurrences?.length) throw new Error('Unsupported component evidence');
    registerId(component.proposedComponentId);
    for (const occurrence of component.occurrences) {
      const key = occurrence.packObservationId + '/' + occurrence.sourceName;
      const member = unresolved.get(key);
      if (!member || member.componentCandidateId || occurrence.sourceName !== component.sourceName || !same([occurrence.quantity,occurrence.unit], [member.quantity,member.unit])) throw new Error('Component occurrence mismatch or duplicate');
      member.componentCandidateId = component.proposedComponentId;
    }
  }
  if ([...unresolved.values()].some(row => !row.componentCandidateId)) throw new Error('Missing component identity evidence');
  return {
    schemaVersion: 1, ruleset: '5e-2014', status: 'unit-proposals-not-approved-catalog',
    source: structuredClone(discovery.source), approvedDenominator: null, complete: false,
    summary: {
      observations: proposals.length,
      byUnitKind: Object.fromEntries([...new Set(proposals.map(row => row.unitKind))].sort().map(kind => [kind, proposals.filter(row => row.unitKind === kind).length])),
      tradeAlternatives: proposals.flatMap(row => row.alternatives || []).length,
      packMemberships: memberships.length, catalogCandidateLinks: memberships.filter(row => row.catalogCandidateId).length,
      componentCandidateLinks: unresolved.size, componentIdentities: componentMap.size,
      unspecifiedMemberQuantities: memberships.filter(row => row.quantity === null).length,
    },
    limitations: [
      'Unit-kind counts are not additive into a count of catalog items; trade rows and alternatives overlap.',
      'Source component identity does not resolve catalog equivalence or unknown quantity, volume, weight and price.',
      'Mount and animal trade offers are not bestiary statblocks.',
      'No runtime import, inventory grant, purchase, currency deduction or automatic expense.',
    ],
    records: proposals, packMemberships: memberships,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paths = ['catalog/srd51-additional-equipment-discovery.json', 'catalog/srd51-equipment-pack-memberships.json', 'catalog/srd51-pack-component-identities.json', 'catalog/equipment-identity-reconciliation.json'];
  const raw = paths.map(path => readFileSync(new URL('../' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
  const result = buildEquipmentUnitProposals(...raw.map(text => JSON.parse(text)));
  result.inputSha256 = Object.fromEntries(paths.map((path, i) => [path, createHash('sha256').update(raw[i]).digest('hex')]));
  writeFileSync(process.argv[2] || new URL('../catalog/equipment-unit-proposals-2014.json', import.meta.url), JSON.stringify(result,null,2) + '\n');
  console.log(JSON.stringify(result.summary));
}