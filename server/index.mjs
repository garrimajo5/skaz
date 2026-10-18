import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.mjs';
import { createApp } from './app.mjs';
const filename = path.resolve(process.env.SKAZ_DB || fileURLToPath(new URL('../data/skaz.sqlite', import.meta.url)));
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT должен быть от 1 до 65535');
const store = openStore(filename);
const server = createApp(store);
server.listen(port, '127.0.0.1', () => {
  console.log(`СКАЗ: http://127.0.0.1:${port}`);
  console.log(`База данных: ${filename}`);
});
server.on('error', error => { console.error(error.message); store.close(); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => { store.close(); process.exit(0); }));
