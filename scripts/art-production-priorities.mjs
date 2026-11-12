import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundledCatalog} from '../server/bundled-catalog.mjs';

const definitions=[['spell-0-3','Заговоры и заклинания 1–3 кругов'],['spell-4-5','Заклинания 4–5 кругов'],['spell-6-9','Заклинания 6–9 кругов'],['monster-0-5','Существа: опасность 0–5'],['monster-6-10','Существа: опасность выше 5 до 10'],['monster-11-plus','Существа: опасность выше 10'],['item-artifact','Предметы и артефакты'],['unclassified','Требуют уточнения уровня или опасности']];
function challenge(value){if(typeof value==='number')return Number.isFinite(value)&&value>=0?value:null;if(typeof value!=='string'||!/^\d+(?:\/\d+)?$/.test(value))return null;const [n,d=1]=value.split('/').map(Number);return d>0?n/d:null;}
export function productionPriorities(entries,coverage){
 if(coverage.ruleset!=='5e-2014'||coverage.errors?.length)throw Error('Coverage must be valid 2014 data');
 const accepted=new Set(coverage.statuses.accepted),seen=new Set();
 const groups=Object.fromEntries(definitions.map(([id,label])=>[id,{id,label,total:0,accepted:0,remaining:[]} ]));
 for(const entry of entries){
  if(!['spell','monster','item','artifact'].includes(entry.kind))continue;
  if(entry.ruleset!=='5e-2014'||seen.has(entry.id))throw Error('Duplicate ID or unsupported edition');seen.add(entry.id);
  let bucket='unclassified';
  if(entry.kind==='spell'){const level=entry.spell?.level;if(Number.isInteger(level)&&level>=0&&level<=9)bucket=level<=3?'spell-0-3':level<=5?'spell-4-5':'spell-6-9';}
  else if(entry.kind==='monster'){const cr=challenge(entry.monster?.challenge);if(cr!==null)bucket=cr<=5?'monster-0-5':cr<=10?'monster-6-10':'monster-11-plus';}
  else bucket='item-artifact';
  const group=groups[bucket];group.total++;if(accepted.has(entry.id))group.accepted++;else group.remaining.push(entry.id);
 }
 if([...accepted].some(id=>!seen.has(id))||seen.size!==coverage.total)throw Error('Coverage and catalog identities differ');
 const queues=Object.values(groups);for(const q of queues)q.remaining.sort();
 return {schemaVersion:1,ruleset:'5e-2014',basis:'Порядок производства по кругу заклинания и опасности существа; не телеметрия частоты. Только проверенные accepted считаются покрытием.',total:seen.size,accepted:accepted.size,queues};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=productionPriorities(bundledCatalog().bundle.entries,JSON.parse(readFileSync(new URL('../catalog/art-coverage.json',import.meta.url),'utf8')));
 const file=new URL('../catalog/art-production-priorities.json',import.meta.url),text=JSON.stringify(report,null,2)+'\n';
 if(process.argv.includes('--write'))writeFileSync(file,text);else if(readFileSync(file,'utf8').replaceAll('\r\n','\n')!==text)throw Error('Stale priority report: run --write');
 console.log(JSON.stringify(report.queues.map(({id,total,accepted,remaining})=>({id,total,accepted,remaining:remaining.length})),null,2));
}
