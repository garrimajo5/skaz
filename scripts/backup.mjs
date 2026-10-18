import path from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openStore } from '../server/store.mjs';
const database = path.resolve(process.env.SKAZ_DB || fileURLToPath(new URL('../data/skaz.sqlite', import.meta.url)));
if (!existsSync(database)) throw new Error('База ещё не создана. Сначала запусти приложение.');
const folder = fileURLToPath(new URL('../backups/', import.meta.url));
mkdirSync(folder, { recursive: true });
const destination = path.join(folder, `skaz-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
const store = openStore(database);
try { await store.backup(destination); console.log(`Резервная копия: ${destination}`); }
finally { store.close(); }
