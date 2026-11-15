import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {preparePrimal} from '../scripts/fixtures/primal-commands.mjs';
import {environment,walk} from './helpers/advancement-dom.mjs';
test('Primal form shows the automatic capstone and keeps the exact command after lost cookie HTTP reply',async t=>{
 const store=openStore(':memory:',{classAdvancement:true});preparePrimal(store);
 const context=store.read().context,user='primal-owner',token='f'.repeat(64);
 store.access.apply({action:'bootstrap-owner',userId:user,displayName:'Synthetic barbarian',campaignId:context.campaignId,characterId:context.characterId});
 const sessions={login(){},logout(){},authenticate:v=>v===token?user:null,check:v=>v===token?user:null};
 const app=createApp(store,{classAdvancement:true,sessions,publicOrigin:'https://fixture.invalid',individualWrites:true});let lost=false;
 app.prependListener('request',(req,res)=>{if(req.method==='POST'&&req.url==='/api/class-advancement/apply'){const end=res.end;res.end=function(body,...args){if(res.statusCode===200&&!lost){lost=true;return end.call(this,'{',...args);}return end.call(this,body,...args);};}});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{app.closeAllConnections();await new Promise(resolve=>app.close(resolve));store.close();});
 const call=async(path,body)=>{
  const r=await fetch('http://127.0.0.1:'+app.address().port+path,{signal:AbortSignal.timeout(5000),method:body?'POST':'GET',headers:{Origin:'https://fixture.invalid',cookie:'__Host-skaz-session='+token,'X-Skaz-Identity':user,'X-Skaz-View':'primal-flow','X-Skaz-Client':'local-v1','Content-Type':'application/json'},...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
  const value=await r.json();if(!r.ok)throw Error(value.error||'HTTP '+r.status);return value;
 };
 const e=environment(),sent=[],editor=await e.mount(e.root,{newId:randomUUID,load:()=>call('/api/class-advancement/plan?classId=barbarian'),preview:q=>call('/api/class-advancement/preview',q),send:body=>{sent.push(body);return call('/api/class-advancement/apply',body);}});t.after(()=>editor.destroy());


 const review=walk(e.root).find(n=>n.tagName==='fieldset'&&n.children.some(c=>c.tagName==='legend'&&c.textContent.startsWith('Новые умения')));for(const box of walk(review).filter(n=>n.type==='checkbox')){box.checked=true;box.emit('change');}
 await e.button('Проверить повышение').onclick();assert.equal(e.button('Подтвердить повышение').hidden,false,e.status());assert.ok(walk(e.root).some(n=>n.textContent.includes('Первобытный чемпион: Сила')));assert.ok(walk(e.root).some(n=>n.textContent.includes('∞ — неограниченно')));const before=await call('/api/workspace');await e.button('Подтвердить повышение').onclick();assert.equal(lost,true);const after=await call('/api/workspace');assert.equal(after.characterSheet.level,20);assert.equal(after.advancement.version,16);assert.equal(after.state.maxHp,before.state.maxHp+49);assert.equal(after.state.hp,before.state.hp);await e.button('Повторить сохранение').onclick();assert.equal(sent[0],sent[1]);assert.equal((await call('/api/workspace')).state.maxHp,after.state.maxHp);const file=await call('/api/export/active-v14'),r=await call('/api/import/active',{mutationId:randomUUID(),expectedRevision:after.revision,destination:'new-campaign',file});assert.deepEqual(r.advancement,after.advancement);assert.deepEqual(r.unlimitedResources,after.unlimitedResources);
});
