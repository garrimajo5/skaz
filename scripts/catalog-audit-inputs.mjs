import {readFileSync} from 'node:fs';

const baseline = 'catalog/history/2026-11-28';
export const scopeRegisterPath = 'catalog/scope-register-2014.json';
export const adventureWordingPath = 'catalog/d07-adventure-wording-rights-2014.json';

const archived = [
  {report: scopeRegisterPath, input: 'catalog/art-coverage.json', snapshot: baseline+'/art-coverage.json'},
  {report: adventureWordingPath, input: 'catalog/source-rights-audit-2014.json', snapshot: baseline+'/source-rights-audit-2014.json'},
];
export const archivedAuditInputPaths = archived.map(({snapshot}) => snapshot);

export function auditInputPath(report, input) {
  return archived.find(record => record.report === report && record.input === input)?.snapshot ?? input;
}

export function readAuditInput(report, input) {
  return readFileSync(new URL('../'+auditInputPath(report,input),import.meta.url),'utf8');
}

export function readScopeBundle() {
  return JSON.parse(readFileSync(new URL('../'+baseline+'/bundled-catalog.json',import.meta.url),'utf8'));
}
