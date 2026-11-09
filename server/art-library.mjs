// Common accepted art only. HTTP authentication and browser caching are the
// caller's responsibility; personal art must never enter this shared library.
import {readFileSync,realpathSync,statSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {inventory,validate,sha256} from '../scripts/art-registry.mjs';
import {derivePng,recipe} from '../scripts/art-derivatives.mjs';

export function createArtLibrary(manifest,{base,entries=inventory(),maxCacheBytes=8*1024*1024}={}) {
 if(!base || !Number.isSafeInteger(maxCacheBytes) || maxCacheBytes<0 || maxCacheBytes>64*1024*1024)throw Error('Invalid art library options');
 const snapshot=structuredClone(manifest);
 const report=validate(snapshot,entries,base);
 if(report.errors.length)throw Error('Invalid art library: '+report.errors.map(e=>e.error).join('; '));
 const boundary=resolve(realpathSync(base),'assets/art')+sep;
 const routes=new Map(),cache=new Map();let cacheBytes=0;
 const encoder=process.versions.zlib;
 const index=snapshot.entries.filter(item=>item.status==='accepted').map(item=>{
  const files={};
  for(const [role,edge] of [['thumbnail',96],['card',384]]){
   const source=item.files.original;
   // The URL identifies source + conversion, including encoder changes. It is
   // not claimed to be the delivered byte hash (returned separately as ETag).
   const key=sha256(JSON.stringify([source.sha256,recipe,encoder,role]));
   const url='/art/common/'+key+'.png';
   const scale=Math.min(1,edge/Math.max(source.width,source.height));
   files[role]={url,width:Math.max(1,Math.round(source.width*scale)),height:Math.max(1,Math.round(source.height*scale))};
   routes.set(url,{source,edge});
  }
  return {id:item.id,contentSha256:item.contentSha256,version:item.version,crop:item.crop,files};
 });
 return {
  index:()=>structuredClone({schemaVersion:1,recipe,encoder,entries:index}),
  stats:()=>({files:cache.size,bytes:cacheBytes,limit:maxCacheBytes}),
  clear(){cache.clear();cacheBytes=0;},
  read(url){
   const route=routes.get(url);if(!route)return null;
   if(cache.has(url)){const value=cache.get(url);cache.delete(url);cache.set(url,value);return {...value,bytes:Buffer.from(value.bytes)};}
   // Recheck path and content at use time: validation at startup alone cannot
   // protect against a changed file or symlink during a running release.
   try{
    const actual=realpathSync(resolve(base,route.source.path));
    if(!actual.startsWith(boundary)||!statSync(actual).isFile()||statSync(actual).size!==route.source.bytes)return null;
    const source=readFileSync(actual);if(sha256(source)!==route.source.sha256)return null;
    const bytes=derivePng(source,route.edge),value={bytes,etag:'"'+sha256(bytes)+'"',type:'image/png'};
    if(bytes.length<=maxCacheBytes){
     while(cacheBytes+bytes.length>maxCacheBytes){const first=cache.keys().next().value;cacheBytes-=cache.get(first).bytes.length;cache.delete(first);}
     cache.set(url,value);cacheBytes+=bytes.length;
    }
    return {...value,bytes:Buffer.from(bytes)};
   }catch{return null;}
  }
 };
}
