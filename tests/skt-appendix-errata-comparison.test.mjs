import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const raw=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const d=JSON.parse(raw('catalog/skt-appendix-errata-comparison-2014.json'));
const scope=JSON.parse(raw('catalog/scope-register-2014.json'));
const row=id=>d.records.find(x=>x.observationId==='dndsu:bestiary:'+id);
test('appendix evidence preserves five observations and cannot silently patch or accept whole versions',()=>{
 assert.equal(d.records.length,5);assert.equal(new Set(d.records.map(x=>x.observationId)).size,5);
 assert.equal(d.accepted,false);assert.equal(d.complete,false);assert.equal(d.approvedDenominator,null);
 assert.equal(d.inputSha256['catalog/scope-register-2014.json'],createHash('sha256').update(raw('catalog/scope-register-2014.json').replace(/\r\n/g,'\n')).digest('hex'));
 for(const r of d.records){const o=scope.records.find(x=>x.id===r.observationId);
  assert.equal(r.observedName,o.names.en);assert.deepEqual(r.observedSourceIds,o.sourceIds);assert.equal(r.secondaryUrl,o.url);
  for(const flag of ['accepted','wholeStatBlockCompared','fullRulesVerified','automaticPatch'])assert.equal(r[flag],false);
  assert.equal(r.canonicalId,null);assert.equal(r.primaryLocator.pdfPage,3);
 }
});
test('component waivers and unstated frequency are not collapsed into stronger casting permissions',()=>{
 assert.equal(row(5601).selectedMatches.componentRequirement,'none');
 assert.equal(row(5601).selectedMatches.limitedSpellFrequency,'1/day each');
 assert.equal(row(5601).selectedMatches.spells.length,5);
 assert.equal(row(5605).selectedMatches.componentRequirement,'no-material-components');
 assert.equal(row(5605).selectedMatches.frequencyNotStated,true);
 assert.equal(row(5605).selectedMatches.limitedSpellFrequency,undefined);
 assert.equal(row(5606).selectedMatches.requiresSacredBundle,true);
 assert.deepEqual(row(5606).selectedMatches.oneActionSpells,['augury']);
});
test('updated Tressym and Crag Cat metadata do not mask the mixed-version shaman findings',()=>{
 assert.deepEqual(row(5477).selectedMatches,{creatureType:'monstrosity',walkFeet:40,climbFeet:30});
 assert.deepEqual(row(6402).selectedMatches,{creatureType:'monstrosity',alignment:'any'});
 const shaman=row(5606);assert.equal(shaman.selectedMatches.alignment,undefined);
 const diff=f=>shaman.differences.find(x=>x.field===f);
 assert.deepEqual(diff('alignment'),{field:'alignment',primary:'any',observed:'neutral evil'});
 assert.deepEqual(diff('tribalSpells.SkyPony').primary,['gust of wind','witch bolt']);
 assert.deepEqual(diff('tribalSpells.SkyPony').observed,['divine favor','feather fall','lightning bolt']);
 assert.match(diff('tribalSpells.BlackRaven.polymorph.target').primary,/self only/);
 assert.equal(shaman.differences.length,13);
 assert.equal(diff('tribalSpells.Elk.expeditiousRetreat').primary,'removed');
 assert.equal(diff('tribalSpells.castingTimeOverride').primary,'all listed spells cast as 1 action');
 assert.deepEqual(row(5601).differences,[{field:'changeShape.placement',primary:'action option',observed:'trait before Actions heading'}]);
 assert.equal(d.records.filter(x=>x.result==='selected-conditions-match-errata-v2').length,3);
});
