// Common catalog art is decorative: names, rules and actions never depend on it.
const SkazArt=(()=>{
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let pendingIndex,indexLoading=false,retryAfter=0;
 const failed=new Set();
 let closed=false,cacheGeneration=0,renderGeneration=0;
 const objectUrls=new Map();
 const cache=(()=>{try{return typeof createSkazArtCache==='function'?createSkazArtCache({storage:globalThis.caches,locks:globalThis.navigator?.locks,identity:typeof SkazAccount!=='undefined'?SkazAccount.userId||'local':'local',origin:location.origin}):null;}catch{return null;}})();
 async function index(){
  if(!pendingIndex&&Date.now()<retryAfter)return null;
  if(!pendingIndex){indexLoading=true;pendingIndex=fetch('/api/art',{cache:'no-store',signal:AbortSignal.timeout(10000)}).then(async response=>{
   if(!response.ok)throw Error('Art unavailable');const data=await response.json();
   if(data.schemaVersion!==1||!Array.isArray(data.entries)||data.entries.length>1000)throw Error('Invalid art index');
   const entries=new Map();
   for(const item of data.entries){
    if(typeof item.id!=='string'||entries.has(item.id))throw Error('Invalid art identity');
    for(const role of ['thumbnail','card']){
     const file=item.files?.[role];
     if(!file||!/^\/art\/common\/[a-f0-9]{64}\.png$/.test(file.url)||!['width','height'].every(key=>Number.isInteger(file[key])&&file[key]>0&&file[key]<=384))throw Error('Invalid art file');
    }
    entries.set(item.id,item);
   }
   return entries;
  }).catch(()=>{pendingIndex=null;retryAfter=Date.now()+10000;return null;}).finally(()=>{indexLoading=false;});}
  return pendingIndex;
 }
 function markup(entry,role='thumbnail'){
  if(!entry?.id||!['spell','item','artifact','monster'].includes(entry.kind))return '';
  const size=role==='card'?'card':'thumbnail';
  const symbol=entry.kind==='spell'?'✧':entry.kind==='monster'?'♞':'▣';
  return `<span class="skaz-art skaz-art-${size}" data-skaz-art="${escape(entry.id)}" data-art-role="${size}" aria-hidden="true"><span class="skaz-art-fallback">${symbol}</span></span>`;
 }
 async function hydrate(node){
  const generation=cacheGeneration;let renderVersion=renderGeneration;
  if(typeof SkazPersonalArtView!=='undefined'){
   SkazPersonalArtView.sync();renderVersion=renderGeneration;
   try{
    const privateBlob=await SkazPersonalArtView.read(node.dataset.skazArt,node.dataset.artRole);
    if(closed||!node.isConnected||renderVersion!==renderGeneration)return;
    if(privateBlob){const img=document.createElement('img');img.alt='';img.width=img.height=node.dataset.artRole==='thumbnail'?96:384;img.decoding='async';const url=URL.createObjectURL(privateBlob);objectUrls.set(node,url);img.src=url;img.addEventListener('load',()=>node.classList.add('skaz-art-loaded'),{once:true});img.addEventListener('error',()=>{img.remove();URL.revokeObjectURL(url);objectUrls.delete(node);node.classList.remove('skaz-art-loaded');if(node.isConnected)failed.add(node);},{once:true});node.append(img);return;}
   }catch{if(!closed&&node.isConnected&&renderVersion===renderGeneration)failed.add(node);return;}
  }
  const entries=await index();if(closed||!node.isConnected||renderVersion!==renderGeneration)return;
  if(!entries){failed.add(node);return;}
  const item=entries.get(node.dataset.skazArt),file=item?.files[node.dataset.artRole];if(!file)return;
  const img=document.createElement('img');img.alt='';img.width=file.width;img.height=file.height;img.loading='lazy';img.decoding='async';
  img.addEventListener('load',()=>node.classList.add('skaz-art-loaded'),{once:true});
  img.addEventListener('error',()=>{node.classList.remove('skaz-art-loaded');img.remove();const url=objectUrls.get(node);if(url){URL.revokeObjectURL(url);objectUrls.delete(node);}void cache?.remove(file.url);if(node.isConnected)failed.add(node);},{once:true});
  let blob=null;
  if(cache&&node.dataset.artRole==='thumbnail'){
   blob=await cache.get(file.url);
   if(!blob&&!closed){
    try{const response=await fetch(file.url,{cache:'no-store',signal:AbortSignal.timeout(10000)});
     if([401,403].includes(response.status)){await response.body?.cancel();if(typeof SkazAccount!=='undefined'&&SkazAccount.userId)SkazAccount.lock();else lock();return;}
     if(response.ok&&response.headers.get('Content-Type')?.split(';')[0]==='image/png'){
      const candidate=await response.blob();if(candidate.size<=32768){blob=candidate;if(generation===cacheGeneration)await cache.put(file.url,blob);}
     }else await response.body?.cancel();
    }catch{}
   }
  }
  if(closed||!node.isConnected||renderVersion!==renderGeneration)return;
  if(blob){const url=URL.createObjectURL(blob);objectUrls.set(node,url);img.src=url;}else img.src=file.url;
  node.append(img);
 }
 const seen=new WeakSet(),watching=new Set();
 const visibility=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.isIntersecting){visibility.unobserve(entry.target);watching.delete(entry.target);hydrate(entry.target);}
 },{rootMargin:'80px'}):null;
 function scan(){
  for(const [node,url] of objectUrls)if(!node.isConnected){URL.revokeObjectURL(url);objectUrls.delete(node);}
  if(closed||location.protocol==='file:')return;
  for(const node of failed)if(!node.isConnected)failed.delete(node);
  for(const node of watching)if(!node.isConnected){visibility.unobserve(node);watching.delete(node);}
  for(const node of document.querySelectorAll('[data-skaz-art]'))if(node.isConnected&&!seen.has(node)){seen.add(node);if(visibility){watching.add(node);visibility.observe(node);}else hydrate(node);}
 }
 // A transient outage must not poison the page until reload. Retry only failed
 // slots after reconnect, through visibility observation; never replay actions.
 if(typeof addEventListener==='function')addEventListener('online',()=>{
  retryAfter=0;if(!indexLoading)pendingIndex=null;
  for(const node of failed)seen.delete(node);failed.clear();scan();
 });
 if(typeof MutationObserver==='function'){
  let queued=false;
  new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;scan();});}}).observe(document.body,{childList:true,subtree:true});
 }
 function refreshPrivate(){renderGeneration++;cacheGeneration++;for(const url of objectUrls.values())URL.revokeObjectURL(url);objectUrls.clear();for(const node of document.querySelectorAll('[data-skaz-art]')){for(const img of node.querySelectorAll?.('img')||[])img.remove();node.classList.remove('skaz-art-loaded');seen.delete(node);}failed.clear();scan();}
 async function clearCache(){cacheGeneration++;return cache?cache.clear():false;}
 function lock(){closed=true;pendingIndex=null;failed.clear();for(const url of objectUrls.values())URL.revokeObjectURL(url);objectUrls.clear();void cache?.clear({lock:true});}
 return {refreshPrivate,markup,clearCache,cacheStats:async()=>cache?cache.stats():null,lock};
})();
