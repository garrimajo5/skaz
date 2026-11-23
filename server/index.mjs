import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.mjs';
import { createApp } from './app.mjs';
import {startupOptions} from './startup.mjs';
const filename = path.resolve(process.env.SKAZ_DB || fileURLToPath(new URL('../data/skaz.sqlite', import.meta.url)));
const config=startupOptions({database:filename,port:process.env.PORT??'4173',origin:process.env.SKAZ_PUBLIC_ORIGIN,mode:process.env.SKAZ_AUTH_MODE??'shared',classAdvancement:process.env.SKAZ_CLASS_ADVANCEMENT??'0',personalArt:process.env.SKAZ_PERSONAL_ART??'0',profileEditors:process.env.SKAZ_PROFILE_EDITORS??'1',profileWriteFormat:process.env.SKAZ_PROFILE_WRITE_FORMAT??'15'});
const port=config.port;
const store = openStore(filename,{classAdvancement:!!config.classAdvancement,profileWriteFormat:config.profileWriteFormat});
const server = createApp(store, { publicOrigin: config.publicOrigin, profileEditors:config.profileEditors??true, classAdvancement:!!config.classAdvancement, ...(config.mode==='individual'?{sessions:store.authentication(),individualWrites:true,...(config.personalArt?{personalArt:(userId,options)=>store.forUser(userId,'personal-art-view',{...options,personalArt:true}).personalArt}:{})}:{}) });
server.listen(port, '127.0.0.1', () => {
  console.log(`СКАЗ: http://127.0.0.1:${port}`);
  console.log(`База данных: ${filename}`);
  console.log(`Режим входа: ${config.mode}`);
});
server.on('error', error => { console.error(error.message); store.close(); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => { store.close(); process.exit(0); }));
