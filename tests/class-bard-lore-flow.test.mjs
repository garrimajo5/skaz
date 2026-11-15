import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {prepareLore} from '../scripts/fixtures/lore-commands.mjs';
import {environment,walk} from './helpers/advancement-dom.mjs';
test('Lore form confirms baseline skills and Expertise and keeps the exact command after lost cookie HTTP reply',async t=>{
 const store=openStore(':memory:',{classAdvancement:true});prepareLore(store);
 const context=store.read().context,user='lore-owner',token='f'.repeat(64);
 store.access.apply({action:'bootstrap-owner',userId:user,displayName:'Synthetic bard',campaignId:context.campaignId,characterId:context.characterId});
 const sessions={login(){},logout(){},authenticate:v=>v===token?user:null,check:v=>v===token?user:null};
 const app=createApp(store,{classAdvancement:true,sessions,publicOrigin:'https://fixture.invalid',individualWrites:true});let lost=false;
 app.prependListener('request',(req,res)=>{if(req.method==='POST'&&req.url==='/api/class-advancement/apply'){const end=res.end;res.end=function(body,...args){if(res.statusCode===200&&!lost){lost=true;return end.call(this,'{',...args);}return end.call(this,body,...args);};}});
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{app.closeAllConnections();await new Promise(resolve=>app.close(resolve));store.close();});
 const call=async(path,body)=>{
  const r=await fetch('http://127.0.0.1:'+app.address().port+path,{signal:AbortSignal.timeout(5000),method:body?'POST':'GET',headers:{Origin:'https://fixture.invalid',cookie:'__Host-skaz-session='+token,'X-Skaz-Identity':user,'X-Skaz-View':'lore-flow','X-Skaz-Client':'local-v1','Content-Type':'application/json'},...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});
  const value=await r.json();if(!r.ok)throw Error(value.error||'HTTP '+r.status);return value;
 };
 const e=environment(),sent=[],editor=await e.mount(e.root,{newId:randomUUID,load:()=>call('/api/class-advancement/plan?classId=bard'),preview:q=>call('/api/class-advancement/preview',q),send:body=>{sent.push(body);return call('/api/class-advancement/apply',body);}});t.after(()=>editor.destroy());


 const data=await call('/api/class-advancement/plan?classId=bard'),choose=(name,value)=>{const box=walk(e.root).find(n=>n.type==='checkbox'&&n.name===name&&n.value===value);assert.ok(box,name+' '+value);assert.equal(box.disabled,false);box.checked=true;box.emit('change');return box;};
 const subclass=walk(e.root).find(n=>n.name==='bard:3:subclass');subclass.value='bard-lore';subclass.emit('change');
 const expert=walk(e.root).find(n=>n.name==='bard:3:expertise'&&n.value==='arcana');assert.equal(expert.disabled,true);
 for(const id of ['persuasion','perception','performance'])choose('bard:3:lore-skills:baseline',id);
 assert.equal(walk(e.root).find(n=>n.name==='bard:3:lore-skills:bonus'&&n.value==='persuasion').disabled,true);
 for(const id of ['arcana','history','nature'])choose('bard:3:lore-skills:bonus',id);
 for(const id of ['arcana','history'])choose('bard:3:expertise',id);
 const confirmed=walk(e.root).find(n=>n.name==='bard:3:lore-skills:confirmed');
 const review=walk(e.root).find(n=>n.tagName==='fieldset'&&n.children.some(c=>c.tagName==='legend'&&c.textContent.startsWith('Новые умения')));for(const box of review?walk(review).filter(n=>n.type==='checkbox'):[]){box.checked=true;box.emit('change');}
 const spell=walk(e.root).find(n=>n.type==='checkbox'&&n.value===data.options['bard:3:known-spells'][0].spellId);spell.checked=true;spell.emit('change');
 const check=e.button('Проверить повышение'),apply=e.button('Подтвердить повышение');await check.onclick();assert.equal(apply.hidden,true);confirmed.checked=true;confirmed.emit('change');await check.onclick();assert.equal(apply.hidden,false,e.status());
 const before=await call('/api/workspace');await apply.onclick();assert.equal(lost,true);const after=await call('/api/workspace');assert.equal(after.characterSheet.level,3);assert.equal(after.advancement.version,15);assert.equal(after.classSkills.skills.find(o=>o.id==='arcana').modifier,5);assert.equal(after.state.hp,before.state.hp);
 await e.button('Повторить сохранение').onclick();assert.equal(sent[0],sent[1]);assert.deepEqual((await call('/api/workspace')).advancement,after.advancement);
 const file=await call('/api/export/active-v14'),imported=await call('/api/import/active',{mutationId:randomUUID(),expectedRevision:after.revision,destination:'new-campaign',file});assert.deepEqual(imported.advancement,after.advancement);assert.deepEqual(imported.classSkills,after.classSkills);
});
import {advancementView} from '../server/class-advancement-view.mjs';
import {buildAdvancementChange} from '../server/class-advancement.mjs';
import {loreCommand} from '../scripts/fixtures/lore-commands.mjs';
for(const level of [5,9])test('Lore '+level+' form preserves prior skills and submits the next additional choice',async()=>{
 const store=openStore(':memory:',{classAdvancement:true});prepareLore(store,level);const e=environment(),q=loreCommand(store);let sent;
 const editor=await e.mount(e.root,{newId:randomUUID,load:async()=>advancementView(store.read(),'bard',id=>store.catalog.lookup(new URLSearchParams({id})).entry),preview:async c=>buildAdvancementChange(store.read(),c).summary,send:async body=>{sent=JSON.parse(body);return store.advanceCharacter(sent);}});
 try{
  for(const [choice,selection]of Object.entries(q.choices))for(const value of Array.isArray(selection)?selection:selection.skillIds||selection.spellIds||[]){const box=walk(e.root).find(n=>n.type==='checkbox'&&n.value===value&&n.name===choice);assert.ok(box,value);assert.equal(box.disabled,false);box.checked=true;box.emit('change');}
  if(level===9){const old=walk(e.root).find(n=>n.name==='bard:10:expertise'&&n.value==='arcana');assert.equal(old.disabled,true);assert.equal(old.checked,false);}
  const review=walk(e.root).find(n=>n.tagName==='fieldset'&&n.children.some(c=>c.tagName==='legend'&&c.textContent.startsWith('Новые умения')));for(const box of review?walk(review).filter(n=>n.type==='checkbox'):[]){box.checked=true;box.emit('change');}
  await e.button('Проверить повышение').onclick();assert.equal(e.button('Подтвердить повышение').hidden,false,e.status());await e.button('Подтвердить повышение').onclick();assert.ok(sent);assert.equal(store.read().characterSheet.level,level+1);assert.equal(store.read().advancement.version,15);assert.deepEqual(store.read().advancement.lore.baseline.skillIds,['persuasion','perception','performance']);
 }finally{editor.destroy();store.close();}
});

test('Lore maximum-level reference keeps chosen skills and extra secrets readable without mutation controls',async()=>{
 const s=openStore(':memory:',{classAdvancement:true});prepareLore(s,20);const e=environment();const editor=await e.mount(e.root,{load:async()=>advancementView(s.read(),'bard',id=>s.catalog.lookup(new URLSearchParams({id})).entry),preview:async()=>assert.fail('read-only'),send:async()=>assert.fail('read-only')});try{assert.ok(walk(e.root).some(n=>n.textContent.includes('Сохранённые навыки Коллегии знаний')));assert.ok(walk(e.root).some(n=>n.textContent.includes('Компетентность10:')));assert.ok(walk(e.root).some(n=>n.textContent.includes('Дополнительные тайны6:')));assert.equal(e.button('Подтвердить повышение').hidden,true);}finally{editor.destroy();s.close();}
});
