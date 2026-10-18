import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openStore } from '../server/store.mjs';

const [filename, flag] = process.argv.slice(2);
if (!filename || (flag && flag !== '--apply') || process.argv.length > 4) {
  console.error('Использование: node scripts/import-catalog.mjs файл.json [--apply]. Без --apply только проверка.');
  process.exitCode = 1;
} else {
  let store;
  try {
    if ((await stat(filename)).size > 5 * 1024 * 1024) throw new Error('Максимальный размер пакета — 5 МиБ');
    const bundle = JSON.parse(await readFile(filename, 'utf8'));
    store = openStore(process.env.SKAZ_DB || fileURLToPath(new URL('../data/skaz.sqlite', import.meta.url)));
    console.log(JSON.stringify(store.catalog.importEntries(bundle, { apply: flag === '--apply' }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { store?.close(); }
}
