import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const sameLooking = new Map(Object.entries({А:'A',В:'B',С:'C',Е:'E',Н:'H',К:'K',М:'M',О:'O',Р:'P',Т:'T',Х:'X',а:'a',с:'c',е:'e',о:'o',р:'p',х:'x',у:'y'}));
const latin = /\p{Script=Latin}/u, cyrillic = /\p{Script=Cyrillic}/u;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const cmp = (a,b) => a < b ? -1 : a > b ? 1 : 0;
// Comparison keys are research aids only. They never replace stored names or IDs.
export const nameComparisonKey = value => value.normalize('NFC').replace(/[‘’]/g,"'").replace(/[‐‑–—]/g,'-').replace(/\s+/gu,' ').trim().toLowerCase();
const hash = value => createHash('sha256').update(value).digest('hex');

export function reviewObservedNames(scope) {
  if (!Array.isArray(scope.records)) throw Error('Missing scope records');
  const ids = new Set(), rows = [];
  for (const row of scope.records) {
    if (!nonempty(row.id) || ids.has(row.id) || !nonempty(row.section) || !Array.isArray(row.sourceIds) || row.sourceIds.some(id=>!nonempty(id)) || new Set(row.sourceIds).size !== row.sourceIds.length) throw Error('Invalid observation identity or sources');
    ids.add(row.id);
    const name = row.names?.en;
    if (name !== null && name !== undefined && typeof name !== 'string') throw Error('Invalid English name');
    rows.push({id:row.id,section:row.section,observedName:name??null,sourceIds:[...row.sourceIds].sort(cmp)});
  }
  rows.sort((a,b)=>cmp(a.id,b.id));
  const groups = new Map();
  for (const row of rows) {
    if (!nonempty(row.observedName)) continue;
    const key = JSON.stringify([row.section,nameComparisonKey(row.observedName)]);
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(row);
  }
  const duplicateNameGroups = [...groups.entries()].filter(([,members])=>members.length>1).map(([key,members])=>({
    reviewId:'name-review:'+hash(key).slice(0,20),section:members[0].section,comparisonKey:JSON.parse(key)[1],
    reason:new Set(members.map(r=>r.observedName)).size===1?'identical-observed-name':'typography-or-case-candidate',
    sharedSourceIds:members[0].sourceIds.filter(id=>members.every(r=>r.sourceIds.includes(id))),
    members,accepted:false,canonicalId:null,action:'compare-primary-publications-and-versions-before-any-merge'
  })).sort((a,b)=>cmp(a.reviewId,b.reviewId));
  const scriptDiagnostics = [];
  for (const row of rows) {
    if (!nonempty(row.observedName) || !cyrillic.test(row.observedName)) continue;
    const mixed = latin.test(row.observedName);
    const chars = [...new Set([...row.observedName].filter(c=>cyrillic.test(c)))].sort(cmp);
    const unsupported = chars.filter(c=>!sameLooking.has(c));
    const candidate = mixed && !unsupported.length ? [...row.observedName].map(c=>sameLooking.get(c)??c).join('') : null;
    const key = candidate ? JSON.stringify([row.section,nameComparisonKey(candidate)]) : null;
    scriptDiagnostics.push({...row,reason:mixed?'mixed-latin-cyrillic':'cyrillic-in-english-field',
      characters:chars.map(c=>({character:c,codePoint:'U+'+c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0'),latinLookalike:sameLooking.get(c)??null})),
      candidateName:candidate,candidateObservationIds:key?(groups.get(key)||[]).map(r=>r.id).filter(id=>id!==row.id):[],
      accepted:false,canonicalId:null,action:'check-primary-name-not-automatic-transliteration'});
  }
  const missingEnglishNameIds=rows.filter(r=>!nonempty(r.observedName)).map(r=>r.id);
  return {schemaVersion:1,status:'name-diagnostics-not-identity-acceptance',approvedDenominator:null,complete:false,
    summary:{observedPages:rows.length,namedPages:rows.length-missingEnglishNameIds.length,missingEnglishNames:missingEnglishNameIds.length,duplicateNameGroups:duplicateNameGroups.length,observationsInNameGroups:duplicateNameGroups.reduce((n,g)=>n+g.members.length,0),scriptDiagnostics:scriptDiagnostics.length},
    comparisonPolicy:['Same section only; NFC, case, whitespace, typographic apostrophes and dashes normalize only the review key.','No accent stripping, edit-distance matching, translation, name mutation or canonical ID assignment.','Mixed Cyrillic lookalikes generate an explicit candidate only when every Cyrillic character is supported; wholly Cyrillic names are not transliterated.','A name collision does not establish duplication, publication eligibility, complete rules or reuse rights.'],
    missingEnglishNameIds,duplicateNameGroups,scriptDiagnostics};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const path='catalog/scope-register-2014.json';
  const raw=readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const result=reviewObservedNames(JSON.parse(raw));
  result.inputSha256={[path]:hash(raw)};
  writeFileSync(process.argv[2]||new URL('../catalog/observed-name-review-2014.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result.summary));
}
