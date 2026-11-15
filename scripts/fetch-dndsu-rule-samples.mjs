// Explicit public 2014 sample only. No recursive crawl, browser or remote JS execution.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {article,sha} from './dndsu-rule-fields.mjs';
const folder=resolve(process.argv[2]||'data/dndsu-rule-samples');
const manifest=JSON.parse(await readFile(new URL('../catalog/dndsu-rule-clauses-2026-11-15.json',import.meta.url),'utf8'));
await mkdir(folder,{recursive:true});
const results=[];
for(const source of manifest.sources) {
  if(!/^https:\/\/dnd\.su\/(spells|items|bestiary)\/\d+-[a-z0-9_-]+\/$/.test(source.url)) throw Error('Unexpected public URL');
  const response=await fetch(source.url,{redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok||!response.headers.get('content-type')?.includes('text/html')) throw Error('Bad response: '+source.url);
  let length=0; const chunks=[];
  for await(const chunk of response.body){length+=chunk.length;if(length>4*1024*1024)throw Error('Page exceeds 4 MiB');chunks.push(chunk);}
  const raw=Buffer.concat(chunks); const text=article(raw.toString('utf8'));
  if(text.length<80)throw Error('Empty article');
  const file=new URL(source.url).pathname.split('/').filter(Boolean).join('-')+'.html';
  await writeFile(resolve(folder,file),raw);
  results.push({url:source.url,file,rawSha256:sha(raw),articleSha256:sha(text),checkedAt:new Date().toISOString()});
  console.log(source.url);
  await new Promise(resolve=>setTimeout(resolve,150));
}
await writeFile(resolve(folder,'sources.json'),JSON.stringify(results,null,2)+'\n');
