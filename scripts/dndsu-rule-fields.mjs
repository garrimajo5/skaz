import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {jsonAssignment, parseIndex, compareNames} from './audit-dndsu-names.mjs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';

export const sha = value => createHash('sha256').update(value).digest('hex');
const schools = {abjuration:'Ограждение',conjuration:'Вызов',divination:'Прорицание',enchantment:'Очарование',evocation:'Воплощение',illusion:'Иллюзия',necromancy:'Некромантия',transmutation:'Преобразование'};
export function booleanFilter(value) {
  if (!Array.isArray(value) || value.length !== 1 || !['1','2'].includes(String(value[0]))) throw Error('Unknown boolean filter');
  return String(value[0]) === '2';
}
export function spellFields(card) {
  if (!/^([01]\|){3}$/.test(card.filter_components) || !Object.values(schools).includes(card.school) || !/^(?:[1-9]|Заговор)$/.test(card.level)) throw Error('Unknown spell metadata');
  return {level:card.level==='Заговор'?0:Number(card.level),school:Object.keys(schools).find(key=>schools[key]===card.school),components:['V','S','M'].filter((_,i)=>card.filter_components.split('|')[i]==='1').sort(),concentration:booleanFilter(card.filter_concentration),ritual:booleanFilter(card.filter_ritual)};
}
export function article(html) {
  const start=html.indexOf('itemprop="articleBody"');
  const end=html.indexOf('class="card__footer"',start);
  if(start<0 || end<start) throw Error('Missing article boundaries');
  return html.slice(html.indexOf('>',start)+1,html.lastIndexOf('<',end)).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&[a-z#0-9]+;/gi,' ').replace(/\s+/g,' ').trim();
}
export function snapshot(folder) {
  const aliases=JSON.parse(readFileSync(new URL('../catalog/dndsu-name-aliases.json',import.meta.url),'utf8'));
  const {bundle}=bundledCatalog();
  return {schemaVersion:1,ruleset:'5e-2014',sections:Object.fromEntries(['spells','bestiary','items'].map(section=>{
    const raw=readFileSync(`${folder}/dndsu-${section}-list.txt`,'utf8');
    const kinds={spells:['spell'],bestiary:['monster'],items:['item','artifact']}[section];
    const rows=compareNames(parseIndex(raw,section),bundle.entries.filter(e=>kinds.includes(e.kind)),aliases.filter(a=>a.url.startsWith(`https://dnd.su/${section}/`)));
    const metadata=jsonAssignment(raw,section==='spells'?'LIST':'filterItems');
    for(const row of rows) {
      if(!row.candidateIds.length) continue;
      const id=new URL(row.url).pathname.split('/')[2].split('-')[0];
      if(section==='spells') row.fields=spellFields(metadata.cards.find(c=>'https://dnd.su'+c.link===row.url));
      if(section==='bestiary') {
        const item=raw.match(new RegExp(`data-id=['"]${id}['"]([\\s\\S]*?)</a>`));
        const block=item?.[1].match(/<span class=['"]list-mark__danger['"]>\[<span>([^<]+)<\/span>/);
        if(!block || !/^(?:\d+|1\/[248])$/.test(block[1])) throw Error('Unknown challenge '+row.url);
        row.fields={challenge:block[1]};
      }
      if(section==='items') row.fields={attunement:booleanFilter(metadata[id].attunement)};
    }
    return [section,{rawSha256:sha(raw),indexVariant:section==='bestiary'?'multiverse':'official',rows}];
  }))};
}
export function audit(snapshot, entries, clauses=[]) {
  if(snapshot.schemaVersion!==1||snapshot.ruleset!=='5e-2014'||Object.keys(snapshot.sections||{}).sort().join(',')!=='bestiary,items,spells') throw Error('Invalid snapshot scope');
  const byId=new Map(entries.map(e=>[e.id,e]));
  const urls=new Set(),candidateIds=new Set();
  const rows=[];
  for(const [section,data] of Object.entries(snapshot.sections)) for(const row of data.rows) {
    if(urls.has(row.url)||!new RegExp(`^https://dnd\\.su/${section}/[0-9]+-[a-z0-9_-]+/$`).test(row.url)||!Array.isArray(row.candidateIds))throw Error('Invalid snapshot row');
    urls.add(row.url);
    if(!row.candidateIds.length) { rows.push({url:row.url,en:row.en,status:'no-name-candidate',fields:'unverified'}); continue; }
    const expectedKeys={spells:'components,concentration,level,ritual,school',bestiary:'challenge',items:'attunement'}[section];
    if(Object.keys(row.fields||{}).sort().join(',')!==expectedKeys)throw Error('Missing or unknown field set: '+row.url);
    for(const id of row.candidateIds) {
      if(candidateIds.has(id))throw Error('Duplicate candidate '+id);
      candidateIds.add(id);
      const entry=byId.get(id); if(!entry) throw Error('Stale candidate '+id);
      const local=entry.spell||entry.monster||entry.item||entry.artifact;
      const checks=Object.entries(row.fields).map(([field,expected])=>{
        const actual=Array.isArray(local?.[field])?[...local[field]].sort():local?.[field];
        return {field,expected,actual:actual??null,status:JSON.stringify(actual)===JSON.stringify(expected)?'match':'different'};
      });
      const selected=clauses.filter(c=>c.id===id).map(c=>({...c,status:c.patterns.every(p=>new RegExp(p,'u').test(entry.text))?'present':c.gapStatus||'missing-clause'}));
      rows.push({url:row.url,id,section,checks,clauses:selected,fullRules:'unverified'});
    }
  }
  for(const entry of entries.filter(e=>['spell','monster','item','artifact'].includes(e.kind)))if(!candidateIds.has(entry.id))throw Error('Unmapped catalog card; refresh snapshot: '+entry.id);
  const checked=rows.filter(r=>r.checks);
  return {schemaVersion:1,ruleset:'5e-2014',snapshotSha256:sha(JSON.stringify(snapshot)),catalogSha256:sha(JSON.stringify(entries)),summary:{sourcePages:Object.values(snapshot.sections).reduce((n,s)=>n+s.rows.length,0),noNameCandidate:rows.filter(r=>!r.checks).length,candidateCards:checked.length,fieldChecks:checked.reduce((n,r)=>n+r.checks.length,0),differences:checked.flatMap(r=>r.checks).filter(c=>c.status==='different').length,clauseChecks:checked.flatMap(r=>r.clauses).length,clauseGaps:checked.flatMap(r=>r.clauses).filter(c=>c.status!=='present').length,fullRulesVerified:0},rows};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [mode,input,output]=process.argv.slice(2);
  if(!input||!output||!['snapshot','audit'].includes(mode)) throw Error('Usage: node scripts/dndsu-rule-fields.mjs snapshot RAW_DIR OUTPUT | audit SNAPSHOT OUTPUT');
  const result=mode==='snapshot'?snapshot(input):audit(JSON.parse(readFileSync(input,'utf8')),bundledCatalog().bundle.entries,JSON.parse(readFileSync(new URL('../catalog/dndsu-rule-clauses-2026-11-15.json',import.meta.url),'utf8')).clauses);
  writeFileSync(output,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result.summary||{sections:Object.fromEntries(Object.entries(result.sections).map(([k,v])=>[k,v.rows.length]))}));
}
