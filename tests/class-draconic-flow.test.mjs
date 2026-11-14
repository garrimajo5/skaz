import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {prepareDraconic} from '../scripts/fixtures/draconic-commands.mjs';
import {environment,walk} from './helpers/advancement-dom.mjs';
test('Draconic form requires both confirmations and keeps the same HP command after lost cookie HTTP reply',async t=>{
 const store=openStore(':memory:',{classAdvancement:true});prepareDraconic(store);
 const context=store.read().context,user='draconic-owner',token='f'.repeat(64);
 store.access.apply({action:'bootstrap-owner',userId:user,displayName:'Synthetic sorcerer',campaignId:context.campaignId,characterId:context.characterId});
 const sessions={login(){},logout(){},authenticate:v=>v===token?user:null,check:v=>v===token?user:null};
 const app=createApp(store,{classAdvancement:true,sessions,publicOrigin:'https://fixture.invalid',individualWrites:true});let lost=false;
 app.prependListener('request',(req,res)=>{if(req.method==='POST'&&req.url==='/api/class-advancement/apply'){const end=res.end;res.end=function(body,...args){if(res.statusCode===200&&!lost){lost=true;return end.call(this,'{',...args);}return end.call(this,body,...args);};}});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{app.closeAllConnections();await new Promise(resolve=>app.close(resolve));store.close();});
 const call=async(path,body)=>{
  const r=await fetch('http://127.0.0.1:'+app.address().port+path,{signal:AbortSignal.timeout(5000),method:body?'POST':'GET',headers:{Origin:'https://fixture.invalid',cookie:'__Host-skaz-session='+token,'X-Skaz-Identity':user,'X-Skaz-View':'draconic-flow','X-Skaz-Client':'local-v1','Content-Type':'application/json'},...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
  const value=await r.json();if(!r.ok)throw Error(value.error||'HTTP '+r.status);return value;
 };
 const e=environment(),sent=[],editor=await e.mount(e.root,{newId:randomUUID,load:()=>call('/api/class-advancement/plan?classId=sorcerer'),preview:q=>call('/api/class-advancement/preview',q),send:body=>{sent.push(body);return call('/api/class-advancement/apply',body);}});t.after(()=>editor.destroy());
 const ancestor=walk(e.root).find(n=>n.name==='sorcerer:2:confirm-draconic');assert.ok(ancestor);assert.equal(ancestor.value,'');ancestor.value='red';ancestor.emit('change');
 const review=walk(e.root).find(n=>n.tagName==='fieldset'&&n.children.some(c=>c.tagName==='legend'&&c.textContent.startsWith('Новые умения')));
 for(const box of review?walk(review).filter(n=>n.type==='checkbox'):[]){box.checked=true;box.emit('change');}
 // Sorcerer2 also chooses one new known spell.
 const known=walk(e.root).find(n=>n.name==='sorcerer:2:known-spells');
 if(known){known.value=known.children.find(n=>n.value)?.value;known.emit('change');}
 else {const data=await call('/api/class-advancement/plan?classId=sorcerer');const candidate=data.options['sorcerer:2:known-spells'][0].spellId;const box=walk(e.root).find(n=>n.type==='checkbox'&&n.value===candidate);assert.ok(box);box.checked=true;box.emit('change');}
 const check=e.button('Проверить повышение'),apply=e.button('Подтвердить повышение');
 await check.onclick();assert.equal(apply.hidden,true);
 const rules=walk(e.root).find(n=>n.name==='sorcerer:2:confirm-draconic:confirmed');rules.checked=true;rules.emit('change');await check.onclick();assert.equal(apply.hidden,true);
 const hp=walk(e.root).find(n=>n.name==='sorcerer:2:confirm-draconic:hpConfirmed');hp.checked=true;hp.emit('change');await check.onclick();assert.equal(apply.hidden,false,e.status());assert.ok(walk(e.root).some(n=>n.textContent.includes('В прибавку уже включён +1')));
 const before=await call('/api/workspace');await apply.onclick();assert.equal(lost,true);const after=await call('/api/workspace');assert.equal(after.characterSheet.level,2);assert.equal(after.state.maxHp,before.state.maxHp+7);assert.equal(after.state.hp,before.state.hp);
 await e.button('Повторить сохранение').onclick();assert.equal(sent[0],sent[1]);assert.equal((await call('/api/workspace')).state.maxHp,after.state.maxHp);
 const file=await call('/api/export/active-v14');const imported=await call('/api/import/active',{mutationId:randomUUID(),expectedRevision:after.revision,destination:'new-campaign',file});assert.deepEqual(imported.advancement,after.advancement);assert.equal(imported.state.maxHp,after.state.maxHp);
});
import {advancementView} from '../server/class-advancement-view.mjs';
import {buildAdvancementChange} from '../server/class-advancement.mjs';
for(const level of [2,9,16])test('Draconic '+level+' form retains ancestor and prior Metamagic during its next required choice',async()=>{
 const s=openStore(':memory:',{classAdvancement:true});prepareDraconic(s,level);
 const e=environment();let sent;
 const editor=await e.mount(e.root,{newId:randomUUID,load:async()=>advancementView(s.read(),'sorcerer',id=>s.catalog.lookup(new URLSearchParams({id})).entry),preview:async q=>buildAdvancementChange(s.read(),q).summary,send:async body=>{sent=JSON.parse(body);return s.advanceCharacter(sent);}});
 try{
  assert.ok(walk(e.root).some(n=>n.textContent.includes('Драконий предок: Красный')),e.status());
  const data=advancementView(s.read(),'sorcerer',id=>s.catalog.lookup(new URLSearchParams({id})).entry);
  for(const choice of data.plan.choices){if(!choice.required)continue;
   const options=choice.kind==='metamagic'?data.metamagicOptions[choice.id]:data.options[choice.id];
   if(!options)continue;
   for(const option of options.slice(0,choice.count)){const value=option.id||option.spellId;const box=walk(e.root).find(n=>n.type==='checkbox'&&n.value===value);assert.ok(box,value);box.checked=true;box.emit('change');}
  }
  const review=walk(e.root).find(n=>n.tagName==='fieldset'&&n.children.some(c=>c.tagName==='legend'&&c.textContent.startsWith('Новые умения')));for(const box of review?walk(review).filter(n=>n.type==='checkbox'):[]){box.checked=true;box.emit('change');}
  await e.button('Проверить повышение').onclick();assert.equal(e.button('Подтвердить повышение').hidden,false,e.status());await e.button('Подтвердить повышение').onclick();assert.ok(sent);assert.equal(s.read().advancement.version,13);assert.equal(s.read().advancement.metamagic.length,level===2?2:level===9?3:4);
 }finally{editor.destroy();s.close();}
});
