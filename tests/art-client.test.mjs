import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../client/art.js',import.meta.url),'utf8');
const file={url:'/art/common/'+'a'.repeat(64)+'.png',width:96,height:48};
const index={schemaVersion:1,entries:[{id:'spell-a',files:{thumbnail:file,card:{...file,width:384,height:192}}}]};
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(data=index,protocol='http:'){
 const nodes=[],observed=[],requests=[],images=[];let mutation,visibility;
 const context=vm.createContext({location:{protocol},AbortSignal,queueMicrotask,fetch:async(...args)=>{requests.push(args);return {ok:true,json:async()=>data};},
  MutationObserver:class{constructor(fn){mutation=fn;}observe(){}},IntersectionObserver:class{constructor(fn){visibility=fn;}observe(node){observed.push(node);}unobserve(){}},
  document:{body:{},querySelectorAll:()=>nodes,createElement:()=>{const image={handlers:{},addEventListener(type,fn){this.handlers[type]=fn;},remove(){this.removed=true;}};images.push(image);return image;}}
 });vm.runInContext(source,context);
 const api=vm.runInContext('SkazArt',context);
 return {api,requests,images,observed,scan:()=>mutation(),visible:node=>visibility([{target:node,isIntersecting:true}]),node(id='spell-a',role='thumbnail'){const classes=new Set(),node={dataset:{skazArt:id,artRole:role},isConnected:true,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},classes,children:[],append(child){this.children.push(child);}};nodes.push(node);return node;}};
}
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
