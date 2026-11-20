import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {catalogInputHash} from './verify-catalog-input-hashes.mjs';

const evidenceFile = 'catalog/source-rights-evidence-2014.json';
const numericFile = 'catalog/numeric-source-scope-policy-2014.json';
const scopeFile = 'catalog/scope-register-2014.json';
const bibliographyFile = 'catalog/class-source-bibliography.json';
const output = new URL('../catalog/source-rights-audit-2014.json', import.meta.url);
const srdUrl = 'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf';
const kinds = ['mechanic','spell','monster','item','artifact'];
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// A diagnostic of declarations, never a license inference or a publishing gate.
export function auditSourceRights({entries, evidence, numeric, bibliography, scope}) {
  if (evidence.schemaVersion !== 1 || evidence.srd51?.url !== srdUrl || evidence.srd51?.license !== 'CC-BY-4.0' || evidence.srd51?.pageCount !== 403) throw Error('Unexpected SRD evidence; review the new source/version explicitly');
  const seen = new Set();
  const categories = Object.fromEntries(kinds.map(kind => [kind, {entries:0, declaredSrd51:0, referenceOnly:0, needsMetadataReview:0, textsIndependentlyClearedByThisAudit:0, approvedDenominator:null}]));
  const findings = [];
  for (const entry of entries) {
    if (typeof entry.id !== 'string' || !entry.id || seen.has(entry.id) || !kinds.includes(entry.kind)) throw Error('Invalid or duplicate bundled identity');
    seen.add(entry.id);
    const category = categories[entry.kind]; category.entries++;
    const source = entry.source ?? {};
    const problems = [];
    if (source.usage === 'reference-only') {
      category.referenceOnly++;
    } else if (source.usage === 'cc-by-4.0') {
      let url;
      try { url = new URL(source.url); } catch { problems.push('invalid-source-url'); }
      if (url && url.href.split('#')[0] !== srdUrl) problems.push('cc-declaration-outside-identified-srd51');
      if (url && !/^#page=([1-9][0-9]*)$/.test(url.hash)) problems.push('missing-exact-srd-page');
      else if (url && Number(url.hash.slice(6)) > 403) problems.push('srd-page-out-of-range');
      for (const field of ['title','version','terms','attribution','changes']) if (typeof source[field] !== 'string' || !source[field].trim()) problems.push('missing-' + field);
      if (typeof source.version === 'string' && !/^5\.1(?:;|$)/.test(source.version)) problems.push('version-not-srd51');
      if (typeof source.title === 'string' && source.title !== 'System Reference Document 5.1') problems.push('title-not-srd51');
      // Presence only: wording, authorship and compliance still need human review.
      if (!problems.length) category.declaredSrd51++;
    } else problems.push('unknown-usage-declaration');
    if (problems.length) { category.needsMetadataReview++; findings.push({id:entry.id, problems}); }
  }
  const publications = [];
  const publicationIds = new Set();
  for (const [namespace, records, idField] of [['numeric',numeric.records,'sourceId'],['class-bibliography',bibliography.records,'id']]) {
    if (!Array.isArray(records)) throw Error('Missing publication records');
    for (const record of records) {
      if (typeof record[idField] !== 'string' || !record[idField]) throw Error('Missing publication identity');
      const id = namespace + ':' + record[idField];
      if (publicationIds.has(id)) throw Error('Duplicate publication identity');
      publicationIds.add(id);
      publications.push({id, title:record.observedTitle ?? record.referenceTitle,
        scopeDisposition:record.disposition ?? record.scopeDecision ?? 'unreviewed',
        upstreamReuseDeclaration:record.reusePermission ?? 'not-recorded',
        textReuseEvidence:'not-established-by-this-audit',
        translationReuseEvidence:'not-established-by-this-audit',
        nextStep:'Locate exact version and applicable permission for the intended text or use; do not inherit SRD license from source eligibility.'});
    }
  }
  const referenceSections = {};
  const referenceIds = new Set();
  const numericIds = new Set(numeric.records.map(record=>record.sourceId));
  const referenceFindings = [];
  if (!Array.isArray(scope.records)) throw Error('Missing reference observations');
  for (const record of scope.records) {
    if (typeof record.id !== 'string' || !record.id || referenceIds.has(record.id) || typeof record.section !== 'string' || !/^[a-z]+$/.test(record.section)) throw Error('Invalid or duplicate reference identity');
    referenceIds.add(record.id);
    if (!Array.isArray(record.sourceIds) || record.sourceIds.some(id=>typeof id !== 'string')) throw Error('Invalid reference source IDs');
    if (!Object.hasOwn(referenceSections,record.section)) referenceSections[record.section]={observations:0, withCandidateMatch:0, withoutNumericAttribution:0, reuseDeclarations:{}, translationsIndependentlyClearedByThisAudit:0, approvedDenominator:null};
    const section=referenceSections[record.section]; section.observations++;
    if (Array.isArray(record.candidateIds) && record.candidateIds.length) section.withCandidateMatch++;
    if (!record.sourceIds.length) section.withoutNumericAttribution++;
    const status=record.reusePermission ?? 'not-recorded';
    if (typeof status !== 'string' || !/^[a-z0-9-]+$/.test(status)) throw Error('Invalid reference reuse declaration');
    section.reuseDeclarations[status]=(Object.hasOwn(section.reuseDeclarations,status)?section.reuseDeclarations[status]:0)+1;
    const unknownSourceIds=[...new Set(record.sourceIds.filter(id=>!numericIds.has(id)))];
    if (unknownSourceIds.length) referenceFindings.push({id:record.id,unknownSourceIds});
  }
  return {schemaVersion:1, status:'metadata-diagnostic-not-rights-or-scope-acceptance',
    accepted:false, complete:false, approvedDenominator:null,
    bundleEntriesSha256:digest(entries),
    summary:{bundledEntries:entries.length, declaredSrd51:Object.values(categories).reduce((n,c)=>n+c.declaredSrd51,0),
      referenceOnly:Object.values(categories).reduce((n,c)=>n+c.referenceOnly,0), metadataFindings:findings.length,
      publicationRecords:publications.length, referenceObservations:referenceIds.size, referenceFindings:referenceFindings.length, textsIndependentlyClearedByThisAudit:0},
    categories, findings, publications, referenceSections, referenceFindings,
    limitations:['Counts describe bundled metadata, not full catalog coverage or verified permissions.',
      'A zero finding count does not verify translation authorship, passage correspondence or legal compliance.',
      'The publication list combines two namespaces; it is not a deduplicated publication denominator.',
      'A candidate ID or matching SRD name does not license the wording of a reference page or its translation.',
      'No runtime import, license grant, source exclusion or publishing approval is changed.']};
}

export function buildSourceRightsAudit() {
  const files = [evidenceFile, numericFile, bibliographyFile, scopeFile];
  const texts = files.map(file => readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  const [evidence, numeric, bibliography, scope] = texts.map(JSON.parse);
  return {...auditSourceRights({entries:bundledCatalog().bundle.entries,evidence,numeric,bibliography,scope}),
    inputSha256:Object.fromEntries(files.map((file,index)=>[file,catalogInputHash(texts[index])]))};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.slice(2).some(arg=>arg!=='--write')) throw Error('Usage: node scripts/audit-source-rights-2014.mjs [--write]');
  const report = buildSourceRightsAudit();
  const text = JSON.stringify(report,null,2)+'\n';
  if (process.argv.includes('--write')) writeFileSync(output,text);
  else if (readFileSync(output,'utf8').replace(/\r\n/g,'\n') !== text) throw Error('Stale rights diagnostic; review inputs before --write');
  console.log(JSON.stringify(report.summary));
  if (report.findings.length || report.referenceFindings.length) process.exitCode=1;
}
