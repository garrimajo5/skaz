import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reconstructTribalSpells} from '../scripts/catalog-tribal-spell-review.mjs';
const raw=readFileSync(new URL('../catalog/skt-tribal-spell-reconstruction-2014.json',import.meta.url),'utf8');
const input=JSON.parse(raw);
const saved=JSON.parse(readFileSync(new URL('../catalog/skt-tribal-spell-review-2014.json',import.meta.url),'utf8'));
test('explicit edits leave two conflicts instead of deleting spells to force two per tribe',()=>{
 const output=reconstructTribalSpells(input);
 assert.deepEqual(output.summary,{tribes:11,observedSpellEntries:33,candidateSpellEntries:24,primaryClaimEntries:22,tribesWithCountConflict:['Black Lion','Gray Wolf']});
 assert.deepEqual(output.rows.find(r=>r.tribe==='Black Lion').candidateSpells,['chill touch','feign death','revivify']);
 assert.deepEqual(output.rows.find(r=>r.tribe==='Gray Wolf').candidateSpells,['beast sense','moonbeam','speak with animals']);
 assert.ok(output.rows.every(r=>!r.accepted&&!r.automaticDeletion&&!r.automaticLearn&&r.canonicalId===null));
});
test('anchored insertion, full replacement and local overrides preserve the explicit errata scope',()=>{
 const rows=reconstructTribalSpells(input).rows;
 assert.deepEqual(rows.find(r=>r.tribe==='Griffon').candidateSpells,['beast sense','fly']);
 assert.deepEqual(rows.find(r=>r.tribe==='Sky Pony').candidateSpells,['gust of wind','witch bolt']);
 assert.deepEqual(rows.find(r=>r.tribe==='Black Raven').primaryOverrides.polymorph,{target:'self only; raven only'});
 assert.equal(rows.find(r=>r.tribe==='Blue Bear').status,'count-matches-only-full-primary-list-unverified');
});
test('report and source hashes are reproducible without mutating the observed spell lists',()=>{
 const before=structuredClone(input);const output=reconstructTribalSpells(input);
 output.inputSha256={'catalog/skt-tribal-spell-reconstruction-2014.json':createHash('sha256').update(raw.replace(/\r\n/g,'\n')).digest('hex')};
 assert.deepEqual(saved,output);assert.deepEqual(input,before);
 output.rows[1].primaryOverrides.polymorph.target='changed';assert.deepEqual(input,before);
});
test('unknown removal, duplicate insertion, missing anchor and mixed replacement fail rather than hiding source uncertainty',()=>{
 const mutations=[d=>d.tribes[0].remove.push('unknown spell'),d=>d.tribes[6].add[0].before='missing',d=>d.tribes[6].add[0].spell='fly',d=>d.tribes[7].remove.push('lightning bolt'),d=>d.tribes[1].primaryOverrides.unknown={target:'self'},d=>d.tribes[0].observedSpells.push('animate dead')];
 for(const mutate of mutations){const d=structuredClone(input);mutate(d);assert.throws(()=>reconstructTribalSpells(d));}
});
test('acceptance, missing tribes and untraceable secondary restrictions are rejected',()=>{
 for(const key of ['accepted','fullRulesVerified','automaticPatch']){const d=structuredClone(input);d[key]=true;assert.throws(()=>reconstructTribalSpells(d));}
 for(const mutate of [d=>d.tribes.pop(),d=>d.tribes[1].name=d.tribes[0].name,d=>d.secondaryOnlyRestrictions[0].spell='unknown']){const d=structuredClone(input);mutate(d);assert.throws(()=>reconstructTribalSpells(d));}
});
