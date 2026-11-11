// Refresh only the public name indexes; never fetch descriptions, images or private pages.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const folder=resolve(process.argv[2]||'data');
await mkdir(folder,{recursive:true});
for(const [section,path] of [['spells','/piece/spells/index-list/'],['bestiary','/piece/bestiary/index-list/?content=multiverse'],['items','/piece/items/index-list/']]){
 const response=await fetch('https://dnd.su'+path,{signal:AbortSignal.timeout(30000),redirect:'error'});
 if(!response.ok)throw new Error(section+': HTTP '+response.status);
 if(!response.headers.get('content-type')?.includes('text/html'))throw new Error(section+': unexpected content type');
 let length=0;const chunks=[];
 for await(const chunk of response.body){length+=chunk.length;if(length>16*1024*1024){await response.body.cancel().catch(()=>{});throw new Error('Index exceeds 16 MiB');}chunks.push(chunk);}
 await writeFile(resolve(folder,'dndsu-'+section+'-list.txt'),Buffer.concat(chunks));
 console.log(section+': public index saved');
}
