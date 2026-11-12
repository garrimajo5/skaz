import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../client/art.js',import.meta.url),'utf8');
const file={url:'/art/common/'+'a'.repeat(64)+'.png',width:96,height:48};
const index={schemaVersion:1,entries:[{id:'spell-a',files:{thumbnail:file,card:{...file,width:384,height:192}}}]};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(data=index,protocol='http:',cache=null,imageFetch=null,privateRead=null){
 const nodes=[],observed=[],requests=[],images=[],events={};let mutation,visibility,networkError=false;
 const context=vm.createContext({...(privateRead?{SkazPersonalArtView:{sync(){},read:privateRead}}:{}),location:{protocol},AbortSignal,queueMicrotask,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},...(cache?{createSkazArtCache:()=>cache}:{}),addEventListener:(type,fn)=>events[type]=fn,fetch:async(...args)=>{requests.push(args);if(args[0].startsWith('/art/')&&imageFetch)return imageFetch();if(networkError)throw Error('Network unavailable');return {ok:true,json:async()=>data};},
  MutationObserver:class{constructor(fn){mutation=fn;}observe(){}},IntersectionObserver:class{constructor(fn){visibility=fn;}observe(node){observed.push(node);}unobserve(){}},
  document:{body:{},querySelectorAll:()=>nodes,createElement:()=>{const image={handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},remove(){this.removed=true;}};images.push(image);return image;}}
 });vm.runInContext(source,context);
 const api=vm.runInContext('SkazArt',context);
 return {api,requests,images,observed,offline:value=>networkError=value,online:()=>events.online(),scan:()=>mutation(),visible:node=>visibility([{target:node,isIntersecting:true}]),node(id='spell-a',role='thumbnail'){const classes=new Set(),node={dataset:{skazArt:id,artRole:role},isConnected:true,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},classes,children:[],append(child){this.children.push(child);}};nodes.push(node);return node;}};
}

test('cached thumbnail avoids image network and decoding errors evict it',async()=>{
 const removed=[],cache={get:async()=>new Blob(['png']),remove:async url=>removed.push(url),clear:async()=>true};
 const h=harness(index,'http:',cache),node=h.node();h.visible(node);await settle();
 assert.equal(node.children[0].src,'blob:test');assert.equal(h.requests.length,1);
 node.children[0].handlers.error();await settle();assert.deepEqual(removed,[file.url]);
});
test('manual clear during a fetch cannot silently repopulate the cache',async()=>{
 let deliver,puts=0;const cache={get:async()=>null,put:async()=>puts++,clear:async()=>true};
 const h=harness(index,'http:',cache,()=>new Promise(resolve=>deliver=resolve)),node=h.node();h.visible(node);await settle();
 await h.api.clearCache();deliver({ok:true,status:200,headers:new Headers({'Content-Type':'image/png'}),blob:async()=>new Blob(['png'],{type:'image/png'})});await settle();
 assert.equal(puts,0);assert.equal(node.children[0].src,'blob:test');
});
test('locked page discards pending cached data and clears its cache',async()=>{
 let deliver,cleared=false;const cache={get:()=>new Promise(resolve=>deliver=resolve),clear:async options=>{cleared=options.lock;}};
 const h=harness(index,'http:',cache),node=h.node();h.visible(node);await settle();h.api.lock();deliver(new Blob(['png']));await settle();
 assert.equal(cleared,true);assert.equal(node.children.length,0);
});

test('large cards bypass thumbnail storage and keep their direct URL',async()=>{
 let reads=0,writes=0;const cache={get:async()=>{reads++;return null;},put:async()=>writes++};
 const h=harness(index,'http:',cache),node=h.node('spell-a','card');h.visible(node);await settle();
 assert.equal(reads,0);assert.equal(writes,0);assert.equal(h.requests.length,1);
 assert.equal(node.children[0].width,384);assert.equal(node.children[0].src,file.url);
});

