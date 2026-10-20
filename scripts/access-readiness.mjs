import {realpath} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {accessReadiness} from '../server/access-readiness.mjs';
export {accessReadiness};

if(process.argv[1]&&await realpath(process.argv[1]).catch(()=>null)===fileURLToPath(import.meta.url)){
 const [database,...extra]=process.argv.slice(2);
 if(!database||extra.length){console.error('Использование: node scripts/access-readiness.mjs существующая-база.sqlite');process.exitCode=1;}
 else try{const report=accessReadiness(database);console.log(JSON.stringify(report,null,2));process.exitCode=report.dataReady?0:2;}
 catch{console.error('Не удалось проверить базу. Нужен существующий читаемый файл поддерживаемой схемы. Доступ не изменён.');process.exitCode=1;}
}
