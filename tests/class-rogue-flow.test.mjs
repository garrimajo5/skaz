import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {prepareRogue} from '../scripts/fixtures/rogue-commands.mjs';
import {environment,walk} from './helpers/advancement-dom.mjs';
test('Rogue form confirms baseline skills and Expertise and keeps the exact command after lost cookie HTTP reply',async t=>{
 const store=openStore(':memory:',{classAdvancement:true});prepareRogue(store);
 const context=store.read().context,user='rogue-owner',token='f'.repeat(64);
 store.access.apply({action:'bootstrap-owner',userId:user,displayName:'Synthetic rogue',campaignId:context.campaignId,characterId:context.characterId});
 const sessions={login(){},logout(){},authenticate:v=>v===token?user:null,check:v=>v===token?user:null};
 const app=createApp(store,{classAdvancement:true,sessions,publicOrigin:'https://fixture.invalid',individualWrites:true});let lost=false;
 app.prependListener('request',(req,res)=>{if(req.method==='POST'&&req.url==='/api/class-advancement/apply'){const end=res.end;res.end=function(body,...args){if(res.statusCode===200&&!lost){lost=true;return end.call(this,'{',...args);}return end.call(this,body,...args);};}});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{app.closeAllConnections();await new Promise(resolve=>app.close(resolve));store.close();});
 const call=async(path,body)=>{
  const r=await fetch('http://127.0.0.1:'+app.address().port+path,{signal:AbortSignal.timeout(5000),method:body?'POST':'GET',headers:{Origin:'https://fixture.invalid',cookie:'__Host-skaz-session='+token,'X-Skaz-Identity':user,'X-Skaz-View':'rogue-flow','X-Skaz-Client':'local-v1','Content-Type':'application/json'},...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
  const value=await r.json();if(!r.ok)throw Error(value.error||'HTTP '+r.status);return value;
 };
 const e=environment(),sent=[],editor=await e.mount(e.root,{newId:randomUUID,load:()=>call('/api/class-advancement/plan?classId=rogue'),preview:q=>call('/api/class-advancement/preview',q),send:body=>{sent.push(body);return call('/api/class-advancement/apply',body);}});t.after(()=>editor.destroy());



 const choose=(name,value)=>{const box=walk(e.root).find(n=>n.type==='checkbox'&&n.name===name&&(value===undefined||n.value===value));assert.ok(box,name);assert.equal(box.disabled,false);box.checked=true;box.emit('change');};
 for(const id of ['acrobatics','stealth','perception','investigation'])choose('rogue:6:expertise:baseline',id);
 choose('rogue:6:expertise:tools');for(const id of ['stealth','thieves-tools'])choose('rogue:6:expertise:previous',id);
 assert.equal(walk(e.root).find(n=>n.name==='rogue:6:expertise:new'&&n.value==='stealth').disabled,true);
 for(const id of ['acrobatics','perception'])choose('rogue:6:expertise:new',id);
 const review=walk(e.root).find(n=>n.tagName==='fieldset'&&n.children.some(c=>c.tagName==='legend'&&c.textContent.startsWith('Новые умения')));for(const box of review?walk(review).filter(n=>n.type==='checkbox'):[]){box.checked=true;box.emit('change');}
 await e.button('Проверить повышение').onclick();assert.equal(e.button('Подтвердить повышение').hidden,true);
 choose('rogue:6:expertise:confirmed');await e.button('Проверить повышение').onclick();assert.equal(e.button('Подтвердить повышение').hidden,false,e.status());const summary=walk(e.root).map(n=>n.textContent||'').join(' ');assert.match(summary,/Прежние удвоения: Скрытность; Воровские инструменты\. Новые: Акробатика; Внимательность/);assert.doesNotMatch(summary,/stealth|thieves-tools|acrobatics|perception/);await e.button('Подтвердить повышение').onclick();assert.equal(lost,true);assert.equal(store.read().characterSheet.level,6);await e.button('Повторить сохранение').onclick();assert.equal(sent[0],sent[1]);assert.equal(store.read().advancement.version,17);
});
