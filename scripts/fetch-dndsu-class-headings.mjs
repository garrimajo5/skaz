import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fetchPublicHtml} from './fetch-dndsu-scope-evidence.mjs';
const directory=process.argv[2];if(!directory)throw Error('Output directory required');mkdirSync(directory,{recursive:true});
const classes=JSON.parse(readFileSync(new URL('../catalog/dndsu-class-discovery.json',import.meta.url))).rows.filter(r=>r.group==='classes');
for(const c of classes){const u=new URL(c.url);if(u.origin!=='https://dnd.su'||!/^\/class\/\d+-[a-z0-9_-]+\/$/.test(u.pathname))throw Error('Unexpected class URL');writeFileSync(directory+'/class-'+u.pathname.match(/\d+/)[0]+'.html',await fetchPublicHtml(u.href));console.log(c.en);}
