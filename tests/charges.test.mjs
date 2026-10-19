import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
const entry=JSON.parse(readFileSync(new URL('../catalog/srd51-wands.json',import.meta.url),'utf8')).entries[0];
// The independent fixture deliberately has no links; linked-source transfer is covered elsewhere.
const fixture={...entry,links:[]};
const cmd=(s,fields)=>({mutationId:randomUUID(),expectedRevision:s.read().revision,...fields});
const quantity=(s,n)=>cmd(s,{characterId:s.read().context.characterId,catalogId:entry.id,quantity:n});
const charge=(s,operation='set',amount=5,unit=0)=>cmd(s,{characterId:s.read().context.characterId,catalogId:entry.id,unit,operation,amount});
function setup(file=':memory:'){const s=openStore(file);s.catalog.importEntries({schemaVersion:1,entries:[fixture]},{apply:true});s.addInventory(quantity(s,2));return s;}
const counts=s=>s.inventory().entries[0]?.chargeCounts;
const undo=(s,id)=>s.undoInventory(cmd(s,{characterId:s.read().context.characterId,targetMutationId:id}));
test('charges are unknown initially, independent per copy and never inferred from maximum',()=>{
 const s=setup();try{
 assert.equal(counts(s),undefined);assert.throws(()=>s.changeCharges(charge(s,'spend',1)),{status:422});
 s.changeCharges(charge(s));assert.deepEqual(counts(s),[5,null]);
 s.changeCharges(charge(s,'set',0,1));assert.deepEqual(counts(s),[5,0]);assert.equal(s.inventory().entries[0].quantity,2);
 s.changeCharges(charge(s,'spend',2));assert.deepEqual(counts(s),[3,0]);
 s.changeCharges(charge(s,'recover',4));assert.deepEqual(counts(s),[7,0]);
 s.changeCharges(charge(s,'unknown',null));assert.deepEqual(counts(s),[null,0]);
 s.changeCharges(charge(s,'unknown',null,1));assert.equal(counts(s),undefined);
 }finally{s.close();}
});
test('charges reject invalid commands atomically and replay exactly once',()=>{
 const s=setup();try{
 const request=charge(s);s.changeCharges(request);assert.equal(s.changeCharges(request).replayed,true);
 assert.throws(()=>s.changeCharges({...request,amount:4}),{status:409});
 assert.throws(()=>s.changeCharges({...request,mutationId:randomUUID()}),{status:409});
 const before=s.inventory(),history=s.history();
 for(const [operation,amount,unit] of [['set',8,0],['set',-1,0],['set',1.5,0],['set','1',0],['spend',6,0],['recover',3,0],['spend',0,0],['unknown',0,0],['set',2,2],['set',2,-1],['set',2,0.5],['auto',1,0],['set',5,0]])assert.throws(()=>s.changeCharges(charge(s,operation,amount,unit)),{status:422});
 assert.throws(()=>s.changeCharges({...charge(s),extra:1}),{status:400});
 assert.throws(()=>s.changeCharges({...charge(s),characterId:'other'}),{status:409});
 assert.throws(()=>s.changeCharges({...charge(s),catalogId:'missing:item'}),{status:404});
 assert.deepEqual(s.inventory(),before);assert.deepEqual(s.history(),history);
 }finally{s.close();}
});
test('adding unknown copies, removing from the end and undo preserve charge balances',()=>{
 const s=setup();try{
 s.changeCharges(charge(s));const second=charge(s,'set',2,1);s.changeCharges(second);undo(s,second.mutationId);assert.deepEqual(counts(s),[5,null]);
 s.changeCharges(charge(s,'set',2,1));s.addInventory(quantity(s,1));assert.deepEqual(counts(s),[5,2,null]);
 const removal=quantity(s,2);s.removeInventory(removal);assert.deepEqual(counts(s),[5]);undo(s,removal.mutationId);assert.deepEqual(counts(s),[5,2,null]);
 const all=quantity(s,3);s.removeInventory(all);assert.equal(s.inventory().entries.length,0);undo(s,all.mutationId);assert.deepEqual(counts(s),[5,2,null]);
 }finally{s.close();}
});
test('v7 transfers known, empty and unknown balances; older versions refuse lossy export',()=>{
 const s=setup(),target=openStore(':memory:');try{
 s.addInventory(quantity(s,1));s.changeCharges(charge(s));s.changeCharges(charge(s,'set',0,1));
 for(let v=2;v<=6;v++)assert.throws(()=>s.exportActive(v),{status:409});
 const file=s.exportActive(7),request=cmd(target,{destination:'new-campaign',file});target.importActive(request);
 assert.deepEqual(target.inventory().entries,s.inventory().entries);assert.equal(target.importActive(request).replayed,true);
 for(const invalid of [[5],[-1,0,null],[8,0,null],['5',0,null],[5,0,false],null]){
 const bad=structuredClone(file);bad.inventory[0].chargeCounts=invalid;const before=target.read();
 assert.throws(()=>target.importActive(cmd(target,{destination:'new-campaign',file:bad})),{status:422});assert.deepEqual(target.read(),before);
 }
 const old=structuredClone(file);old.schemaVersion=6;assert.throws(()=>target.importActive(cmd(target,{destination:'new-campaign',file:old})),{status:422});
 }finally{s.close();target.close();}
});
test('charge transaction rollback, reopen and backup preserve receipts and balances',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'skaz-charges-')),file=join(dir,'game.sqlite'),backup=join(dir,'backup.sqlite');let s=setup(file);const db=new DatabaseSync(file);
 try{
 const request=charge(s);db.exec("CREATE TRIGGER reject_charge BEFORE INSERT ON changes BEGIN SELECT RAISE(ABORT,'charge failure'); END");
 assert.throws(()=>s.changeCharges(request),/charge failure/);assert.equal(counts(s),undefined);assert.equal(s.read().revision,1);
 db.exec('DROP TRIGGER reject_charge');s.changeCharges(request);await s.backup(backup);s.close();s=openStore(file);assert.equal(s.changeCharges(request).replayed,true);assert.deepEqual(counts(s),[5,null]);
 const copy=openStore(backup);try{assert.deepEqual(copy.inventory(),s.inventory());}finally{copy.close();}
 }finally{db.close();s.close();}
});
test('charge HTTP writes use existing local guards and v7 is downloadable',async t=>{
 const s=setup(),app=createApp(s);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.close(r));s.close();});
 const base=`http://127.0.0.1:${app.address().port}`,body=JSON.stringify(charge(s)),headers={'Content-Type':'application/json','X-Skaz-Client':'local-v1'};
 assert.equal((await fetch(base+'/api/inventory/charges',{method:'POST',body,headers:{'Content-Type':'application/json'}})).status,403);
 assert.equal((await fetch(base+'/api/inventory/charges',{method:'POST',body,headers:{...headers,Origin:'https://other.example'}})).status,403);
 assert.equal((await fetch(base+'/api/inventory/charges',{method:'POST',body,headers})).status,200);
 const exported=await fetch(base+'/api/export/active-v7');assert.equal(exported.status,200);assert.match(exported.headers.get('content-disposition'),/v7/);assert.deepEqual((await exported.json()).inventory[0].chargeCounts,[5,null]);
});
