// Only common thumbnails. No game data, cookies, personal uploads or API bodies.
function createSkazArtCache({storage,locks,identity,origin,limit=2*1024*1024,maxFiles=128}){
 const prefix='skaz-art-thumbnails-v1:',name=prefix+identity;
 let closed=false,epoch=0,unavailable=false;
 const safe=url=>typeof url==='string'&&/^\/art\/common\/[a-f0-9]{64}\.png$/.test(url);
 const enabled=Boolean(storage&&locks?.request&&/^(local|[a-zA-Z0-9-]{8,80})$/.test(identity));
 async function run(fn){
  if(!enabled||closed||unavailable)return null;
  const generation=epoch;
  try{return await locks.request(name,async()=>{
   if(closed||generation!==epoch)return null;
   return fn(await storage.open(name),()=>!closed&&generation===epoch);
  });}catch{unavailable=true;return null;}
 }
 async function list(cache){
  const rows=[];
  for(const key of await cache.keys()){
   const response=await cache.match(key),size=Number(response?.headers.get('X-Skaz-Bytes'));
   if(!Number.isSafeInteger(size)||size<1||size>32768){await cache.delete(key);continue;}
   rows.push({key,size});
  }
  return rows;
 }
 return {
  async remove(url){if(!safe(url))return false;return run(cache=>cache.delete(origin+url));},
  async get(url){if(!safe(url))return null;return run(async(cache,live)=>{
   const response=await cache.match(origin+url);if(!response)return null;
   const blob=await response.blob();
   if(blob.type!=='image/png'||blob.size>32768||blob.size!==Number(response.headers.get('X-Skaz-Bytes'))){await cache.delete(origin+url);return null;}
   if(!live())return null;
   // Cache insertion order is the LRU order, under the cross-tab lock.
   await cache.delete(origin+url);await cache.put(origin+url,new Response(blob,{headers:{'Content-Type':'image/png','X-Skaz-Bytes':String(blob.size)}}));
   return live()?blob:null;
  });},
  async put(url,blob){if(!safe(url)||blob.type!=='image/png'||blob.size<1||blob.size>32768||blob.size>limit)return false;
   return run(async(cache,live)=>{
    await cache.delete(origin+url);const rows=await list(cache);let bytes=rows.reduce((n,r)=>n+r.size,0);
    while(rows.length&&(bytes+blob.size>limit||rows.length>=maxFiles)){const row=rows.shift();await cache.delete(row.key);bytes-=row.size;}
    if(!live())return false;
    await cache.put(origin+url,new Response(blob,{headers:{'Content-Type':'image/png','X-Skaz-Bytes':String(blob.size)}}));return live();
   });
  },
  async stats(){return await run(async cache=>{const rows=await list(cache);return {files:rows.length,bytes:rows.reduce((n,r)=>n+r.size,0),limit,maxFiles};});},
  async clear({lock=false}={}){
   epoch++;if(lock)closed=true;
   if(!enabled)return false;
   try{await locks.request(name,()=>storage.delete(name));return true;}catch{unavailable=true;return false;}
  }
 };
}
