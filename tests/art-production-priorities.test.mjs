import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {productionPriorities} from '../scripts/art-production-priorities.mjs';import {bundledCatalog} from '../server/bundled-catalog.mjs';
const make=(id,kind,detail)=>({id,kind,ruleset:'5e-2014',[kind]:detail});
test('priority boundaries include fractional CR and unknown values never masquerade as low-level',()=>{
 const entries=[make('cantrip','spell',{level:0}),make('three','spell',{level:3}),make('four','spell',{level:4}),make('six','spell',{level:6}),make('small','monster',{challenge:'1/4'}),make('five','monster',{challenge:'5'}),make('six-m','monster',{challenge:'6'}),make('eleven','monster',{challenge:'11'}),make('unknown','monster',{}),make('invalid','monster',{challenge:'1/0'})];
 const report=productionPriorities(entries,{ruleset:'5e-2014',total:entries.length,statuses:{accepted:['cantrip']},errors:[]});const groups=Object.fromEntries(report.queues.map(q=>[q.id,q]));
 assert.equal(groups['spell-0-3'].total,2);assert.equal(groups['spell-0-3'].accepted,1);assert.deepEqual(groups['spell-0-3'].remaining,['three']);assert.equal(groups['monster-0-5'].total,2);assert.equal(groups['monster-6-10'].total,1);assert.equal(groups.unclassified.total,2);
 assert.throws(()=>productionPriorities(entries,{ruleset:'5e-2014',total:entries.length,statuses:{accepted:['absent']},errors:[]}),/identities/);
});
test('committed production queue matches every current art identity without counting drafts',()=>{
 const coverage=JSON.parse(readFileSync(new URL('../catalog/art-coverage.json',import.meta.url),'utf8'));const report=productionPriorities(bundledCatalog().bundle.entries,coverage);
 assert.deepEqual(report,JSON.parse(readFileSync(new URL('../catalog/art-production-priorities.json',import.meta.url),'utf8')));
 assert.equal(report.queues.reduce((n,q)=>n+q.remaining.length,0),coverage.uncovered.length);
 assert.deepEqual(report.queues.flatMap(q=>q.remaining).sort(),coverage.uncovered);
});
