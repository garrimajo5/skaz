import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {AppError} from './state.mjs';

// Explicit allowlist: personal files and coverage manifests are never imported.
const files=['references.json','srd51-spells.json','srd51-utility-spells.json','srd51-items.json','srd51-monsters.json','srd51-encounter-monsters.json','srd51-conditions.json','srd51-artifacts.json'];
export function bundledCatalog() {
  const bundle={schemaVersion:1,entries:files.flatMap(file=>JSON.parse(readFileSync(new URL('../catalog/'+file,import.meta.url),'utf8')).entries)};
  const version=createHash('sha256').update(JSON.stringify(bundle)).digest('hex');
  const categories=Object.fromEntries(['mechanic','spell','monster','item','artifact'].map(kind=>[kind,bundle.entries.filter(e=>e.kind===kind).length]));
  return {bundle,version,categories};
}
export function validateBundledInstall(request,version) {
  if(!request || typeof request!=='object' || Array.isArray(request) || Object.keys(request).length!==1 || typeof request.version!=='string')throw new AppError(422,'Нужна версия просмотренной подборки');
  if(request.version!==version)throw new AppError(409,'Подборка обновилась. Открой предпросмотр заново.');
}
