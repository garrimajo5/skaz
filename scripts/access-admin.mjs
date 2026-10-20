import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../server/store.mjs';
import { privateDatabaseBackup } from './private-backup.mjs';

export async function administerAccess({ database, requestFile, backupFile }) {
  if (![database,requestFile,backupFile].every(value=>typeof value==='string'&&value)) throw new Error('Нужны база, JSON команды и новый путь резервной копии');
  if ((await stat(requestFile)).size>8192) throw new Error('Административная команда слишком велика');
  const request=JSON.parse((await readFile(requestFile,'utf8')).replace(/^\uFEFF/,''));
  const {source,destination}=await privateDatabaseBackup(database,backupFile);
  // Even an invalid command keeps the pre-migration backup for the operator.
  const store=openStore(source);
  try { return { ...store.access.apply(request), backup:destination }; }
  finally { store.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [database,requestFile,backupFile,...extra]=process.argv.slice(2);
  if (extra.length || !backupFile) {
    console.error('Использование: node scripts/access-admin.mjs существующая-база.sqlite команда.json новая-копия.sqlite');
    process.exitCode=1;
  } else administerAccess({database,requestFile,backupFile}).then(result=>console.log(JSON.stringify(result)))
    .catch(()=>{console.error('Команда доступа не выполнена. Проверьте поля, права, владельцев и отдельный новый путь копии; существующие файлы не перезаписываются.');process.exitCode=1;});
}
