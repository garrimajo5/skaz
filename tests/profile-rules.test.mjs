import test from 'node:test';
import assert from 'node:assert/strict';
import Rules from '../client/profile-rules.js';
const profile = () => ({stats:{abilities:{str:10,dex:31,con:10,int:10,wis:10,cha:10}},sheet:{level:21,counters:[{id:'counter-synthetic',current:8,max:7}]}});
test('manual deviations produce nonblocking diagnostics without rewriting values',()=>{
 const p=profile(),before=JSON.stringify(p),warnings=Rules.warnings(p);
 assert.deepEqual(warnings.map(w=>w.key),['ability:dex','level','counter:counter-synthetic']);
 assert.ok(warnings.every(w=>w.blocking===false&&w.acknowledged===false));assert.equal(JSON.stringify(p),before);
});
test('acknowledgement is optional and scoped to the exact value and ordinary limit',()=>{
 const p=profile();const [dex,level,counter]=Rules.warnings(p);
 p.stats.ruleAcknowledgements=[Rules.acknowledge(dex,'Personal decision')];
 p.sheet.ruleAcknowledgements=[Rules.acknowledge(level),Rules.acknowledge(counter)];
 assert.ok(Rules.warnings(p).every(w=>w.acknowledged));
 p.stats.abilities.dex=32;p.sheet.counters[0].max=6;
 assert.deepEqual(Rules.warnings(p).map(w=>w.acknowledged),[false,true,false]);
 p.sheet.counters[0].id='different-counter';assert.equal(Rules.warnings(p).at(-1).acknowledged,false);
});
test('removing agreement preserves a deviation and serialization preserves its provenance',()=>{
 const p=profile();p.stats.ruleAcknowledgements=[Rules.acknowledge(Rules.warnings(p)[0],'A note')];
 const restored=JSON.parse(JSON.stringify(p));assert.equal(Rules.warnings(restored)[0].note,'A note');
 restored.stats.ruleAcknowledgements=[];assert.equal(restored.stats.abilities.dex,31);assert.equal(Rules.warnings(restored)[0].acknowledged,false);
});
test('unrelated fields and another acknowledgement do not broaden an exception',()=>{
 const p=profile();p.sheet.ruleAcknowledgements=[Rules.acknowledge(Rules.warnings(p)[1])];
 p.sheet.counters.push({id:'another-counter',current:9,max:7});
 assert.deepEqual(Rules.warnings(p).map(w=>w.acknowledged),[false,true,false,false]);
});
test('negative or corrupt balances are technical errors even with fabricated agreement',()=>{
 for(const value of [-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1]){
  const p=profile();p.sheet.counters[0].current=value;assert.throws(()=>Rules.warnings(p),/Invalid resource/);
 }
});
test('invalid acknowledgement shape, duplicates, oversized text and forged facts are rejected',()=>{
 const row=Rules.acknowledge(Rules.warnings(profile())[0]);
 for(const value of [null,{},[row,row],[{...row,grantAccess:true}],[{...row,note:'x'.repeat(501)}],[{...row,key:'__proto__'}],[{...row,facts:'{}'}],[{...row,facts:row.facts.replace('31','32.5')}],[{...row,facts:row.facts.replace('ability:dex','level')}],Array(33).fill(row)])assert.throws(()=>Rules.validateAcknowledgements(value));
});
test('standard values and unknown fields do not manufacture deviations or default numbers',()=>{
 const p=profile();p.stats.abilities.dex=30;p.sheet.level=20;p.sheet.counters[0].current=0;
 assert.deepEqual(Rules.warnings(p),[]);assert.deepEqual(Rules.warnings(),[]);
 p.stats.abilities.dex=null;assert.deepEqual(Rules.warnings(p),[]);assert.equal(p.stats.abilities.dex,null);
});

test('changed facts clear an active agreement so reverting a value does not silently revive it',()=>{
 let p=profile();p.stats.ruleAcknowledgements=[Rules.acknowledge(Rules.warnings(p)[0],'Old agreement')];
 const before=JSON.stringify(p);assert.equal(Rules.warnings(Rules.reconcile(p))[0].acknowledged,true);assert.equal(JSON.stringify(p),before);
 p.stats.abilities.dex=32;p=Rules.reconcile(p);assert.deepEqual(p.stats.ruleAcknowledgements,[]);
 p.stats.abilities.dex=31;assert.equal(Rules.warnings(p)[0].acknowledged,false);
});
test('normalizing one agreement preserves unrelated agreement and all manual data',()=>{
 let p=profile();const [a,b,c]=Rules.warnings(p);p.stats.ruleAcknowledgements=[Rules.acknowledge(a)];p.sheet.ruleAcknowledgements=[Rules.acknowledge(b,'Level note'),Rules.acknowledge(c)];
 p.sheet.counters[0].max=6;p=Rules.reconcile(p);
 assert.equal(p.sheet.counters[0].current,8);assert.equal(p.sheet.counters[0].max,6);
 assert.deepEqual(Rules.warnings(p).map(w=>w.acknowledged),[true,true,false]);assert.equal(p.sheet.ruleAcknowledgements[0].note,'Level note');
});
test('proficiency is never extrapolated outside the supported 2014 level table',()=>{
 assert.deepEqual(Array.from({length:20},(_,i)=>Rules.proficiency(i+1)),[2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,6,6,6,6]);
 for(const level of [0,-1,21,Number.MAX_SAFE_INTEGER,1.5,NaN,null,undefined])assert.equal(Rules.proficiency(level),null);
});
test('counter adjustment preserves manual excess without allowing negative balances, unsafe arithmetic or mutation',()=>{
 const counter={id:'counter-synthetic',name:'Synthetic',current:8,max:7};
 assert.deepEqual(Rules.adjustCounter(counter,-1),{...counter,current:7});
 assert.deepEqual(Rules.adjustCounter(counter,1),{...counter,current:9});assert.equal(counter.current,8);
 assert.throws(()=>Rules.adjustCounter({...counter,current:0},-1));
 assert.throws(()=>Rules.adjustCounter({...counter,current:Number.MAX_SAFE_INTEGER},1));
 for(const delta of [0,2,-2,'1',NaN])assert.throws(()=>Rules.adjustCounter(counter,delta));
});


test('warning rendering escapes names and agreement notes and never requires agreement to save',()=>{
 const p=profile();p.sheet.counters[0].name='<script>alert(1)</script>';
 p.sheet.ruleAcknowledgements=Rules.warnings(p).filter(w=>!w.key.startsWith('ability:')).map(w=>Rules.acknowledge(w,'</textarea><script>bad</script>'));
 const html=Rules.render(Rules.warnings(p),true,p);
 assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
 assert.ok(!html.includes('required'));assert.ok(html.includes('data-rule-agree'));
 assert.throws(()=>Rules.validateAcknowledgements(p.sheet.ruleAcknowledgements,'stats'));
 assert.equal(Rules.requiresV15(p),true);
});
