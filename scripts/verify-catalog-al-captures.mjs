import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {companionStatblock} from './catalog-companion-statblocks.mjs';
import {reviewAlPreview, selectedAlPreviewFields, verifyAlPreviewCaptures} from './catalog-al-preview-version-review.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const troodonIds = ['dndsu:bestiary:5977', 'dndsu:bestiary:6005'];
const previewIds = ['5962', '5963', '5965', '5966', '5970', '5971'];
const readCatalog = name => JSON.parse(readFileSync(new URL('../catalog/' + name, import.meta.url)));

export function verifyTroodonCaptures(evidence, scope, sources, captures) {
  if (evidence.schemaVersion !== 1 || evidence.rulesEdition !== '5e-2014' ||
      evidence.accepted !== false || evidence.complete !== false || evidence.approvedDenominator !== null ||
      evidence.automaticMerge !== false || evidence.automaticRename !== false ||
      !isDeepStrictEqual(evidence.records.map(r => r.observationId), troodonIds)) {
    throw Error('Troodon evidence boundary changed');
  }
  for (const row of evidence.records) {
    const original = scope.records.find(r => r.id === row.observationId);
    if (!original || !isDeepStrictEqual(row.originalNames, original.names) || row.url !== original.url ||
        !isDeepStrictEqual(row.sourceIds, original.sourceIds) || !isDeepStrictEqual(row.sourceIds, ['169']) ||
        row.primaryStatBlockRead !== false || row.exactTextVersion !== 'unverified' ||
        row.canonicalId !== null || row.accepted !== false) throw Error('Troodon identity or approval changed');
    const bytes = captures.get(row.observationId);
    if (!bytes || sha(bytes) !== row.rawSha256) throw Error('Changed Troodon capture');
    const html = bytes.toString('utf8');
    const parsed = companionStatblock(html, {pageId: row.observationId, sources});
    const selected = selectedAlPreviewFields(html, row.observationId, sources);
    if (parsed.name !== row.capturedName || parsed.sizeType !== row.sizeType ||
        !isDeepStrictEqual(parsed.sourceIds, row.sourceIds) || !isDeepStrictEqual(selected.selected, row.selected)) {
      throw Error('Troodon selected evidence changed');
    }
  }
  return {verifiedSecondaryCaptures: troodonIds.length, primaryStatBlockVerified: false, automaticMerge: false};
}

// Fixed filenames only: evidence URLs and titles never become paths or network requests.
export function loadAlCaptures(directory, read = readFileSync) {
  const captures = new Map([['primary.pdf', read(join(directory, 'jungle-preview.pdf'))]]);
  for (const id of [...previewIds, ...troodonIds.map(id => id.split(':').at(-1))]) {
    captures.set('dndsu:bestiary:' + id, read(join(directory, id + '.html')));
  }
  return captures;
}

export function verifyAlEvidenceDirectory(directory) {
  const preview = readCatalog('al-preview-version-evidence-2014.json');
  const troodon = readCatalog('al-troodon-boundary-evidence-2014.json');
  const scope = readCatalog('scope-register-2014.json');
  const sources = readCatalog('dndsu-source-register.json').sources;
  reviewAlPreview(preview, scope, readCatalog('adventurers-league-publication-candidates-2014.json'));
  const captures = loadAlCaptures(directory);
  return {
    preview: verifyAlPreviewCaptures(preview, sources, captures),
    troodon: verifyTroodonCaptures(troodon, scope, sources, captures),
    note: 'Read-only byte/secondary-field check; primary transcription still needs independent visual review.'
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) throw Error('Usage: node scripts/verify-catalog-al-captures.mjs evidence-directory');
  console.log(JSON.stringify(verifyAlEvidenceDirectory(process.argv[2]), null, 2));
}
