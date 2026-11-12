import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../client/icons.js',import.meta.url),'utf8');
test('local sprite mounts once per slot, ignores foreign names and keeps symbols decorative',()=>{
 const nodes=[],holders=[];let observe;const document={body:{prepend:x=>holders.push(x)},createElement:()=>({setAttribute(){},innerHTML:''}),querySelectorAll:()=>nodes.filter(n=>!n.ready)};
 const ctx=vm.createContext({document,queueMicrotask:fn=>fn(),MutationObserver:class{constructor(fn){observe=fn;}observe(){}}});vm.runInContext(source,ctx);const api=vm.runInContext('SkazIcons',ctx);
 for(const name of api.names){let writes=0,html='';const node={ready:false,setAttribute(k,v){if(k==='data-icon-ready')this.ready=true;if(k==='aria-hidden')assert.equal(v,'true');},getAttribute:()=>name,set innerHTML(v){html=v;writes++;},get innerHTML(){return html;}};nodes.push(node);observe();observe();assert.equal(writes,1);assert.match(html,/aria-hidden="true" focusable="false"/);assert.ok(holders[0].innerHTML.includes('id="skaz-icon-'+name+'"'));}
 assert.equal(holders.length,1);for(const name of ['__proto__','constructor','<img onerror=alert(1)>','https://foreign/icon'])assert.equal(api.markup(name),'');
 const schoolNames=api.names.filter(n=>n.startsWith('school-'));assert.equal(schoolNames.length,9);assert.ok(!api.markup('school-evocation').includes('#skaz-icon-magic"'));
});
test('all shipped radius declarations use tokens or intentional circles and build includes local sprite',async()=>{
 for(const name of ['style','quick','catalog']){const css=await readFile(new URL('../client/'+name+'.css',import.meta.url),'utf8');for(const m of css.matchAll(/border-radius:([^;}]+)/g))assert.match(m[1],/^(?:(?:var\(--[a-z-]+\)|50%|999px)\s*)+$/,name+': '+m[1]);}
 const html=await readFile(new URL('../client/index.html',import.meta.url),'utf8');assert.ok(html.indexOf('src="icons.js"')<html.indexOf('src="art.js"'));assert.doesNotMatch(html,/[♙✧▣≋⚑◇▤⌕↶☾✎]/);
});