test('denied thumbnail locks art, clears storage and never falls back to an unauthenticated image',async()=>{
 for(const status of [401,403]){
  let cleared=false,cancelled=false;const cache={get:async()=>null,clear:async options=>{cleared=options.lock;}};
  const h=harness(index,'http:',cache,async()=>({status,body:{cancel:async()=>{cancelled=true;}}}));
  const node=h.node();h.visible(node);await settle();assert.equal(cleared,true);assert.equal(cancelled,true);assert.equal(node.children.length,0);
  const next=h.node();h.scan();await settle();assert.equal(h.observed.includes(next),false);
 }
});
test('network failure is shared and throttled; reconnect retries failed visible slots without reloading',async()=>{
 const h=harness(),a=h.node(),b=h.node();h.offline(true);h.scan();await settle();h.visible(a);h.visible(b);await settle();assert.equal(h.requests.length,1);assert.equal(h.images.length,0);
 const c=h.node();h.scan();await settle();h.visible(c);await settle();assert.equal(h.requests.length,1);
 h.offline(false);h.online();assert.equal(h.requests.length,1);h.visible(a);h.visible(b);h.visible(c);await settle();assert.equal(h.requests.length,2);assert.equal(h.images.length,3);
 h.scan();await settle();assert.equal(h.requests.length,2);
});
test('reconnect restores failed images but does not duplicate successful or detached slots',async()=>{
 const h=harness(),good=h.node(),bad=h.node(),gone=h.node();h.scan();await settle();h.visible(good);h.visible(bad);h.visible(gone);await settle();
 good.children[0].handlers.load();bad.children[0].handlers.error();gone.children[0].handlers.error();gone.isConnected=false;
 const count=h.observed.length;h.online();assert.equal(h.observed.length,count+1);assert.equal(h.observed.at(-1),bad);h.visible(bad);await settle();assert.equal(h.images.length,4);assert.equal(good.children.length,1);
});
test('decorative slots escape IDs, preserve roles and omit unsupported mechanics',()=>{
 const h=harness();const html=h.api.markup({id:'"><img onerror=bad>',kind:'spell',name:{ru:'Name'}});
 assert.match(html,/&quot;&gt;&lt;img/);assert.match(html,/aria-hidden="true"/);assert.doesNotMatch(html,/<img|Name|onclick/);assert.equal(h.api.markup({id:'m',kind:'mechanic'}),'');assert.match(h.api.markup({id:'a',kind:'item'},'evil'),/data-art-role="thumbnail"/);
});
test('offscreen slots make no requests; visible slots share one index and reserve intrinsic image size',async()=>{
 const h=harness(),a=h.node(),b=h.node();h.scan();await settle();assert.equal(h.observed.length,2);assert.equal(h.requests.length,0);
 h.visible(a);h.visible(b);await settle();assert.equal(h.requests.length,1);assert.equal(h.images.length,2);
 const image=a.children[0];assert.equal(image.alt,'');assert.equal(image.width,96);assert.equal(image.height,48);assert.equal(image.loading,'lazy');assert.equal(image.src,file.url);
 image.handlers.load();assert.ok(a.classes.has('skaz-art-loaded'));image.handlers.error();assert.equal(image.removed,true);assert.equal(a.classes.has('skaz-art-loaded'),false);
});
test('untrusted URLs and duplicate IDs fail closed without inserting external images',async()=>{
 for(const data of [{...index,entries:[...index.entries,...index.entries]},{...index,entries:[{...index.entries[0],files:{thumbnail:{...file,url:'https://tracking.invalid/a.png'},card:file}}]}]){
  const h=harness(data),node=h.node();h.visible(node);await settle();assert.equal(h.images.length,0);assert.equal(node.children.length,0);
 }
});
test('missing artwork, removed nodes and standalone file mode preserve fallback without fetching images',async()=>{
 const h=harness(),missing=h.node('unknown'),removed=h.node();removed.isConnected=false;h.visible(missing);h.visible(removed);await settle();assert.equal(h.images.length,0);
 const offline=harness(index,'file:');offline.node();offline.scan();await settle();assert.equal(offline.requests.length,0);assert.equal(offline.observed.length,0);
});

test('private art overrides even missing common art without entering the common cache',async()=>{
 let cacheReads=0;const h=harness(index,'http:',{get:async()=>{cacheReads++;},put:async()=>{throw Error('Private bytes entered shared cache');}},null,async()=>({size:123}));const node=h.node('missing-common');h.scan();h.visible(node);await settle();assert.equal(node.children[0].src,'blob:test');assert.equal(cacheReads,0);assert.equal(h.requests.length,0);
});
test('failed private read cannot show stale common art and scope refresh drops late results',async()=>{
 const denied=harness(index,'http:',null,null,async()=>{throw Error('Denied');});const n=denied.node();denied.scan();denied.visible(n);await settle();assert.equal(n.children.length,0);assert.equal(denied.requests.length,0);
 let finish;const h=harness(index,'http:',null,null,()=>new Promise(r=>finish=r));const node=h.node();h.scan();h.visible(node);await settle();h.api.refreshPrivate();finish({size:12});await settle();assert.equal(node.children.length,0);
});
test('spell fallback uses its school without trusting imported markup, including missing/failed art',()=>{
 const h=harness();const schools=['abjuration','conjuration','divination','enchantment','evocation','illusion','necromancy','transmutation'];
 for(const school of schools){const html=h.api.markup({id:'missing-"<',kind:'spell',spell:{school}});assert.ok(html.includes('data-ui-icon="school-'+school+'"'));assert.ok(html.includes('missing-&quot;&lt;'));assert.match(html,/aria-hidden="true"/);assert.doesNotMatch(html,/<img/);}
 for(const school of [null,'<script>','constructor'])assert.match(h.api.markup({id:'missing',kind:'spell',spell:{school}}),/school-unknown/);
 assert.match(h.api.markup({id:'beast',kind:'monster'}),/data-ui-icon="monster"/);
});
