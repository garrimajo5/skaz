import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { archivedAuditInputPaths, auditInputPath } from './catalog-audit-inputs.mjs';

export const catalogInputHash = text => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');

// Read-only audit: never repair a pin without reviewing the underlying evidence.
export function auditCatalogInputHashes(documents) {
  const mismatches = [];
  let checked = 0;
  for (const [file, text] of documents) {
    const document = JSON.parse(text);
    if (document.inputSha256 === undefined && document.scopeSha256 === undefined) continue;
    if (document.inputSha256 !== undefined && (!document.inputSha256 || typeof document.inputSha256 !== 'object' || Array.isArray(document.inputSha256))) throw Error(`Invalid input hash map: ${file}`);
    const pins = Object.entries(document.inputSha256 ?? {});
    if (document.scopeSha256 !== undefined) pins.push(['catalog/scope-register-2014.json', document.scopeSha256]);
    for (const [dependency, expected] of pins) {
      if (!/^catalog\/[a-zA-Z0-9._-]+\.json$/.test(dependency) || !/^[0-9a-f]{64}$/.test(expected)) throw Error(`Invalid input pin: ${file} -> ${dependency}`);
      checked++;
      const source = auditInputPath(file, dependency);
      if (!documents.has(source)) {
        mismatches.push({file, dependency, reason: 'missing-input'});
      } else if (catalogInputHash(documents.get(source)) !== expected) {
        mismatches.push({file, dependency, reason: 'changed-input'});
      }
    }
  }
  return {documents: documents.size, checked, mismatches};
}

export function loadCatalogDocuments() {
  const directory = new URL('../catalog/', import.meta.url);
  const files = readdirSync(directory).filter(file => file.endsWith('.json')).map(file => 'catalog/'+file);
  files.push(...archivedAuditInputPaths.filter(file => existsSync(new URL('../'+file, import.meta.url))));
  return new Map(files.map(file => [file, readFileSync(new URL('../'+file, import.meta.url), 'utf8')]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = auditCatalogInputHashes(loadCatalogDocuments());
  console.log(JSON.stringify(result, null, 2));
  if (result.mismatches.length) process.exitCode = 1;
}
