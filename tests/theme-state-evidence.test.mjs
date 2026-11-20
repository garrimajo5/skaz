import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const evidence=JSON.parse(readFileSync(new URL('../docs/design/theme-state-audit-2026-11-17.json',import.meta.url)));
const report=n=>evidence.reports.find(r=>r.sequence===n);
test('theme evidence keeps measured UI state distinct from injected server mode',()=>{
 for(const n of [17,18,19])assert.match(report(n).controls.find(c=>c.id==='sync-history-chip').label,/Без сети/);
 assert.match(report(29).controls.find(c=>c.id==='sync-history-chip').label,/В очереди/);
 for(const n of [30,31])assert.match(report(n).controls.find(c=>c.id==='sync-history-chip').label,/Сохраняю/);
 for(const n of [21,24,27])assert.match(report(n).controls.find(c=>c.id==='sync-history-chip').label,/Нужен выбор/);
});
test('settings evidence preserves failed before and three selected after states',()=>{
 const choices=r=>r.controls.filter(c=>['Полярис','Уголь','Атлас'].includes(c.label));
 assert.equal(choices(report(2)).filter(c=>c.pressed==='true').length,0);
 for(const [n,label] of [[41,'Атлас'],[42,'Уголь'],[43,'Полярис']]){
  const selected=choices(report(n)).filter(c=>c.pressed==='true');assert.equal(selected.length,1);assert.equal(selected[0].label,label);assert.ok(selected[0].fill>=3);
 }
});
test('keyboard and resource claims retain measured pass while unresolved SVG remains manual',()=>{
 for(const n of [36,38,40]){const r=report(n);assert.equal(r.focus.visible,true);assert.equal(r.focus.pass,true);assert.deepEqual(r.focus.manual,[]);assert.ok(r.focus.ratio>=3);}
 for(const n of [32,33,34]){const r=report(n);assert.equal(r.resourceMarks.length,13);assert.ok(r.resourceMarks.every(m=>m.pass===true));assert.ok(r.icons.some(i=>i.pass===null));}
});
test('audit index covers every capture and all linked screenshot artifacts exist',()=>{
 assert.equal(evidence.synthetic,true);assert.equal(evidence.reports.length,43);
 assert.deepEqual(evidence.summary.map(s=>s.sequence),evidence.reports.map(r=>r.sequence));
 const md=readFileSync(new URL('../docs/design/theme-state-audit-2026-11-17.md',import.meta.url),'utf8');
 for(const [,path] of md.matchAll(/\]\((qa\/[^)]+\.png)\)/g))assert.ok(existsSync(new URL('../docs/design/'+path,import.meta.url)),path);
});
