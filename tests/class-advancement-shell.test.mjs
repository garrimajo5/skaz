import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
class Element{constructor(tag){this.tagName=tag;this.children=[];this.isConnected=true;this.value='';}append(...items){this.children.push(...items);}replaceChildren(){this.children=[];}setAttribute(){}}
function fixture({late=false}={}){
 let current={identity:'user',viewId:'window',characterId:'hero',sessionId:'session'},watch,release,options,disposed=0,refreshed=0,reloaded=0,finish;
 const root=new Element('div'),dialog={open:true},transport={classes:()=>late?new Promise(r=>finish=r):Promise.resolve({ready:true,level:3,classId:null,classes:[{slug:'fighter',name:{ru:'Воин'}}]}),plan:async()=>({}),preview:async()=>({}),send:async()=>({}),destroy(){disposed++;}};
 const context=vm.createContext({SkazStorage:{advancementScope:()=>current,refreshAfterAdvancement:async()=>{refreshed++;},reloadAfterArtTransfer:async()=>{reloaded++;dialog.open=false;}},SkazClassAdvancementTransport:{create:()=>transport},SkazPrivateExit:{register:()=>()=>{}},SkazPersonalArtSession:{register:fn=>{release=fn;return ()=>{};}},SkazClassAdvancement:{mount:async(host,o)=>{options=o;return {destroy(){},pending:false};}},MutationObserver:class{constructor(fn){watch=fn;}observe(){}},document:{body:{},createElement:t=>new Element(t),getElementById:id=>id==='dialog'?dialog:root,addEventListener(){}},modal(){},toast(){}});
 vm.runInContext(readFileSync(new URL('../client/class-advancement-shell.js',import.meta.url),'utf8'),context);
 return {api:vm.runInContext('SkazClassAdvancementShell',context),root,dialog,get options(){return options;},get disposed(){return disposed;},get refreshed(){return refreshed;},get reloaded(){return reloaded;},change(){current={...current,characterId:'other'};},close(){dialog.open=false;watch();},sweep:()=>watch(),lock:()=>release(),finish:()=>finish({ready:true,level:3,classes:[]}),async choose(){root.children.find(n=>n.tagName==='label').children[0].value='fighter';await root.children.find(n=>n.tagName==='button').onclick();}};
}
test('closing after an attempted mutation refreshes the hero without resending the command',async()=>{
 const f=fixture();await f.api.open();await f.choose();await f.options.send('{}','bind');f.close();assert.equal(f.disposed,1);assert.equal(f.refreshed,1);f.sweep();assert.equal(f.refreshed,1);
});
test('successful advancement reloads once while changing hero or locking the session clears the dialog',async()=>{
 const f=fixture();await f.api.open();await f.choose();await f.options.send('{}','advance');await f.options.onSaved({});f.sweep();assert.equal(f.reloaded,1);assert.equal(f.refreshed,0);assert.equal(f.disposed,1);
 const changed=fixture();await changed.api.open();await changed.choose();await changed.options.send('{}','advance');changed.change();changed.sweep();assert.equal(changed.refreshed,0);assert.equal(changed.disposed,1);
 const locked=fixture();await locked.api.open();locked.lock();assert.equal(locked.disposed,1);
});
test('closing during class loading prevents late controls from reappearing',async()=>{
 const f=fixture({late:true}),work=f.api.open();f.close();f.finish();await work;assert.equal(f.root.children.length,0);assert.equal(f.disposed,1);assert.equal(f.refreshed,0);
});
