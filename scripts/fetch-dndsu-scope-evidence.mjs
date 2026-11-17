import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export async function fetchPublicHtml(url,{fetchImpl=fetch,maxBytes=16*1024*1024}={}){
 const u=new URL(url);if(u.origin!=='https://dnd.su'||u.username||u.password||u.hash)throw Error('Unexpected evidence origin');
 const response=await fetchImpl(u,{redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))throw Error('Unexpected evidence response');
 const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>maxBytes)throw Error('Evidence exceeds size limit');chunks.push(chunk);}
 if(!size)throw Error('Empty evidence response');return Buffer.concat(chunks);
}
export const evidenceJobs=[
 {file:'source-spell-index.html',url:'https://dnd.su/piece/spells/index-list/'},
 ...['feats','backgrounds','race'].map(s=>({file:'source-'+s+'.html',url:'https://dnd.su/'+s+'/'})),
 ...['inventory','mechanics'].map(s=>({file:'source-'+s+'.html',url:'https://dnd.su/articles/'+s+'/'})),
 ...['classic','multiverse'].map(v=>({file:'bestiary-'+v+'.html',url:'https://dnd.su/piece/bestiary/index-list/?content='+v})),
 ...[[95,'armor-and-shields'],[96,'arms'],[98,'equipment'],[100,'tools']].map(([id,slug])=>({file:'equipment-'+id+'.html',url:'https://dnd.su/articles/inventory/'+id+'-'+slug+'/'}))
];
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const directory=process.argv[2];if(!directory)throw Error('Output directory required');mkdirSync(directory,{recursive:true});
 for(const job of evidenceJobs){writeFileSync(directory+'/'+job.file,await fetchPublicHtml(job.url));console.log(job.file);}
}
