import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {parseIndex,normalizeName} from './audit-dndsu-names.mjs';
export function compareVariants(classic,multiverse){
 const identity=r=>r.url.match(/\/bestiary\/(\d+)-/)[1];
 const a=new Set(classic.map(identity)),b=new Set(multiverse.map(identity));
 if(a.size!==classic.length||b.size!==multiverse.length)throw Error('Duplicate bestiary identity');
 const groups=new Map();
 for(const [variant,rows]of [['classic',classic],['multiverse',multiverse]])for(const r of rows){const key=normalizeName(r.en);if(!key)throw Error('Missing name');const g=groups.get(key)||{nameKey:key,classic:[],multiverse:[],rulesEquivalence:'unverified'};g[variant].push(r.url);groups.set(key,g);}
 return {classicPages:a.size,multiversePages:b.size,sharedPages:[...a].filter(x=>b.has(x)).length,classicOnly:classic.filter(r=>!b.has(identity(r))).map(r=>r.url),multiverseOnly:multiverse.filter(r=>!a.has(identity(r))).map(r=>r.url),nameFamilies:[...groups.values()].filter(g=>JSON.stringify(g.classic.map(url=>identity({url})).sort())!==JSON.stringify(g.multiverse.map(url=>identity({url})).sort())).sort((a,b)=>a.nameKey.localeCompare(b.nameKey,'en')),approvedRecordCount:null};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [,,directory,date,output]=process.argv;if(!directory||!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!output)throw Error('Usage: input-directory YYYY-MM-DD output.json');
 const variants={};for(const variant of ['classic','multiverse']){const bytes=readFileSync(directory+'/bestiary-'+variant+'.html');variants[variant]={url:'https://dnd.su/piece/bestiary/index-list/?content='+variant,rawSha256:createHash('sha256').update(bytes).digest('hex'),rows:parseIndex(bytes.toString('utf8'),'bestiary')};}
 const comparison=compareVariants(variants.classic.rows,variants.multiverse.rows);
 writeFileSync(output,JSON.stringify({schemaVersion:1,observedOn:date,variants,comparison},null,2)+'\n');console.log({classic:comparison.classicPages,multiverse:comparison.multiversePages,shared:comparison.sharedPages,classicOnly:comparison.classicOnly.length,multiverseOnly:comparison.multiverseOnly.length,families:comparison.nameFamilies.length});
}
