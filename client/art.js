// Common catalog art is decorative: names, rules and actions never depend on it.
const SkazArt=(()=>{
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let pendingIndex;
 async function index(){
  if(!pendingIndex)pendingIndex=fetch('/api/art',{cache:'no-store',signal:AbortSignal.timeout(10000)}).then(async response=>{
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
  }).catch(()=>new Map());
  return pendingIndex;
 }
 function markup(entry,role='thumbnail'){
  if(!entry?.id||!['spell','item','artifact','monster'].includes(entry.kind))return '';
  const size=role==='card'?'card':'thumbnail';
  const symbol=entry.kind==='spell'?'✧':entry.kind==='monster'?'♞':'▣';
  return `<span class="skaz-art skaz-art-${size}" data-skaz-art="${escape(entry.id)}" data-art-role="${size}" aria-hidden="true"><span class="skaz-art-fallback">${symbol}</span></span>`;
 }
 async function hydrate(node){
  const entries=await index();if(!node.isConnected)return;
  const item=entries.get(node.dataset.skazArt),file=item?.files[node.dataset.artRole];if(!file)return;
  const img=document.createElement('img');img.alt='';img.width=file.width;img.height=file.height;img.loading='lazy';img.decoding='async';
  img.addEventListener('load',()=>node.classList.add('skaz-art-loaded'),{once:true});
  img.addEventListener('error',()=>{node.classList.remove('skaz-art-loaded');img.remove();},{once:true});
  img.src=file.url;node.append(img);
 }
 const seen=new WeakSet(),watching=new Set();
 const visibility=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.isIntersecting){visibility.unobserve(entry.target);watching.delete(entry.target);hydrate(entry.target);}
 },{rootMargin:'80px'}):null;
 function scan(){
  if(location.protocol==='file:')return;
  for(const node of watching)if(!node.isConnected){visibility.unobserve(node);watching.delete(node);}
  for(const node of document.querySelectorAll('[data-skaz-art]'))if(!seen.has(node)){seen.add(node);if(visibility){watching.add(node);visibility.observe(node);}else hydrate(node);}
 }
 if(typeof MutationObserver==='function'){
  let queued=false;
  new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(()=>{queued=false;scan();});}}).observe(document.body,{childList:true,subtree:true});
 }
 return {markup};
})();
