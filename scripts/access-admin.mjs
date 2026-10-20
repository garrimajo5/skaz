import { DatabaseSync, backup } from 'node:sqlite';
import { readFile, stat, open, chmod, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../server/store.mjs';

// This is a local administrative tool, never an HTTP endpoint. The explicit
// destination is reserved exclusively and backed up before openStore migrates it.
export async function administerAccess({ database, requestFile, backupFile }) {
  if (![database,requestFile,backupFile].every(value=>typeof value==='string'&&value)) throw new Error('Нужны база, JSON команды и новый путь резервной копии');
  const source=await realpath(database), destination=path.resolve(backupFile);
  if (source===destination) throw new Error('Копия должна отличаться от рабочей базы');
  if (!(await stat(source)).isFile()) throw new Error('Нужна существующая база');
  if ((await stat(requestFile)).size>8192) throw new Error('Административная команда слишком велика');
  const request=JSON.parse((await readFile(requestFile,'utf8')).replace(/^\uFEFF/,''));
  const reservation=await open(destination,'wx',0o600);
  await reservation.close();
  let connection;
  try {
    connection=new DatabaseSync(source,{readOnly:true});
    await backup(connection,destination);
    await chmod(destination,0o600);
  } finally { connection?.close(); }
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
