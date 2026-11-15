import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {prepareFiend} from '../scripts/fixtures/fiend-commands.mjs';
import {environment,walk} from './helpers/advancement-dom.mjs';
test('Fiend form gates expanded spells and keeps the exact command after lost cookie HTTP reply',async t=>{
 const store=openStore(':memory:',{classAdvancement:true});prepareFiend(store);
 const context=store.read().context,user='fiend-owner',token='f'.repeat(64);
 store.access.apply({action:'bootstrap-owner',userId:user,displayName:'Synthetic warlock',campaignId:context.campaignId,characterId:context.characterId});
 const sessions={login(){},logout(){},authenticate:v=>v===token?user:null,check:v=>v===token?user:null};
 const app=createApp(store,{classAdvancement:true,sessions,publicOrigin:'https://fixture.invalid',individualWrites:true});let lost=false;
 app.prependListener('request',(req,res)=>{if(req.method==='POST'&&req.url==='/api/class-advancement/apply'){const end=res.end;res.end=function(body,...args){if(res.statusCode===200&&!lost){lost=true;return end.call(this,'{',...args);}return end.call(this,body,...args);};}});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{app.closeAllConnections();await new Promise(resolve=>app.close(resolve));store.close();});
 const call=async(path,body)=>{
  const r=await fetch('http://127.0.0.1:'+app.address().port+path,{signal:AbortSignal.timeout(5000),method:body?'POST':'GET',headers:{Origin:'https://fixture.invalid',cookie:'__Host-skaz-session='+token,'X-Skaz-Identity':user,'X-Skaz-View':'fiend-flow','X-Skaz-Client':'local-v1','Content-Type':'application/json'},...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
  const value=await r.json();if(!r.ok)throw Error(value.error||'HTTP '+r.status);return value;
 };
 const e=environment(),sent=[],editor=await e.mount(e.root,{newId:randomUUID,load:()=>call('/api/class-advancement/plan?classId=warlock'),preview:q=>call('/api/class-advancement/preview',q),send:body=>{sent.push(body);return call('/api/class-advancement/apply',body);}});t.after(()=>editor.destroy());

 const data=await call('/api/class-advancement/plan?classId=warlock'),options=data.options['warlock:2:known-spells'];
 const expanded=options.find(o=>o.expandedSource),spell=walk(e.root).find(n=>n.type==='checkbox'&&n.value===expanded.spellId),confirm=walk(e.root).find(n=>n.name==='warlock:2:confirm-fiend');
 assert.ok(spell);assert.ok(confirm);assert.equal(spell.disabled,true);await e.button('Проверить повышение').onclick();assert.equal(spell.disabled,true,'A failed preview must not enable gated spells');confirm.checked=true;confirm.emit('change');assert.equal(spell.disabled,false);
 spell.checked=true;spell.emit('change');const group=spell.parent.parent.parent;assert.ok(walk(group).some(n=>n.textContent==='Выбрано 1 из 1'));
 confirm.checked=false;confirm.emit('change');assert.equal(spell.checked,false);assert.equal(spell.disabled,true);assert.ok(walk(group).some(n=>n.textContent==='Выбрано 0 из 1'));
 confirm.checked=true;confirm.emit('change');spell.checked=true;spell.emit('change');
 for(const option of data.invocationOptions['warlock:2:invocations'].filter(o=>o.eligible).slice(0,2)){const box=walk(e.root).find(n=>n.type==='checkbox'&&n.value===option.id);box.checked=true;box.emit('change');}
 const review=walk(e.root).find(n=>n.tagName==='fieldset'&&n.children.some(c=>c.tagName==='legend'&&c.textContent.startsWith('Новые умения')));for(const box of review?walk(review).filter(n=>n.type==='checkbox'):[]){box.checked=true;box.emit('change');}
 const check=e.button('Проверить повышение'),apply=e.button('Подтвердить повышение');await check.onclick();assert.equal(apply.hidden,false,e.status());
 const before=await call('/api/workspace');await apply.onclick();assert.equal(lost,true);const after=await call('/api/workspace');assert.equal(after.characterSheet.level,2);assert.equal(after.advancement.version,14);assert.equal(after.state.hp,before.state.hp);assert.ok(after.advancement.spells.some(o=>o.catalogId===expanded.spellId&&o.expandedSource));
 await e.button('Повторить сохранение').onclick();assert.equal(sent[0],sent[1]);assert.deepEqual((await call('/api/workspace')).advancement,after.advancement);
 const file=await call('/api/export/active-v14'),imported=await call('/api/import/active',{mutationId:randomUUID(),expectedRevision:after.revision,destination:'new-campaign',file});assert.deepEqual(imported.advancement,after.advancement);assert.deepEqual(imported.spellbook,after.spellbook);
});
