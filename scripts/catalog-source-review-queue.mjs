import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const sourceDispositions = new Set(['eligible-publication-records-need-review','excluded-third-party','excluded-homebrew','not-reviewed-by-this-audit','needs-publication-identification']);
const groups = [
  'excluded-by-reference-scope', 'excluded-by-reviewed-source-policy',
  'mixed-excluded-and-other-sources', 'needs-source-identification',
  'needs-publication-review', 'needs-publication-identification', 'needs-reference-scope-review',
  'ready-for-version-and-rights-review',
];

export function buildSourceReviewQueue(scope, sourcePolicy) {
  const sources = new Map();
  for (const source of sourcePolicy.records) {
    if (!source.sourceId || sources.has(source.sourceId) || !sourceDispositions.has(source.disposition)) throw new Error('Invalid source policy row');
    sources.set(source.sourceId, source);
  }
  const seen = new Set(), sourceCounts = new Map();
  const pageGroups = Object.fromEntries(groups.map(group => [group, []]));

  for (const page of scope.records) {
    if (!page.id || seen.has(page.id)) throw new Error('Duplicate or missing page');
    if (!Array.isArray(page.sourceIds) || page.sourceIds.some(id => typeof id !== 'string' || !id) || new Set(page.sourceIds).size !== page.sourceIds.length) throw new Error('Invalid page sources');
    if (!['excluded-homebrew','needs-source-review','candidate-2014'].includes(page.inclusion)) throw new Error('Unknown reference scope');
    seen.add(page.id);
    for (const id of page.sourceIds) sourceCounts.set(id, (sourceCounts.get(id) || 0) + 1);
    const excluded = page.sourceIds.filter(id => sources.get(id)?.disposition.startsWith('excluded-'));
    const unidentified = page.sourceIds.filter(id => !sources.has(id));
    const groupsToIdentify = page.sourceIds.filter(id => sources.get(id)?.disposition === 'needs-publication-identification');
    const unreviewed = page.sourceIds.filter(id => sources.get(id)?.disposition === 'not-reviewed-by-this-audit');
    let group;
    if (page.inclusion === 'excluded-homebrew') group = 'excluded-by-reference-scope';
    else if (excluded.length && excluded.length === page.sourceIds.length) group = 'excluded-by-reviewed-source-policy';
    else if (excluded.length) group = 'mixed-excluded-and-other-sources';
    else if (!page.sourceIds.length || unidentified.length) group = 'needs-source-identification';
    else if (groupsToIdentify.length) group = 'needs-publication-identification';
    else if (unreviewed.length) group = 'needs-publication-review';
    else if (page.inclusion === 'needs-source-review') group = 'needs-reference-scope-review';
    else group = 'ready-for-version-and-rights-review';
    pageGroups[group].push(page.id);

  }
  const sourceReviewPriority = [...sourceCounts].filter(([id]) => !sources.has(id) || ['not-reviewed-by-this-audit','needs-publication-identification'].includes(sources.get(id).disposition)).map(([sourceId, pageReferences]) => ({
    sourceId, observedTitle: sources.get(sourceId)?.observedTitle ?? null,
    status: !sources.has(sourceId) ? 'not-in-numeric-source-audit' : sources.get(sourceId).disposition === 'needs-publication-identification' ? 'identify-publications-within-source-group' : 'publication-not-reviewed', pageReferences,
  })).sort((a,b) => b.pageReferences - a.pageReferences || a.sourceId.localeCompare(b.sourceId,'en'));
  return {
    schemaVersion: 1, status: 'source-review-routing-not-catalog-acceptance',
    approvedDenominator: null, complete: false,
    summary: { observedPages: seen.size, groupedPages: Object.values(pageGroups).reduce((n,ids)=>n+ids.length,0),
      byDisposition: Object.fromEntries(groups.map(group=>[group,pageGroups[group].length])),
      pendingPublicationSourceIds: sourceReviewPriority.length },
    limitations: [
      'Every page is routed exactly once; a page is not necessarily one catalog entity.',
      'Ready for version and rights review is not included or accepted; rules, translation rights and duplicates remain unverified.',
      'Numeric source evidence does not replace class-specific, race-specific or exact text-version review.',
      'Source reference counts overlap and are not a count of missing catalog records.',
      'Original reference exclusions are retained; no runtime data is changed.',
    ],
    pageGroups, sourceReviewPriority,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paths=['catalog/scope-register-2014.json','catalog/numeric-source-scope-policy-2014.json'];
  const raw=paths.map(path=>readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n'));
  const result=buildSourceReviewQueue(...raw.map(text=>JSON.parse(text)));
  result.inputSha256=Object.fromEntries(paths.map((path,i)=>[path,createHash('sha256').update(raw[i]).digest('hex')]));
  writeFileSync(process.argv[2]||new URL('../catalog/source-review-queue-2014.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result.summary));
}