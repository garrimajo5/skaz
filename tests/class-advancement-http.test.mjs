import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {templateStats} from '../server/character-stats.mjs';
async function fixture(t,{enabled=true,write=true}={}){
 const store=openStore(':memory:',{classAdvancement:enabled}),ctx=store.read().context,user='advance-http-user';
 const command=extra=>({mutationId:randomUUID(),expectedRevision:store.read().revision,characterId:ctx.characterId,...extra});
 store.saveCharacterStats(command({stats:structuredClone(templateStats)}));store.saveCharacterSheet(command({sheet:{ruleset:'5e-2014',ancestry:'',className:'fighter',subclass:'',level:1,counters:[]}}));
 store.access.apply({action:'bootstrap-owner',userId:user,displayName:'Test',campaignId:ctx.campaignId,characterId:ctx.characterId});
 let live=true;const token='a'.repeat(64),sessions={login(){},logout(){},authenticate:value=>live&&value===token?user:null,check:value=>live&&value===token?user:null};
 const app=createApp(store,{classAdvancement:enabled,sessions,publicOrigin:'https://fixture.invalid',individualWrites:write});await new Promise(r=>app.listen(0,'127.0.0.1',r));
 t.after(async()=>{app.closeAllConnections();await new Promise(r=>app.close(r));store.close();});
 const request=(path,body,headers={})=>fetch('http://127.0.0.1:'+app.address().port+path,{method:body?'POST':'GET',headers:{Origin:'https://fixture.invalid',cookie:'__Host-skaz-session='+token,'X-Skaz-Identity':user,'X-Skaz-View':'advance-http-window','X-Skaz-Client':'local-v1','Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
 return {store,request,command,revoke:()=>live=false};
}
const prefix='/api/class-advancement/';
test('scoped HTTP preview writes nothing, apply is atomic and exact retry is safe',async t=>{
 const f=await fixture(t),classes=await f.request(prefix+'classes');assert.equal(classes.status,200);assert.equal((await classes.json()).classes.length,12);
 const planResponse=await f.request(prefix+'plan?classId=fighter');assert.equal(planResponse.status,200);const plan=await planResponse.json();assert.equal(plan.fromLevel,1);
 const q=f.command({classId:'fighter',fromLevel:1,hpMethod:'fixed',hpRoll:null,choices:{},reviewedFeatures:plan.plan.requiresFeatureReview}),before=f.store.read();
 const preview=await f.request(prefix+'preview',q);assert.equal(preview.status,200);assert.equal((await preview.json()).hitPoints.maximumDelta,8);assert.deepEqual(f.store.read(),before);
 const saved=await f.request(prefix+'apply',q);assert.equal(saved.status,200);assert.equal((await saved.json()).characterSheet.level,2);
 assert.equal((await (await f.request(prefix+'apply',q)).json()).replayed,true);
 assert.equal((await f.request(prefix+'apply',{...q,hpMethod:'roll',hpRoll:10})).status,409);
 const exported=await f.request('/api/export/active-v13');assert.equal(exported.status,200);assert.equal((await exported.json()).advancement.level,2);
 assert.equal((await f.request('/api/export/active-v12')).status,409);
 f.revoke();assert.equal((await f.request(prefix+'apply',q)).status,401);
});
test('HTTP binding and advancement preserve origin, identity, readonly and explicit capability checks',async t=>{
 const f=await fixture(t,{write:false}),plan=await (await f.request(prefix+'plan?classId=fighter')).json();
 const q=f.command({classId:'fighter',fromLevel:1,hpMethod:'fixed',hpRoll:null,choices:{},reviewedFeatures:plan.plan.requiresFeatureReview});
 assert.equal((await f.request(prefix+'apply',q)).status,403);
 const binding=f.command({classId:'fighter',bindings:[],create:['class-fighter-second-wind']});assert.equal((await f.request(prefix+'bind',binding)).status,403);
 assert.equal((await f.request(prefix+'preview',q,{'X-Skaz-Client':''})).status,403);
 assert.equal((await f.request(prefix+'classes',null,{Origin:'https://evil.invalid'})).status,403);
 assert.equal((await f.request(prefix+'classes',null,{'X-Skaz-Identity':'other-user'})).status,401);
 assert.equal((await f.request(prefix+'plan?classId=fighter&classId=wizard')).status,422);
 assert.equal((await f.request(prefix+'plan?classId=unknown')).status,422);
 const disabled=await fixture(t,{enabled:false});assert.equal((await disabled.request(prefix+'classes')).status,404);assert.equal((await disabled.request('/api/export/active-v13')).status,404);
 assert.throws(()=>createApp(disabled.store,{classAdvancement:true}),/совместимого/);
});


test('enabled authenticated shell serves every advancement module and disabled mode hides capability',async t=>{
 const enabled=await fixture(t),disabled=await fixture(t,{enabled:false});
 const html=await (await enabled.request('/')).text();
 assert.match(html,/data-class-advancement="enabled"/);
 for(const name of ['class-advancement-transport.js','class-advancement.js','class-advancement-shell.js']){
  assert.ok(html.includes(name));const response=await enabled.request('/'+name);
  assert.equal(response.status,200,name);assert.match(response.headers.get('content-type'),/javascript/);
 }
 assert.doesNotMatch(await(await disabled.request('/')).text(),/data-class-advancement="enabled"/);
});

test('HTTP class help is read-only and translated labels cannot replace stable receipt keys',async t=>{
 const f=await fixture(t),before=f.store.read();
 const response=await f.request(prefix+'plan?classId=fighter');assert.equal(response.status,200);const {plan}=await response.json();
 assert.deepEqual(f.store.read(),before);
 assert.equal(plan.featureDetails.find(d=>d.key==='Action Surge (one use)').name,'Всплеск действий');
 assert.ok(plan.priorFeatureDetails.some(d=>d.key==='Second Wind'));
 const q=f.command({classId:'fighter',fromLevel:1,hpMethod:'fixed',hpRoll:null,choices:{},reviewedFeatures:['Всплеск действий']});
 assert.equal((await f.request(prefix+'preview',q)).status,422);assert.deepEqual(f.store.read(),before);
 q.reviewedFeatures=['Action Surge (one use)'];assert.equal((await f.request(prefix+'apply',q)).status,200);
 const exported=await (await f.request('/api/export/active-v13')).json();
 assert.deepEqual(exported.advancement.events[0].featuresReviewed,['Action Surge (one use)']);
 assert.ok(!JSON.stringify(exported.advancement).includes('featureDetails'));
});


test('HTTP style choices are class-specific, mandatory, persistent and read-only in previews',async t=>{
 const f=await fixture(t);
 f.store.saveCharacterSheet(f.command({sheet:{ruleset:'5e-2014',ancestry:'',className:'paladin',subclass:'',level:1,counters:[]}}));
 const before=f.store.read(),response=await f.request(prefix+'plan?classId=paladin');assert.equal(response.status,200);const view=await response.json();
 assert.deepEqual(view.styleOptions['paladin:2:fighting-style'].map(s=>s.id),['defense','dueling','great-weapon-fighting','protection']);
 assert.equal(view.styleOptions['paladin:2:fighting-style'][0].name,'Оборона');assert.deepEqual(view.selectedStyles,[]);
 const q=f.command({classId:'paladin',fromLevel:1,hpMethod:'fixed',hpRoll:null,choices:{'paladin:2:fighting-style':['defense']},reviewedFeatures:view.plan.requiresFeatureReview});
 for(const invalid of [[],['archery'],['Оборона'],['defense','dueling'],null,'defense']){
  const bad={...q,choices:{'paladin:2:fighting-style':invalid}};
  assert.equal((await f.request(prefix+'preview',bad)).status,422);assert.equal((await f.request(prefix+'apply',bad)).status,422);assert.deepEqual(f.store.read(),before);
 }
 assert.equal((await f.request(prefix+'preview',q)).status,200);assert.deepEqual(f.store.read(),before);
 const saved=await(await f.request(prefix+'apply',q)).json();assert.equal(saved.characterSheet.level,2);assert.equal(saved.advancement.styles[0].id,'defense');assert.deepEqual(saved.characterStats,before.characterStats);
 const next=await(await f.request(prefix+'plan?classId=paladin')).json();assert.equal(next.selectedStyles[0].name,'Оборона');assert.deepEqual(next.styleOptions,{});assert.ok(next.plan.choices.some(c=>c.kind==='subclass'));
 assert.equal((await(await f.request(prefix+'apply',q)).json()).replayed,true);
 assert.equal((await f.request(prefix+'apply',{...q,choices:{'paladin:2:fighting-style':['dueling']}})).status,409);
 const exported=await(await f.request('/api/export/active-v13')).json();assert.equal(exported.advancement.version,2);assert.equal(exported.advancement.styles[0].sourcePage,31);
});


test('HTTP metamagic preview and save preserve chosen IDs while unknown prior choices stay blocked',async t=>{
 const f=await fixture(t);f.store.catalog.installBundled({version:f.store.catalog.previewBundled().version});
 f.store.saveCharacterSheet(f.command({sheet:{ruleset:'5e-2014',ancestry:'',className:'sorcerer',subclass:'',level:2,counters:[]}}));
 const view=await(await f.request(prefix+'plan?classId=sorcerer')).json(),key='sorcerer:3:metamagic';assert.equal(view.metamagicOptions[key].length,8);
 const choices={[key]:['careful-spell','twinned-spell']};for(const c of view.plan.choices)if(c.required&&c.kind!=='metamagic')choices[c.id]=view.options[c.id].slice(0,c.count).map(s=>s.spellId);
 const q=f.command({classId:'sorcerer',fromLevel:2,hpMethod:'fixed',hpRoll:null,choices,reviewedFeatures:view.plan.requiresFeatureReview}),before=f.store.read();
 assert.equal((await f.request(prefix+'preview',q)).status,200);assert.deepEqual(f.store.read(),before);
 assert.equal((await f.request(prefix+'apply',{...q,choices:{...choices,[key]:['careful-spell']}})).status,422);assert.deepEqual(f.store.read(),before);
 const saved=await(await f.request(prefix+'apply',q)).json();assert.equal(saved.advancement.version,3);assert.equal(saved.advancement.metamagic.length,2);assert.equal((await(await f.request(prefix+'apply',q)).json()).replayed,true);
 const next=await(await f.request(prefix+'plan?classId=sorcerer')).json();assert.equal(next.selectedMetamagic.length,2);assert.deepEqual(next.metamagicOptions,{});
 const baseline=await fixture(t);baseline.store.saveCharacterSheet(baseline.command({sheet:{ruleset:'5e-2014',ancestry:'',className:'sorcerer',subclass:'',level:9,counters:[]}}));baseline.store.catalog.installBundled({version:baseline.store.catalog.previewBundled().version});
 const blocked=await(await baseline.request(prefix+'plan?classId=sorcerer')).json();assert.deepEqual(blocked.metamagicOptions,{});assert.match(blocked.choiceNotices['sorcerer:10:metamagic'],/не подтверждены/);
});
